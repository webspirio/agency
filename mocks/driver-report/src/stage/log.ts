// mocks/driver-report/src/stage/log.ts
/** Reload recovery (§5.8, EC-166, I-13). One `sessionStorage` key, and what it holds is a log of STAGE ACTIONS —
 *  never domain rows.
 *
 *  THE WHOLE POINT IS THAT THE SEED IS NOT PERSISTED. Lane A regenerates the world on every load (see `main.tsx`),
 *  so persisting rows would resurrect exactly the rehearsal rows the pre-call reset exists to delete, and it would
 *  need a migration the day a DTO changes. What IS worth keeping is the handful of things the presenter did in the
 *  last few minutes: the beat they are standing on, the clock, the toggles, the scope, the framed phone, which
 *  script entries are already spoken for, and the writes made since the last rebuild. Replaying those through the
 *  same route table every other write goes through reproduces the state exactly and costs a few hundred bytes.
 *
 *  `doneScriptIds` is not decoration. `replayWrites` runs with `server.replaying` set, so `watchLiveTwins` ignores
 *  it by design — without the list, a refuel the presenter performed live in beat 7 would be replayed as a row AND
 *  left undone in the script, and the next «Перемотати до 11:50» would fire it a second time.
 *
 *  Three rules this module keeps:
 *  - every `sessionStorage` touch is inside try/catch: a private window, a blocked origin and a full quota all
 *    throw, and none of them is a reason for the stage not to open;
 *  - what comes back is DATA, not trust — `parseLog` checks every field before any of it reaches the server;
 *  - a replay that throws costs the writes, never the beat (see `recoverFromLog`). */
import { api, type OpKey } from '../api/contract';
import { server, type Toggles } from '../api/server';
import { between } from '../domain/num';
import { BEATS } from '../domain/script';
import type { Instant, Scope } from '../domain/types';
import { rebuild, replayWrites, type LoggedWrite } from './runner';

/** §5.8. The `:v1` is the whole migration story: a later shape takes a later key and an old log is simply never read. */
export const STAGE_LOG_KEY = 'ktl-stage:v1';

/** The beats a log may name, read off §5.6 rather than written as 0 and 13 twice (§5.4 #9). */
const FIRST_BEAT = BEATS[0]?.n ?? 0;
const LAST_BEAT = BEATS.at(-1)?.n ?? 0;

export type StageLog = { beat: number; clockAnchor: Instant; toggles: Toggles; scope: Scope; phone: string;
  doneScriptIds: string[]; writes: LoggedWrite[] };

/** The writes made since the last rebuild, in order. MODULE-LEVEL rather than a closure of `startLog`, because
 *  `recoverFromLog` fills it before `startLog` subscribes and the two effects on the stage page must not have to
 *  run in a particular order for a second reload to keep the first reload's writes. */
let writes: LoggedWrite[] = [];

/** A write op is one the contract declares with a method other than GET — asked of the registry rather than listed
 *  here, so an operation added to §7.4 is logged without anybody remembering this file. `sendHeartbeat` is the one
 *  exclusion: `rebuild` sends its own heartbeats at the beat's clock, and replaying old ones would drag every
 *  phone's `last_seen_at` backwards to the moment the log was written. */
function isWriteOp(op: string): boolean {
  if (op === 'sendHeartbeat' || !Object.hasOwn(api, op)) return false;
  return api[op as OpKey].method !== 'GET';
}

/* ── reading ─────────────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strMap = (v: unknown): Record<string, string> | null =>
  isRecord(v) && Object.values(v).every(isStr) ? (v as Record<string, string>) : null;
const numMap = (v: unknown): Record<string, number> | null =>
  isRecord(v) && Object.values(v).every((n) => typeof n === 'number') ? (v as Record<string, number>) : null;
const boolMap = (v: unknown): Record<string, boolean> | null =>
  isRecord(v) && Object.values(v).every((b) => typeof b === 'boolean') ? (v as Record<string, boolean>) : null;

/** Every toggle, or nothing. The RETURN TYPE is the check that matters: a toggle added to `Toggles` stops this
 *  function compiling, which is what forces whoever adds it to decide whether a reload should restore it. */
function parseToggles(v: unknown): Toggles | null {
  if (!isRecord(v)) return null;
  const speed = numMap(v.speed);
  const gpsLost = boolMap(v.gpsLost);
  const textScale = boolMap(v.textScale);
  if (typeof v.offline !== 'boolean' || typeof v.hideSimChips !== 'boolean') return null;
  if (speed === null || gpsLost === null || textScale === null) return null;
  if (v.viewport !== '360x670' && v.viewport !== '390x844') return null;
  return { offline: v.offline, speed, gpsLost, textScale, viewport: v.viewport, hideSimChips: v.hideSimChips };
}

function parseWrite(v: unknown): LoggedWrite | null {
  if (!isRecord(v) || !isStr(v.op) || !isStr(v.at) || !isRecord(v.actor)) return null;
  const params = strMap(v.params);
  if (!isStr(v.actor.id) || !isStr(v.actor.role) || params === null) return null;
  return { op: v.op, actor: { id: v.actor.id, role: v.actor.role }, at: v.at as Instant, params, body: v.body };
}

