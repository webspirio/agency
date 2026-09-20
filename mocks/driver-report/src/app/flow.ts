// mocks/driver-report/src/app/flow.ts
/** A driver flow: an ordered list of named steps on ONE route (§2.2 «Steps are state, not routes»).
 *
 *  - Opening a flow mints its seq, idempotency key and `occurred_at` into a draft at once (D11, EC-137), in
 *    `server.phone(DEVICE_ID).drafts`, and MERGES `{ step, draftId, depth }` into the history state of the entry
 *    that opened it — merges, not replaces: whatever the host put there is its own and is carried through (see
 *    `hostState`). Every retry, repeat tap and resume reuses that key, so the server can dedupe on it.
 *  - Each step change pushes a history entry with the SAME pathname: the URL never names a step, and Android Back (or a
 *    mouse's back button) walks back one step with its answers intact (EC-159). The draft follows the step shown, so
 *    home's «Продовжимо: …» resumes where the thumb left it.
 *  - Back on the first step leaves the flow; the draft stays. `commit` enqueues the record, deletes the draft and
 *    replaces the entry with home. A later `popstate` into an entry whose draft is gone finds nothing to resume and
 *    goes home with `replace`: Back never re-enters a committed flow.
 *
 *  The history state is `{ step, draftId, depth }`. `depth` counts the entries of this flow below this one (0 on the
 *  entry that opened or resumed it); it is what lets `back()` step back inside the flow without walking out of it. A
 *  state that carries only `{ step, draftId }` (home resuming a draft) reads as depth 0. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { server } from '../api/server';
import type { PageIn, RecordIn } from '../domain/dto';
import { cmpNum, gt } from '../domain/num';
import type { Instant } from '../domain/types';
import { DEVICE_ID } from './device';
import { useServerValue } from './live';
import { enqueue, type ReceiptMeta } from './outbox';
import { recordKey, type CapturedPage } from './records';

export type FlowKind = 'shift-start' | 'arrive' | 'loaded' | 'unloaded' | 'later' | 'refuel' | 'refuel-later'
  | 'stand' | 'elsewhere' | 'shift-end' | 'retake' | 'segment';
/** `path` is the pathname the flow was opened on: home's «Продовжимо» resumes a draft with
 *  `navigate(draft.path, { state: { step: draft.step, draftId: draft.id } })`. `stop_id` alone cannot rebuild every
 *  route — a retake lives at /request/:requestId and a put-off receipt at /refuel/:recordKey/later. */
export type Draft = { id: string; flow: FlowKind; stop_id: string | null; seq: number; key: string;
  occurred_at: Instant; step: string; data: Record<string, unknown>; pages: CapturedPage[]; created_wall: number;
  label: string; path: string };
export type FlowApi<S extends string> = { step: S; index: number; total: number; draft: Draft;
  go(step: S): void; back(): void; patch(data: Record<string, unknown>): void; addPage(p: CapturedPage): void;
  replacePage(index: number, p: CapturedPage): void; setPages(p: CapturedPage[]): void;
  commit(input: { record: RecordIn; pages: PageIn[]; receipt: ReceiptMeta | null }): void; leave(): void };

type StepState = { step: string; draftId: string; depth: number };

/** The flow's part of a history entry's state, or `null` when the entry was pushed without one (a fresh open). */
function stepState(raw: unknown): StepState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { step, draftId, depth } = raw as Record<string, unknown>;
  if (typeof step !== 'string' || typeof draftId !== 'string') return null;
  return { step, draftId, depth: typeof depth === 'number' && Number.isInteger(depth) && gt(depth, 0) ? depth : 0 };
}

/** EVERYTHING IN THE ENTRY'S STATE THAT IS NOT THE FLOW'S. A flow owns three keys — `step`, `draftId`, `depth` —
 *  and it used to write exactly those three OVER whatever else the entry carried. Measured by W3-05 in a browser:
 *  «Що зараз?» opens as `navigate('/', { state: { panel: 'segment' } })` — D-05 is a PANEL, so a pasted link can
 *  never drop anybody into it — the panel mounts, and the opening effect below then replaced that state with the
 *  three flow keys. `panel` was gone, home re-rendered home, the panel unmounted, and every tap left an orphan
 *  «Продовжимо: Що зараз?» card. One of the twenty-one driver screens could not be shown in the built app.
 *
 *  Wave 2's cross-page contracts ride on the same state (`ArriveContext`, the loading's `noDoc`), so carrying the
 *  rest through is what a flow owed its host all along. `commit` and `leave` still navigate away with NO state,
 *  which is what closes the panel. */
