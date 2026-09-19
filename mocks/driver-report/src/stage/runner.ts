// mocks/driver-report/src/stage/runner.ts
/** The script runner (§5.6–§5.8, §7.7, I-13): the seed plus `SCRIPT` IS the demo day, and this module is what applies
 *  it. «Такт n» rebuilds a fresh server up to the beat, «Перемотати до…» applies what is still undone up to a moment,
 *  and a live tap that does what a LIVE entry scripts retires that entry, so nothing the presenter did fires twice.
 *
 *  Every entry goes through the SAME route table the panes use — `routes`, with the entry's actor and `now` pinned to
 *  the entry's moment — so what it writes is indistinguishable from a live tap (§7.7). It is a stage tool: it runs under
 *  `caps: ['driver', 'dispatcher']` inside the realm that owns the server, never in a product build.
 *
 *  Record steps call `call` with LITERAL operation keys. Office op steps are the one place in the mock where an
 *  operation name is data, so they go through `dispatch`, ONE alias of `call` declared below: passing `e.step.op` to
 *  `call` itself is «call() with a non-literal operation key — unresolvable» in `api:bound`. `runner.test.ts` closes
 *  the gap the alias leaves by asserting that every scripted op is a key of `api`.
 *
 *  A script entry that the server refuses is a script or seed defect, not a stage condition: the error propagates to
 *  the caller rather than being skipped, so a test sees it and the stage's «Такт» is the recovery. */
import axios from 'axios';
import { asBusinessDate, mockAdapter, transport, type Actor, type Transport } from '@agency/mock';
import { call } from '../api/contract';
import { routes } from '../api/routes';
import { server } from '../api/server';
import { buildPages, buildRecord, MOCK_BYTES, pageKey, recordKey, type CapturedPage } from '../app/records';
import { atOrBefore, businessDate, isBefore } from '../domain/clock';
import { truckDayIdFor } from '../domain/derive';
import { gt, lt, lte } from '../domain/num';
import { BEATS, CHECKPOINTS, HRYHORII, OLEH, PAVLO, SCRIPT, type Beat, type LiveMatch, type RecordTemplate,
  type ScriptEntry, type ScriptStep, type TargetRef } from '../domain/script';
import type { Instant, Odometer, Payloads, RecordType } from '../domain/types';
import type { ChangedEvent } from '../api/server';

/** The one place an operation name is data (see the header). Every other call in the mock names its operation. */
const dispatch = call as unknown as (t: Transport, key: string, args: { params: Record<string, string>; body: unknown;
  qry?: Record<string, string> }) => Promise<unknown>;

/** A write the stage logged since its last rebuild (§5.8 reload recovery), replayed through the same route table. */
export type LoggedWrite = { op: string; actor: { id: string; role: string }; at: Instant; params: Record<string, string>;
  body: unknown };

/** Both capabilities: the runner writes as a driver's phone and as the office. */
const CAPS = new Set(['driver', 'dispatcher']);
/** The phones on the stage: «Офлайн» takes exactly these three off the network (§5.4 #6). */
const STAGE_PHONES: readonly string[] = [PAVLO, OLEH, HRYHORII];
/** The record types whose payload names its pages. */
const NAMES_PAGES: readonly RecordType[] = ['LOADED', 'UNLOADED', 'DOCS_ADDED'];

/* ── the runner's own client ─────────────────────────────────────────── */

/** The moment the adapter answers with: the entry being applied, never the wall clock. */
let at: string = server.clock.nowIso();
/** One client per actor, each over the realm's route table. */
const clients = new Map<string, Transport>();
function clientFor(actor: { id: string; role: string }): Transport {
  const k = `${actor.role}\u0000${actor.id}`;
  let t = clients.get(k);
  if (t === undefined) {
    const who: Actor = { id: actor.id, role: actor.role };
    t = transport(axios.create({ baseURL: '/api', paramsSerializer: { indexes: null },
      adapter: mockAdapter(routes, { caps: CAPS, actor: who, now: () => at }) }));
    clients.set(k, t);
  }
  return t;
}

