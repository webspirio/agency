// mocks/driver-report/src/app/outbox.ts
/** The phone's outbox (§7.7, §3.3 D-02, §6.6): every record the driver commits waits here until the office has it.
 *
 *  Entries live on the SERVER, in `server.phone(deviceId).outbox`, so a phone iframe the stage reloads keeps them. The
 *  loop that sends them lives in THIS realm (`startOutbox`), one per device, and is torn down at `pagehide`.
 *
 *  Order is strict: one entry at a time in `seq` order — its record (`RECORD_LATENCY_MS` after the send starts), then
 *  each of its pages (`PHOTO_LATENCY_MS` each) — and the next entry waits until this one is DONE. Offline
 *  (`server.toggles.offline`) nothing is sent at all. An acknowledgement is the server's answer echoing the record's
 *  own key; any other 2xx is a failed attempt (EC-139). A failure waits `backoffMs(attempts)` and tries again;
 *  DEVICE_REVOKED stops the queue (the home shows the revoked card through `getToday`).
 *
 *  Entries are replaced, never mutated: every change writes a new array, bumps `outboxVersion` and emits
 *  `{ type: 'outbox' }`, so `useOutbox` can hand React the array itself as its snapshot. */
import { useCallback, useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { httpClient } from '../api/client';
import { call, codeOf } from '../api/contract';
import { server, type ServerEvent } from '../api/server';
import { DC } from '../copy/driver';
import type { PageIn, RecordIn } from '../domain/dto';
import { cmpNum, gt, gte, lt } from '../domain/num';
import type { Instant } from '../domain/types';
import { fmtTime } from './format';
import { buildRecord, pageKey, receiptNo, recordKey } from './records';

export type OutboxState = 'LOCAL' | 'SENDING' | 'ACKED' | 'PHOTOS' | 'DONE' | 'RETRY';
/** What the ReceiptCard shows under the status line: the title the flow composed and the «Далі: …» line. `null` on an
 *  entry means a silent one (an undo's VOID, a seen-marker): it gets no ReceiptCard. */
export type ReceiptMeta = { title: string; next: string | null };
export type OutboxEntry = { key: string; seq: number; record: RecordIn; pages: PageIn[]; state: OutboxState;
  acked_at: Instant | null; done_at: Instant | null; photos_sent: number; attempts: number;
  retry_at_wall: number | null; receipt: ReceiptMeta | null; created_wall: number; undone: boolean; revoked: boolean };
export type ReceiptState = { tone: 'plain' | 'hold' | 'muted'; icon: 'CloudOff' | 'Clock' | 'CloudUpload' | 'Check' | 'Undo2';
  text: string; photo_hold: string | null; acknowledged: boolean };
export type SyncState = { tone: 'plain' | 'hold'; icon: 'Check' | 'CloudUpload' | 'CloudOff' | 'Clock'; text: string };

/** Simulated transfer times, wall clock (§5.8): the stage shows a handoff rather than an instant. */
export const RECORD_LATENCY_MS = 150;
export const PHOTO_LATENCY_MS = 400;
/** How long «Скасувати» stays on the ReceiptCard after a commit, wall clock (§3.3 D-02). */
export const UNDO_MS = 15000;
const HEARTBEAT_MS = 30000;
const BACKOFF_FIRST_MS = 2000;
const BACKOFF_CAP_MS = 30000;

type Kind = 'record' | 'page';
type Loop = { deviceId: string; refs: number; timer: ReturnType<typeof setTimeout> | null;
  claim: { key: string; kind: Kind } | null; busy: Promise<boolean> | null; flushing: boolean; sent: boolean;
  offline: boolean; teardown: (() => void) | null };

/** One loop per device per realm. */
const loops = new Map<string, Loop>();
/** LOCAL entries «Скасувати» removed, kept in this realm so «Повернути» can put them back. */
const removed = new Map<string, OutboxEntry>();
/** Entries already put back once (key + creation moment: keys repeat after a stage rebuild restarts `seq`). */
const redone = new Set<string>();

const slot = (deviceId: string, key: string): string => `${deviceId}\u0000${key}`;
const identity = (e: OutboxEntry): string => `${e.key}@${e.created_wall}`;
const bySeq = (a: OutboxEntry, b: OutboxEntry): -1 | 0 | 1 => cmpNum(a.seq, b.seq);
const pending = (e: OutboxEntry): boolean => e.state !== 'DONE' && !e.revoked;
const kindOf = (e: OutboxEntry): Kind => (e.acked_at === null ? 'record' : 'page');

/** Runs `cleanup` once: on the returned call or at `pagehide`, whichever comes first (the realm rule of live.ts). */
function untilPagehide(cleanup: () => void): () => void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('pagehide', run);
    cleanup();
  };
  window.addEventListener('pagehide', run);
  return run;
}