function hostState(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return {};
  const { step: _step, draftId: _draftId, depth: _depth, ...rest } = raw as Record<string, unknown>;
  return rest;
}

/* ── the drafts ───────────────────────────────────────────────────── */

/** Drafts live beside the outbox on the server, so a phone iframe the stage reloads keeps them. A draft is replaced,
 *  never mutated; the `drafts` object itself is edited in place because another realm may hold it. Every change emits
 *  the phone's `outbox` event: home's «Продовжимо» card and an open flow re-read on it. */
function writeDraft(deviceId: string, id: string, next: Draft | null): void {
  const drafts = server.phone(deviceId).drafts;
  if (next === null) delete drafts[id];
  else drafts[id] = next;
  server.emit({ type: 'outbox', device_id: deviceId });
}

function patchDraft(deviceId: string, id: string, change: (d: Draft) => Partial<Draft>): void {
  const cur = server.phone(deviceId).drafts[id];
  if (cur !== undefined) writeDraft(deviceId, id, { ...cur, ...change(cur) });
}

/** Every draft the phone holds, oldest first: home's «Продовжимо» cards. */
export function openDrafts(deviceId: string): Draft[] {
  return Object.values(server.phone(deviceId).drafts).sort((a, b) => cmpNum(a.seq, b.seq));
}

/** «Відкинути»: the draft goes; the seq it minted stays spent. */
export function discardDraft(deviceId: string, draftId: string): void {
  if (server.phone(deviceId).drafts[draftId] !== undefined) writeDraft(deviceId, draftId, null);
}

/** The draft each fresh history entry opened, by the entry's `location.key`: a render React repeats (StrictMode, a
 *  transition it restarts) finds its draft again instead of minting a second key. */
const openedBy = new Map<string, string>();

/** The remembered draft of this entry, or nothing. A remembered id is only as good as its draft: `location.key` is
 *  unique per entry in a browser, but a memory router keys its FIRST entry with the literal string 'default', so
 *  every flow the page harness opens through `renderAt` asks about the same key. Once the phone has been rebuilt
 *  (a stage reset, `atBeat`) the draft that key names is gone, and handing the id back anyway makes the flow read
 *  «gone» and redirect home one frame after it paints — which made the ORDER of tests inside a file load-bearing.
 *  A draft that has since been re-minted for a different flow is not this entry's either. */
function remembered(entryKey: string, opts: { flow: FlowKind; stopId?: string | null }): string | null {
  const known = openedBy.get(entryKey);
  if (known === undefined) return null;
  const draft = server.phone(DEVICE_ID).drafts[known];
  if (draft !== undefined && draft.flow === opts.flow && draft.stop_id === (opts.stopId ?? null)) return known;
  openedBy.delete(entryKey);
  return null;
}

/** Mints the flow's draft during the render that opens it, so the very first frame already shows its key. It is
 *  written WITHOUT an event: an emit here would set state in every other subscriber in the middle of this render.
 *  The opening effect announces it. */
function openOnce(entryKey: string, opts: { flow: FlowKind; stopId?: string | null; label: string }, first: string,
  path: string): string {
  const known = remembered(entryKey, opts);
  if (known !== null) return known;
  const seq = server.mintSeq(DEVICE_ID);
  const key = recordKey(DEVICE_ID, seq);
  const draft: Draft = { id: key, flow: opts.flow, stop_id: opts.stopId ?? null, seq, key,
    occurred_at: server.clock.nowIso(), step: first, data: {}, pages: [], created_wall: Date.now(), label: opts.label,
    path };
  server.phone(DEVICE_ID).drafts[draft.id] = draft;
  openedBy.set(entryKey, draft.id);
  return draft.id;
}

function firstStep<S extends string>(steps: readonly S[], flow: FlowKind): S {
  const first = steps[0];
  if (first === undefined) throw new Error(`useFlow: the flow ${flow} has no steps`);
  return first;
}

/** What a flow renders for the one frame between its draft disappearing and the redirect home. Never stored. */
const goneDraft = (id: string, opts: { flow: FlowKind; stopId?: string | null; label: string }, step: string,
  path: string): Draft =>
  ({ id, flow: opts.flow, stop_id: opts.stopId ?? null, seq: 0, key: '', occurred_at: server.clock.nowIso(), step,
    data: {}, pages: [], created_wall: 0, label: opts.label, path });