/** Runs `fn` with `server.replaying` set, so every write it makes is marked as the script's and not a live tap. */
async function replaying<T>(fn: () => Promise<T>): Promise<T> {
  const before = server.replaying;
  server.replaying = true;
  try {
    return await fn();
  } finally {
    server.replaying = before;
  }
}

/* ── natural keys → ids, against the realm's server at the moment of use ── */

function ref(scriptId: string, entry: string): string {
  const v = server.scriptRefs[scriptId];
  if (v === undefined) throw new Error(`runner ${entry}: «${scriptId}» has produced nothing to refer to yet`);
  return v;
}
function truckIdOf(plate: unknown, entry: string): string {
  const t = server.world().trucks.find((x) => x.plate === plate);
  if (t === undefined) throw new Error(`runner ${entry}: no truck «${String(plate)}»`);
  return t.id;
}
function trailerIdOf(plate: unknown, entry: string): string {
  const t = server.world().trailers.find((x) => x.plate === plate);
  if (t === undefined) throw new Error(`runner ${entry}: no trailer «${String(plate)}»`);
  return t.id;
}
function placeIdOf(code: unknown, entry: string): string {
  const p = server.world().places.find((x) => x.code === code);
  if (p === undefined) throw new Error(`runner ${entry}: no place «${String(code)}»`);
  return p.id;
}
function stopOf(planKey: string, entry: string): { id: string; place_id: string } {
  const s = server.world().plannedStops.find((x) => x.plan_key === planKey);
  if (s === undefined) throw new Error(`runner ${entry}: no planned stop «${planKey}»`);
  return s;
}
/** The device's open shift, else its latest one (`shift_id: 'CURRENT'`). */
function currentShiftId(device: string, entry: string): string {
  const mine = server.world().shifts.filter((x) => x.device_id === device);
  const shift = mine.filter((x) => x.ended_at === null).at(-1) ?? mine.at(-1);
  if (shift === undefined) throw new Error(`runner ${entry}: «${device}» has no shift`);
  return shift.id;
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A template's payload with every natural key replaced by what the server knows it as. */
function resolvePayload(e: ScriptEntry, r: RecordTemplate, pageKeys: string[]): Record<string, unknown> {
  const cluster = r.pages.findIndex((p) => p.artefact === 'CLUSTER');
  const out: Record<string, unknown> = {};
  if (NAMES_PAGES.includes(r.type) && !('pages' in r.payload)) out.pages = pageKeys;
  for (const [k, v] of Object.entries(r.payload)) {
    switch (k) {
      case 'truck_plate': out.truck_id = truckIdOf(v, e.id); break;
      case 'trailer_plate': out.trailer_id = trailerIdOf(v, e.id); break;
      case 'place_code': out.place_id = placeIdOf(v, e.id); break;
      case 'road_stop_of': out.road_stop_key = ref(String(v), e.id); break;
      case 'request_of': out.request_id = ref(String(v), e.id); break;
      case 'supersedes_of': {
        if (!isRecord(v) || typeof v.script !== 'string' || typeof v.page_no !== 'number') {
          throw new Error(`runner ${e.id}: supersedes_of must name { script, page_no }`);
        }
        out.page_key = pageKeys[0] ?? null;
        out.supersedes = pageKey(ref(v.script, e.id), v.page_no);
        break;
      }
      case 'shift_id': out.shift_id = v === 'CURRENT' ? currentShiftId(r.device, e.id) : v; break;
      case 'pages': out.pages = NAMES_PAGES.includes(r.type) ? pageKeys : v; break;
      case 'odometer': {
        // The dash photo the reading was taken from, as the seed links it (the office's odometer item shows it).
        const odo = v as Odometer | null;
        out.odometer = odo !== null && odo.page_key === null && cluster !== -1 ? { ...odo, page_key: pageKeys[cluster] ?? null } : odo;
        break;
      }
      default: out[k] = v;
    }
  }
  return out;
}

/** The body fields and path params an op step's target resolves to. */
function resolveTarget(e: ScriptEntry, target: TargetRef, pageOf: { script: string; page_no: number } | undefined):
  { params: Record<string, string>; fields: Record<string, unknown> } {
  const w = server.world();
  if ('stop' in target) return { params: { id: stopOf(target.stop, e.id).id }, fields: {} };
  if ('driverTab' in target) {
    const d = w.drivers.find((x) => x.tab_no === target.driverTab);
    if (d === undefined) throw new Error(`runner ${e.id}: no driver with tab «${target.driverTab}»`);
    return { params: { id: d.id }, fields: {} };
  }
  if ('truckDay' in target) {
    const id = truckDayIdFor(w, truckIdOf(target.truckDay.plate, e.id), asBusinessDate(target.truckDay.date));
    if (id === null) throw new Error(`runner ${e.id}: no truck-day for «${target.truckDay.plate}» on ${target.truckDay.date}`);
    return { params: { id }, fields: {} };
  }
  if ('record' in target) {
    const fields: Record<string, unknown> = { record_key: ref(target.record.script, e.id) };
    if (pageOf !== undefined) fields.page_key = pageKey(ref(pageOf.script, e.id), pageOf.page_no);
    return { params: {}, fields };
  }
  if ('seedRecord' in target) {
    const today = businessDate(e.at);
    const r = w.records.find((x) => x.device_id === target.seedRecord.device && x.type === target.seedRecord.type
      && businessDate(x.occurred_at) === today);
    if (r === undefined) throw new Error(`runner ${e.id}: «${target.seedRecord.device}» has no ${target.seedRecord.type} today`);
    return { params: {}, fields: { record_key: r.key } };
  }
  if ('lastExport' in target) {
    const id = server.scriptRefs['S-49'] ?? w.exports.at(-1)?.id;
    if (id === undefined) throw new Error(`runner ${e.id}: there is no export to import`);
    return { params: { id }, fields: {} };
  }
  if ('bindCodeOf' in target) {
    // A code the runner created is stored as the code; one created live is stored as its row id (the event's result_id).
    const raw = ref(target.bindCodeOf, e.id);
    return { params: { code: server.stores.bindCodes.get(raw)?.code ?? raw }, fields: {} };
  }
  return { params: {}, fields: {} };
}

/** What a later entry refers to this one by: the created row's id, else the code it minted. */
function refOf(answer: unknown): string | null {
  if (!isRecord(answer)) return null;
  if (typeof answer.id === 'string') return answer.id;
  if (typeof answer.code === 'string') return answer.code;
  return null;
}

async function applyRecords(e: ScriptEntry, records: RecordTemplate[]): Promise<void> {
  for (const [i, r] of records.entries()) {
    const seq = server.mintSeq(r.device);
    const key = recordKey(r.device, seq);
    const captured: CapturedPage[] = r.pages.map((p) => ({ artefact: p.artefact, doc_index: p.doc_index,
      page_no: p.page_no, captured_at: p.at, source: 'DRAWN', bytes: MOCK_BYTES[p.artefact], quality: 'OK',
      quality_reasons: [], deferred: p.deferred, drawn: { variant: p.variant, value: p.value, sim_read: p.sim_read },
      image: null }));
    const pages = buildPages(key, captured);
    const stop = r.plan_key === null ? null : stopOf(r.plan_key, e.id);
    const placeId = stop?.place_id ?? (r.place_code === null ? null : placeIdOf(r.place_code, e.id));
    const payload = resolvePayload(e, r, pages.map((p) => p.key)) as Payloads[RecordType];
    const body = buildRecord({ deviceId: r.device, seq, occurredAt: r.occurred_at, committedAt: r.committed_at,
      stopId: stop?.id ?? null, placeId }, r.type, payload);
    const phone = clientFor({ id: r.device, role: 'driver' });
    at = r.committed_at;
    await call(phone, 'submitRecord', { params: {}, body });
    for (const page of pages) await call(phone, 'uploadPhoto', { params: {}, body: page });
    server.scriptRefs[i === 0 ? e.id : `${e.id}#${i + 1}`] = key;
  }
}

async function applyOp(e: ScriptEntry, step: Extract<ScriptStep, { kind: 'op' }>): Promise<void> {
  const { params, fields } = resolveTarget(e, step.target, step.pageOf);
  const client = clientFor(e.actor);
  let answer: unknown = null;
  at = e.at;
  for (const raw of step.bodies) {
    const body: Record<string, unknown> = { ...raw, ...fields };
    if (body.version === 'CURRENT') {
      const day = params.id === undefined ? undefined : server.stores.truckDays.get(params.id);
      if (day === undefined) throw new Error(`runner ${e.id}: version 'CURRENT' needs a truck-day target`);
      body.version = day.version;
    }
    answer = await dispatch(client, step.op, { params, body });
  }
  const made = refOf(answer);
  if (made !== null) server.scriptRefs[e.id] = made;
}

/** Applies one entry through the route table (see the header). An entry already applied or retired by a live twin is
 *  never applied again (§8.6 #20). */
export async function applyEntry(e: ScriptEntry): Promise<void> {
  if (server.done.includes(e.id)) return;
  await replaying(async () => {
    if (e.step.kind === 'record') await applyRecords(e, e.step.records);
    else await applyOp(e, e.step);
  });
  server.done.push(e.id);
}

/** Every bound phone the office could hear at `t` tells it so, so no rebuild or rewind raises «Без зв'язку» or any item
 *  the script does not contain (§5.8). A revoked phone is silent, and so are the stage's three while «Офлайн» is on;
 *  `unsent` is what the phone's outbox still holds (nothing, after a rebuild). */
async function heartbeats(t: Instant): Promise<void> {
  await replaying(async () => {
    at = t;
    for (const d of server.world().devices) {
      if (d.driver_id === null || (d.revoked_at !== null && atOrBefore(d.revoked_at, t))) continue;
      if (server.toggles.offline && STAGE_PHONES.includes(d.id)) continue;
      const unsent = (server.devices[d.id]?.outbox ?? []).filter((x) => x.state !== 'DONE' && !x.undone).length;
      await call(clientFor({ id: d.id, role: 'driver' }), 'sendHeartbeat', { params: {}, body: { unsent } });
    }
  });
}

function beatOf(n: number): Beat {
  const beat = BEATS.find((b) => b.n === n);
  if (beat === undefined) throw new Error(`runner: there is no «Такт ${n}»`);
  return beat;
}

/** «Такт n» (§5.8): a fresh server from the seed; every entry of an earlier beat (LIVE ones as scripted) plus every AUTO
 *  entry up to the beat's clock, in `at` order; heartbeats at that clock; the clock set there and LEFT FROZEN; the beat's
 *  phone, scope and cue on the stage; then 'rebuilt'. Ids come from each store's own sequence, so the same beat always
 *  yields the same ids. Callers that want a live clock call `server.clock.run()`. */
export async function rebuild(beat: number): Promise<void> {
  const b = beatOf(beat);
  server.reset();
  server.clock.freeze();
  for (const e of SCRIPT) {
    if ((e.beat !== null && lt(e.beat, beat)) || (e.mode === 'AUTO' && atOrBefore(e.at, b.clock))) await applyEntry(e);
  }
  await heartbeats(b.clock);
  server.clock.set(b.clock);
  server.setUi({ beat, phone: b.phone, scope: b.scope, cue: b.cue });
  server.emit({ type: 'rebuilt', beat });
}

/** «Перемотати до T» (§5.8): every undone entry before T, and every undone AUTO entry at T (a LIVE entry AT T is the
 *  action the presenter is about to perform), in `at` order; then the clock; then the heartbeats. Never backwards. */
export async function rewindTo(t: Instant): Promise<void> {
  if (!isBefore(server.clock.nowIso(), t)) return;
  for (const e of SCRIPT) {
    if (isBefore(e.at, t) || (e.mode === 'AUTO' && atOrBefore(e.at, t))) await applyEntry(e);
  }
  server.clock.set(t);
  await heartbeats(t);
}

/** One boot per realm: shared by every caller while it runs, and nothing at all once the server sits at a beat (a
 *  page test's `atBeat`, the stage, or an earlier boot already put it there). StrictMode-safe. */
let booting: Promise<void> | null = null;
export function ensureBooted(beat: number): Promise<void> {
  if (server.ui.beat !== null) return Promise.resolve();
  booting ??= rebuild(beat).finally(() => { booting = null; });
  return booting;
}

/** The rewind menu: only the checkpoints strictly after `now` (§5.4 #5). */
export function checkpointsAfter(now: Instant): { at: Instant; label: string }[] {
  return CHECKPOINTS.filter((c) => isBefore(now, c.at));
}

/** The plan key of the stop a record names, or null. */
function planKeyOf(stopId: unknown): string | null {
  return typeof stopId === 'string' ? server.stores.plannedStops.get(stopId)?.plan_key ?? null : null;
}
/** A live write does what this LIVE entry scripts: same actor and operation, and — where the entry says — the same
 *  record type, the same plan stop, an answer to a request. */
function fits(m: LiveMatch, ev: ChangedEvent): boolean {
  if (ev.actor.id !== m.actor_id || ev.op !== m.op) return false;
  const body = isRecord(ev.body) ? ev.body : {};
  if (m.record_type !== undefined && body.type !== m.record_type) return false;
  if (m.plan_key !== undefined && planKeyOf(body.stop_id) !== m.plan_key) return false;
  if (m.request === true && !(isRecord(body.payload) && typeof body.payload.request_id === 'string')) return false;
  return true;
}

/** Live twins retire their script entry (§5.8): the first undone LIVE entry of the current or an earlier beat that a
 *  live write matches is marked done and keeps the live values — «Перемотати» never replays it. Returns the stopper. */
export function watchLiveTwins(): () => void {
  return server.subscribe((ev) => {
    if (ev.type !== 'changed' || ev.replayed) return;
    const beat = server.ui.beat;
    if (beat === null) return;
    const twin = SCRIPT.find((e) => e.mode === 'LIVE' && e.match !== null && e.beat !== null && lte(e.beat, beat)
      && !server.done.includes(e.id) && fits(e.match, ev));
    if (twin === undefined) return;
    server.done.push(twin.id);
    const body = isRecord(ev.body) ? ev.body : {};
    const made = ev.op === 'submitRecord' && typeof body.key === 'string' ? body.key : ev.result_id;
    if (made !== null) server.scriptRefs[twin.id] = made;
  });
}

/** Reload recovery (§5.8): the logged writes, in order, through the same route table at their own moments. A replayed
 *  record also moves its phone's sequence past its seq, so the next record the phone mints cannot reuse the key. */
export async function replayWrites(writes: LoggedWrite[]): Promise<void> {
  await replaying(async () => {
    for (const w of writes) {
      if (w.op === 'submitRecord' && isRecord(w.body) && typeof w.body.seq === 'number') {
        const device = server.stores.devices.get(w.actor.id);
        if (device !== undefined && !gt(device.next_seq, w.body.seq)) {
          server.stores.devices.update(device.id, { next_seq: w.body.seq + 1 });
        }
      }
      at = w.at;
      await dispatch(clientFor(w.actor), w.op, { params: w.params, body: w.body });
    }
  });
}

/** The console route a beat opens (§5.6), resolved against the realm's world: '#/day/day-000012', '#/drivers?open=…'. */
export function consoleHash(beat: Beat): string {
  const r = beat.route;
  const w = server.world();
  if (r.kind === 'path') return `#${r.path}`;
  if (r.kind === 'truck-day') {
    const truck = w.trucks.find((t) => t.plate === r.plate);
    const id = truck === undefined ? null : truckDayIdFor(w, truck.id, asBusinessDate(r.date));
    return id === null ? '#/days' : `#/day/${id}`;
  }
  const driver = w.drivers.find((d) => d.tab_no === r.tab_no);
  return driver === undefined ? '#/drivers' : `#/drivers?open=${driver.id}`;
}