/* ── the entries ──────────────────────────────────────────────────── */

const entriesOf = (deviceId: string): OutboxEntry[] => server.phone(deviceId).outbox;
const findEntry = (deviceId: string, key: string): OutboxEntry | undefined => entriesOf(deviceId).find((e) => e.key === key);

function write(deviceId: string, next: OutboxEntry[]): void {
  const phone = server.phone(deviceId);
  phone.outbox = next;
  phone.outboxVersion += 1;
  server.emit({ type: 'outbox', device_id: deviceId });
}

/** Replaces one entry; `null` when it is gone (undone, cleared, or the stage rebuilt the server meanwhile). */
function patch(deviceId: string, key: string, change: Partial<OutboxEntry>): OutboxEntry | null {
  const all = entriesOf(deviceId);
  const at = all.findIndex((e) => e.key === key);
  const cur = all[at];
  if (cur === undefined) return null;
  const next = { ...cur, ...change };
  write(deviceId, all.map((e, i) => (i === at ? next : e)));
  return next;
}

/** The entry the queue is on: the lowest seq that is neither DONE nor revoked. */
function headOf(deviceId: string): OutboxEntry | null {
  return [...entriesOf(deviceId)].filter(pending).sort(bySeq)[0] ?? null;
}
/** Nothing leaves the phone offline, and nothing at all once the office has disconnected it. */
const blocked = (deviceId: string): boolean => server.toggles.offline || entriesOf(deviceId).some((e) => e.revoked);

/** The state an entry rests in when a send it was claimed for does not happen. */
const resting = (e: OutboxEntry): OutboxState =>
  e.acked_at === null ? (e.attempts === 0 ? 'LOCAL' : 'RETRY') : e.photos_sent === 0 ? 'ACKED' : 'PHOTOS';

export function enqueue(deviceId: string, input: { record: RecordIn; pages: PageIn[]; receipt: ReceiptMeta | null }): OutboxEntry {
  const held = findEntry(deviceId, input.record.key);
  if (held !== undefined) return held;   // one key, one entry, however often a commit fires (EC-137)
  const entry: OutboxEntry = { key: input.record.key, seq: input.record.seq, record: input.record, pages: input.pages,
    state: 'LOCAL', acked_at: null, done_at: null, photos_sent: 0, attempts: 0, retry_at_wall: null,
    receipt: input.receipt, created_wall: Date.now(), undone: false, revoked: false };
  write(deviceId, [...entriesOf(deviceId), entry]);
  return entry;
}

/** «Скасувати»: an entry still only on the phone is removed; one the office may already hold stays, marked undone,
 *  and a VOID naming it is queued behind it. */
export function undo(deviceId: string, key: string): void {
  const e = findEntry(deviceId, key);
  if (e === undefined || e.undone) return;
  if (e.state === 'LOCAL' && e.acked_at === null) {
    removed.set(slot(deviceId, key), { ...e, undone: true });
    write(deviceId, entriesOf(deviceId).filter((x) => x.key !== key));
    return;
  }
  patch(deviceId, key, { undone: true });
  const seq = server.mintSeq(deviceId);
  const now = server.clock.nowIso();
  enqueue(deviceId, { record: buildRecord({ deviceId, seq, occurredAt: now, committedAt: now }, 'VOID', { target_key: key }),
    pages: [], receipt: null });
}