/* ── the hooks ────────────────────────────────────────────────────── */

/** Opens (or resumes, from history state) a flow. Mints seq + key + occurred_at at open (D11, EC-137).
 *  Step changes are navigate(sameLocation, { state: { step, draftId } }); commit → navigate('/', { replace: true }). */
export function useFlow<S extends string>(opts: { flow: FlowKind; steps: readonly S[]; stopId?: string | null;
  label: string }): FlowApi<S> {
  const navigate = useNavigate();
  const location = useLocation();
  const { steps } = opts;
  const first = firstStep(steps, opts.flow);
  const state = stepState(location.state);
  const draftId = state?.draftId ?? openOnce(location.key, opts, first, location.pathname);
  // Only this flow's own draft resumes. A stage rebuild restarts `seq`, so an old history entry's draftId can name a
  // NEW draft of another flow; that one is not this entry's, and the entry reads as gone.
  const stored = useServerValue((s) => {
    const d = s.phone(DEVICE_ID).drafts[draftId];
    return d !== undefined && d.flow === opts.flow && d.stop_id === (opts.stopId ?? null) ? d : undefined;
  });
  const isStep = (x: string | undefined): x is S => x !== undefined && steps.some((s) => s === x);
  const wanted = state?.step;
  const saved = stored?.step;
  const step: S = isStep(wanted) ? wanted : isStep(saved) ? saved : first;
  const index = steps.indexOf(step);
  const depth = state?.depth ?? 0;
  const draft = stored ?? goneDraft(draftId, opts, step, location.pathname);
  const gone = stored === undefined;
  const fresh = state === null;
  const { pathname } = location;
  /** The host's own keys on this entry, carried through every navigate this flow makes. */
  const host = hostState(location.state);

  useEffect(() => {
    if (gone) {
      navigate('/', { replace: true });   // committed, discarded, or the stage rebuilt the phone
      return;
    }
    if (fresh) {
      server.emit({ type: 'outbox', device_id: DEVICE_ID });   // the draft openOnce wrote silently
      navigate(pathname, { replace: true, state: { ...host, step, draftId, depth: 0 } });
      return;
    }
    if (saved !== step) patchDraft(DEVICE_ID, draftId, () => ({ step }));   // Back and Forward save the step
  }, [gone, fresh, saved, draftId, step, pathname, navigate]);

  const leave = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);
  /** Every write goes to this flow's own draft; one that is gone (or another flow's) is left alone. */
  const edit = (change: (d: Draft) => Partial<Draft>): void => {
    if (!gone) patchDraft(DEVICE_ID, draftId, change);
  };

  return {
    step,
    index,
    total: steps.length,
    draft,
    go(next) {
      navigate(pathname, { state: { ...host, step: next, draftId, depth: depth + 1 } });
    },
    back() {
      if (gt(depth, 0)) {
        navigate(-1);   // the entry below is this flow's previous step
        return;
      }
      const prev = steps[index - 1];
      if (prev === undefined) leave();
      else navigate(pathname, { replace: true, state: { ...host, step: prev, draftId, depth: 0 } });   // resumed mid-flow
    },
    patch(data) {
      edit((d) => ({ data: { ...d.data, ...data } }));
    },
    addPage(p) {
      edit((d) => ({ pages: [...d.pages, p] }));
    },
    replacePage(at, p) {
      edit((d) => ({ pages: d.pages.map((x, i) => (i === at ? p : x)) }));
    },
    setPages(p) {
      edit(() => ({ pages: [...p] }));
    },
    commit(input) {
      if (gone || server.phone(DEVICE_ID).drafts[draftId] === undefined) return;   // already committed or discarded
      enqueue(DEVICE_ID, input);
      writeDraft(DEVICE_ID, draftId, null);
      openedBy.forEach((id, entry) => {
        if (id === draftId) openedBy.delete(entry);
      });
      navigate('/', { replace: true });
    },
    leave,
  };
}

/** One-shot commit guard: busy flips on the first call and stays; run() ignores every later call. */
export function useCommitOnce(): { busy: boolean; run(fn: () => void): void } {
  const fired = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback((fn: () => void) => {
    if (fired.current) return;
    fired.current = true;
    setBusy(true);
    fn();
  }, []);
  return { busy, run };
}