function parseLog(v: unknown): StageLog | null {
  if (!isRecord(v) || typeof v.beat !== 'number' || !Number.isInteger(v.beat)) return null;
  if (!between(v.beat, FIRST_BEAT, LAST_BEAT)) return null;
  if (!isStr(v.clockAnchor) || !isStr(v.phone)) return null;
  if (v.scope !== 'PILOT' && v.scope !== 'FLEET') return null;
  const toggles = parseToggles(v.toggles);
  if (toggles === null || !Array.isArray(v.doneScriptIds) || !v.doneScriptIds.every(isStr)) return null;
  if (!Array.isArray(v.writes)) return null;
  const parsed = v.writes.map(parseWrite);
  if (parsed.some((w) => w === null)) return null;
  return { beat: v.beat, clockAnchor: v.clockAnchor as Instant, toggles, scope: v.scope, phone: v.phone,
    doneScriptIds: v.doneScriptIds, writes: parsed as LoggedWrite[] };
}

/** The log this realm can see, or null — for an absent key, a blocked `sessionStorage`, unparseable JSON, and a
 *  shape this build no longer recognises alike. All four are the same thing to a caller: there is nothing to
 *  recover from. */
export function readLog(): StageLog | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STAGE_LOG_KEY);
  } catch {
    return null;                       // a private window, or an origin with storage blocked
  }
  if (raw === null) return null;
  try {
    return parseLog(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** «Скинути демо» (§5.4 #10) and a replay this build cannot run (see `recoverFromLog`). */
export function clearLog(): void {
  try {
    sessionStorage.removeItem(STAGE_LOG_KEY);
  } catch { /* nothing stored means nothing to remove */ }
}

/* ── writing ─────────────────────────────────────────────────────────── */

function save(): void {
  const beat = server.ui.beat;
  if (beat === null) return;           // mid-rebuild: there is no beat to return to yet
  const log: StageLog = { beat, clockAnchor: server.clock.nowIso(), toggles: server.toggles, scope: server.ui.scope,
    phone: server.ui.phone, doneScriptIds: [...server.done], writes };
  try {
    sessionStorage.setItem(STAGE_LOG_KEY, JSON.stringify(log));
  } catch { /* a private window, or a quota this log cannot be the cause of */ }
}

/** Starts logging and returns the stopper (the stage page's effect cleanup; StrictMode-safe by construction — a
 *  second subscription writes the same bytes as the first). A `rebuilt` empties the writes: «Такт n» IS a new
 *  base, and replaying the old writes on top of it would double every record. */
export function startLog(): () => void {
  const off = server.subscribe((e) => {
    if (e.type === 'rebuilt') {
      writes = [];
      save();
      return;
    }
    if (e.type === 'changed') {
      if (e.replayed || !isWriteOp(e.op)) return;
      writes.push({ op: e.op, actor: { id: e.actor.id, role: e.actor.role }, at: e.at, params: e.params,
        body: e.body });
      save();
      return;
    }
    if (e.type === 'toggles' || e.type === 'ui' || e.type === 'clock') save();
  });
  save();
  return off;
}

/* ── recovering ──────────────────────────────────────────────────────── */

/** One recovery per realm, and a reload IS a new realm. Memoised for the same reason `ensureBooted` is: the stage
 *  page's effect runs twice under StrictMode, and a second replay would write every logged record a second time. */
let recovery: Promise<boolean> | null = null;

async function recover(): Promise<boolean> {
  const log = readLog();
  if (log === null) return false;
  try {
    await rebuild(log.beat);
    await replayWrites(log.writes);
    writes = log.writes;
  } catch {
    // A log from an older build, or a write the current route table now refuses. The BEAT is still recoverable and
    // is worth far more than the writes: the alternative is a stage that opens on beat 0 in front of the client.
    clearLog();
    writes = [];
    try {
      await rebuild(log.beat);
    } catch {
      return false;                    // not even the beat: `ensureBooted` opens the demo where the URL says
    }
  }
  for (const id of log.doneScriptIds) if (!server.done.includes(id)) server.done.push(id);
  // One assignment rather than six `setToggle` calls, because one assignment cannot miss a key that `parseToggles`
  // has already proved is there.
  server.toggles = log.toggles;
  server.emit({ type: 'toggles' });
  server.setUi({ phone: log.phone, scope: log.scope });
  server.clock.set(log.clockAnchor);
  server.clock.run();
  const hash = `#/beat/${log.beat}`;
  if (window.location.hash !== hash) window.location.hash = hash;
  return true;
}

/** Called on stage load, BEFORE `ensureBooted`: true when a log was found and the demo is now standing where it
 *  stood, false when there was nothing to recover and the caller should boot the URL's beat as usual. */
export function recoverFromLog(): Promise<boolean> {
  recovery ??= recover();
  return recovery;
}