/** A payload with every page key renamed (LOADED/UNLOADED/DOCS_ADDED `pages`, PHOTO_REPLACE `page_key`). */
function renamePages(payload: RecordIn['payload'], renamed: Map<string, string>): RecordIn['payload'] {
  const swap = (v: unknown): unknown => (typeof v === 'string' ? renamed.get(v) ?? v : v);
  return Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, Array.isArray(v) ? v.map(swap) : swap(v)])) as RecordIn['payload'];
}

/** «Повернути»: the undone record goes back into the queue under a fresh seq, its pages keyed after it. */
export function redo(deviceId: string, key: string): void {
  const e = entriesOf(deviceId).find((x) => x.key === key && x.undone) ?? removed.get(slot(deviceId, key));
  if (e === undefined || redone.has(identity(e))) return;
  redone.add(identity(e));
  removed.delete(slot(deviceId, key));
  const seq = server.mintSeq(deviceId);
  const fresh = recordKey(deviceId, seq);
  const renamed = new Map(e.pages.map((p, i) => [p.key, pageKey(fresh, i + 1)]));
  const pages = e.pages.map((p) => ({ ...p, key: renamed.get(p.key) ?? p.key, record_key: fresh }));
  const record = { ...e.record, key: fresh, seq, payload: renamePages(e.record.payload, renamed) } as RecordIn;
  enqueue(deviceId, { record, pages, receipt: e.receipt });
}

/** Everything the phone still holds: every entry, drafts included, and whatever this realm was about to send. */
export function clearPhone(deviceId: string): void {
  const loop = loops.get(deviceId);
  if (loop !== undefined) cancelClaim(loop);
  const phone = server.phone(deviceId);
  for (const k of Object.keys(phone.drafts)) delete phone.drafts[k];   // in place: another realm may hold the object
  for (const k of removed.keys()) if (k.startsWith(slot(deviceId, ''))) removed.delete(k);   // deleting while iterating a Map is safe
  write(deviceId, []);
}

/** Records the office does not have yet, in seq order: what `project()` lays over the last `getToday`. */
export function pendingRecords(deviceId: string): RecordIn[] {
  return [...entriesOf(deviceId)].filter((e) => e.acked_at === null && !e.undone).sort(bySeq).map((e) => e.record);
}

/** The device's entries, re-rendered whenever any of them changes. */
export function useOutbox(deviceId: string): OutboxEntry[] {
  const subscribe = useCallback((onChange: () => void) => untilPagehide(server.subscribe(() => onChange())), []);
  const read = (): OutboxEntry[] => entriesOf(deviceId);
  return useSyncExternalStore(subscribe, read, read);
}

/* ── the words ────────────────────────────────────────────────────── */

/** The ReceiptCard's status line (§3.3 D-02, §6.6). `now` is the last resort for an acknowledged entry that carries no
 *  time of its own. */
export function receiptState(e: OutboxEntry, offline: boolean, now: Instant): ReceiptState {
  const quiet = { photo_hold: null, acknowledged: false };
  if (e.undone) return { tone: 'muted', icon: 'Undo2', text: DC.status.undone, ...quiet };
  if (e.acked_at !== null) {
    const total = e.pages.length;
    const left = total - e.photos_sent;
    if (e.state === 'DONE' || !gt(left, 0)) {
      return { tone: 'plain', icon: 'Check', text: `${DC.status.inOffice} ${fmtTime(e.done_at ?? e.acked_at ?? now)}`,
        photo_hold: null, acknowledged: true };
    }
    return { tone: 'plain', icon: 'Check', text: `${DC.status.inOffice} ${fmtTime(e.acked_at)}`,
      photo_hold: DC.status.photosLeft(left, total), acknowledged: false };
  }
  const saved = `${DC.status.savedOffline} · ${receiptNo(e.seq)}`;
  if (offline) return { tone: 'hold', icon: 'CloudOff', text: `${saved} · ${DC.status.willSend}`, ...quiet };
  if (e.state === 'RETRY') return { tone: 'hold', icon: 'Clock', text: DC.status.retry, ...quiet };
  return { tone: 'hold', icon: 'Clock', text: saved, ...quiet };
}

/** The home's sync strip (§3.3 D-02): inert, never a modal, never a prediction. Unknown last contact reads «—». */
export function syncState(entries: OutboxEntry[], offline: boolean, lastContactAt: Instant | null): SyncState {
  const hm = lastContactAt === null ? '—' : fmtTime(lastContactAt);
  const waiting = [...entries].filter((e) => e.state !== 'DONE').sort(bySeq);
  if (offline && waiting.length !== 0) return { tone: 'hold', icon: 'CloudOff', text: DC.sync.waiting(waiting.length, hm) };
  if (waiting.some((e) => e.state === 'RETRY')) return { tone: 'hold', icon: 'Clock', text: DC.sync.retry(hm) };
  const photos = waiting.find((e) => e.state === 'ACKED' || e.state === 'PHOTOS');
  if (photos !== undefined) {
    return { tone: 'plain', icon: 'CloudUpload', text: DC.sync.sendingPhotos(photos.photos_sent + 1, photos.pages.length) };
  }
  return { tone: 'plain', icon: 'Check', text: DC.sync.allIn(hm) };
}

/** 2, 4, 8, 16, then 30 s for every later attempt. */
export function backoffMs(attempts: number): number {
  let ms = BACKOFF_FIRST_MS;
  for (let i = 1; lt(i, attempts); i += 1) {
    ms += ms;
    if (gte(ms, BACKOFF_CAP_MS)) return BACKOFF_CAP_MS;
  }
  return ms;
}

/* ── the sends ────────────────────────────────────────────────────── */

const echoes = (answer: unknown, field: 'key' | 'page_key', key: string): answer is { received_at: Instant } =>
  typeof answer === 'object' && answer !== null && (answer as Record<string, unknown>)[field] === key
  && typeof (answer as Record<string, unknown>)['received_at'] === 'string';

function failed(deviceId: string, key: string): void {
  const cur = findEntry(deviceId, key);
  if (cur === undefined) return;
  const attempts = cur.attempts + 1;
  patch(deviceId, key, { state: 'RETRY', attempts, retry_at_wall: Date.now() + backoffMs(attempts) });
}

async function sendRecord(deviceId: string, e: OutboxEntry): Promise<boolean> {
  let answer: unknown;
  try {
    answer = await call(httpClient, 'submitRecord', { params: {}, body: e.record });
  } catch (err) {
    if (codeOf('submitRecord', err) === 'DEVICE_REVOKED') patch(deviceId, e.key, { revoked: true, state: resting(e) });
    else failed(deviceId, e.key);
    return false;
  }
  if (!echoes(answer, 'key', e.key)) {   // a 2xx that is not our key is not an acknowledgement (EC-139)
    failed(deviceId, e.key);
    return false;
  }
  const at = answer.received_at;
  patch(deviceId, e.key, e.pages.length === 0
    ? { state: 'DONE', acked_at: at, done_at: at, attempts: 0, retry_at_wall: null }
    : { state: 'ACKED', acked_at: at, attempts: 0, retry_at_wall: null });
  return true;
}

async function sendPage(deviceId: string, e: OutboxEntry): Promise<boolean> {
  const page = e.pages[e.photos_sent];
  if (page === undefined) {   // every page is in already
    patch(deviceId, e.key, { state: 'DONE', done_at: e.done_at ?? e.acked_at });
    return true;
  }
  let answer: unknown;
  try {
    answer = await call(httpClient, 'uploadPhoto', { params: {}, body: page });
  } catch (err) {
    if (codeOf('uploadPhoto', err) === 'DEVICE_REVOKED') patch(deviceId, e.key, { revoked: true, state: resting(e) });
    else failed(deviceId, e.key);
    return false;
  }
  if (!echoes(answer, 'page_key', page.key)) {
    failed(deviceId, e.key);
    return false;
  }
  const sent = e.photos_sent + 1;
  patch(deviceId, e.key, sent === e.pages.length
    ? { state: 'DONE', photos_sent: sent, done_at: answer.received_at, attempts: 0, retry_at_wall: null }
    : { state: 'PHOTOS', photos_sent: sent, attempts: 0, retry_at_wall: null });
  return true;
}

/** One send — the head's record or its next page — with the transfer events the stage animates. `announced` when the
 *  'start' went out at the claim, before the latency. `true` when the entry moved forward. */
async function send(loop: Loop, key: string, kind: Kind, announced: boolean): Promise<boolean> {
  const { deviceId } = loop;
  if (!announced) server.emit({ type: 'transfer', device_id: deviceId, phase: 'start' });
  const work = async (): Promise<boolean> => {
    const e = findEntry(deviceId, key);
    if (e === undefined || !pending(e) || kindOf(e) !== kind) return false;   // it moved on since the claim
    if (server.toggles.offline) {
      patch(deviceId, key, { state: resting(e) });
      return false;
    }
    return kind === 'record' ? sendRecord(deviceId, e) : sendPage(deviceId, e);
  };
  // Published BEFORE the work starts: every patch it makes emits an event that re-enters schedule(), which must see
  // the loop as busy.
  const run = Promise.resolve().then(work);
  loop.busy = run;
  try {
    const moved = await run;
    if (moved) loop.sent = true;
    return moved;
  } finally {
    loop.busy = null;
    server.emit({ type: 'transfer', device_id: deviceId, phase: 'end' });
  }
}

/** The phone is alive: how many records it still holds, and when it last captured a page it has not sent. */
async function heartbeat(deviceId: string): Promise<void> {
  if (server.toggles.offline) return;
  const waiting = entriesOf(deviceId).filter(pending);
  let last: string | null = null;
  for (const e of waiting) {
    for (const p of e.pages.slice(e.photos_sent)) {
      if (last === null || gt(Date.parse(p.captured_at), Date.parse(last))) last = p.captured_at;
    }
  }
  try {
    await call(httpClient, 'sendHeartbeat', { params: {},
      body: last === null ? { unsent: waiting.length } : { unsent: waiting.length, last_capture_at: last } });
  } catch {
    /* the next beat tries again */
  }
}

/* ── the loop ─────────────────────────────────────────────────────── */

function loopOf(deviceId: string): Loop {
  let loop = loops.get(deviceId);
  if (loop === undefined) {
    loop = { deviceId, refs: 0, timer: null, claim: null, busy: null, flushing: false, sent: false, offline: false,
      teardown: null };
    loops.set(deviceId, loop);
  }
  return loop;
}

/** Drops a planned send (its latency timer, or a retry's back-off) before it happens. */
function cancelClaim(loop: Loop): void {
  if (loop.timer !== null) {
    clearTimeout(loop.timer);
    loop.timer = null;
  }
  const claim = loop.claim;
  loop.claim = null;
  if (claim === null) return;
  const e = findEntry(loop.deviceId, claim.key);
  if (e !== undefined && (e.state === 'SENDING' || e.state === 'PHOTOS')) patch(loop.deviceId, claim.key, { state: resting(e) });
  server.emit({ type: 'transfer', device_id: loop.deviceId, phase: 'end' });
}

/** Plans the next send, if there is one and nothing else is under way. Idempotent: every event may call it. */
function schedule(loop: Loop): void {
  if (loop.refs === 0 || loop.flushing || loop.busy !== null || loop.timer !== null) return;
  if (blocked(loop.deviceId)) return;
  const head = headOf(loop.deviceId);
  if (head === null) {
    if (loop.sent) {   // the queue has just drained: tell the office
      loop.sent = false;
      void heartbeat(loop.deviceId);
    }
    return;
  }
  if (head.state === 'RETRY' && head.retry_at_wall !== null) {
    const left = head.retry_at_wall - Date.now();
    if (gt(left, 0)) {
      loop.timer = setTimeout(() => {
        loop.timer = null;
        schedule(loop);
      }, left);
      return;
    }
  }
  const kind = kindOf(head);
  loop.claim = { key: head.key, kind };
  loop.timer = setTimeout(() => {
    loop.timer = null;
    const claim = loop.claim;
    loop.claim = null;
    if (claim === null) return;
    void send(loop, claim.key, claim.kind, true).then(() => schedule(loop));
  }, kind === 'record' ? RECORD_LATENCY_MS : PHOTO_LATENCY_MS);
  patch(loop.deviceId, head.key, { state: kind === 'record' ? 'SENDING' : 'PHOTOS' });
  server.emit({ type: 'transfer', device_id: loop.deviceId, phase: 'start' });
}

/** The driver realm's TanStack Query follows the stage's «Офлайн», so reads pause and screens render from cache ⊕
 *  outbox. Heartbeats on going online and on every clock jump. */
function onEvent(loop: Loop, e: ServerEvent): void {
  const offline = server.toggles.offline;
  if (offline !== loop.offline) {
    loop.offline = offline;
    onlineManager.setOnline(!offline);
    if (offline) cancelClaim(loop);
    else void heartbeat(loop.deviceId);
  }
  if (e.type === 'clock' && e.jumped) void heartbeat(loop.deviceId);
  if (e.type === 'rebuilt') cancelClaim(loop);
  if (e.type === 'toggles' || e.type === 'rebuilt' || (e.type === 'outbox' && e.device_id === loop.deviceId)) schedule(loop);
}

function begin(loop: Loop): void {
  const { deviceId } = loop;
  // A send the previous realm had under way when its iframe unloaded will never answer: it goes again (the key makes a
  // second arrival harmless, EC-137).
  if (loop.busy === null) {
    for (const e of entriesOf(deviceId)) if (e.state === 'SENDING') patch(deviceId, e.key, { state: resting(e) });
  }
  loop.offline = server.toggles.offline;
  onlineManager.setOnline(!loop.offline);
  const off = server.subscribe((e) => onEvent(loop, e));
  const beat = setInterval(() => { void heartbeat(deviceId); }, HEARTBEAT_MS);
  loop.teardown = untilPagehide(() => {
    off();
    clearInterval(beat);
    cancelClaim(loop);
    loop.refs = 0;
    loop.teardown = null;
    onlineManager.setOnline(true);
  });
  schedule(loop);
}

/** Starts the device's flush loop and its 30 s heartbeat in this realm. Idempotent: a second start shares the loop,
 *  and the loop stops when the last returned stopper has run (or at `pagehide`). */
export function startOutbox(deviceId: string): () => void {
  const loop = loopOf(deviceId);
  loop.refs += 1;
  if (loop.refs === 1) begin(loop);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (loop.refs === 0) return;   // already torn down at pagehide
    loop.refs -= 1;
    if (loop.refs === 0) loop.teardown?.();
  };
}

/** Sends everything pending now, with no latency (tests, the W3 checks). Offline, or revoked, it sends nothing; a
 *  failed send stops it where the queue would stop. */
export async function flushNow(deviceId: string): Promise<void> {
  const loop = loopOf(deviceId);
  loop.flushing = true;
  try {
    cancelClaim(loop);
    if (loop.busy !== null) await loop.busy;
    for (;;) {
      if (blocked(deviceId)) break;
      const head = headOf(deviceId);
      if (head === null) break;
      const kind = kindOf(head);
      patch(deviceId, head.key, { state: kind === 'record' ? 'SENDING' : 'PHOTOS' });
      if (!(await send(loop, head.key, kind, false))) break;
    }
  } finally {
    loop.flushing = false;
  }
  if (loop.sent && headOf(deviceId) === null) {
    loop.sent = false;
    await heartbeat(deviceId);
  }
  schedule(loop);
}
