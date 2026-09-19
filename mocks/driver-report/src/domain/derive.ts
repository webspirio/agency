// mocks/driver-report/src/domain/derive.ts
/** What the product computes from the driver's records, Ruptela's telemetry and the plan (§7.3, §4.2 C-01, C-08):
 *  truck-days, stops and their segments, departures, odometer points, legs and kilometres, the board state and its
 *  rank, the document dots, and the ТТН rows a loading creates. Pure functions over a `World` snapshot — the handlers
 *  that call them are thin.
 *
 *  Time: every function that takes `now` sees only what the server knew at `now` — a record once it was received, a
 *  page once it was received, telemetry once `at` passed. That is what lets «Перемотати до…» and a fixture built for
 *  the whole day answer for any moment of it. Unknown is `null`, never 0 (§8.6 #7).
 *
 *  Kilometres are whole numbers compared through num.ts; tonnes and t·km are decimal strings through @agency/dec. */
import { mul, sum } from '@agency/dec';
import { byCodepoint } from '@agency/mock';
import { fmtTime, fmtTimer } from '../app/format';
import { DC } from '../copy/driver';
import { atOrBefore, businessDate, cmpInstant, isBefore, kyivParts, minutesBetween } from './clock';
import type { DocDot } from './dto';
import { cmpNum, gt, gte, toInt } from './num';
import type { OdometerPoint } from './odometer';
import { TTN_CATALOGUE } from './seed';
import { TTN_FIELDS, type BusinessDate, type Correction, type Dec1, type Dec3, type Deferred, type DriverRecord,
  type Instant, type Km, type NoDocReason, type Odometer, type Page, type Place, type PlannedStop, type RecordOf,
  type SegmentChip, type Shift, type StopProblemKind, type Telemetry, type Trip, type Truck, type TtnDoc,
  type TtnField, type World } from './types';

export type StopFacts = { stop: PlannedStop; place: Place; truck_id: string; truck_day_id: string | null;
  arrived_at: Instant | null; arrival: 'DRIVER' | 'RUPTELA' | null; arrival_key: string | null;
  completed_at: Instant | null; completion_key: string | null; departed_at: Instant | null;
  departure: { kind: 'RECORD' | 'UNKNOWN' | 'RUPTELA'; at: Instant | null } | null;
  segments: { chip: SegmentChip; from: Instant }[];
  pages: Page[]; deferred: Deferred | null; no_doc_reason: NoDocReason | null; on_site_min: number | null;
  odometer: Odometer | null; accepted_at: Instant | null; problems: StopProblemKind[] };
export type Leg = { n: number; from_place_id: string; to_place_id: string; loaded: boolean; km: Km | null;
  planned_km: Km | null; mass: Dec3 | null; tkm: Dec1 | null; ttn_nos: string[]; arrival_driver: Instant | null;
  arrival_ttn: string | null; original_received: boolean };
export type BoardState = { state: string; line: string; since: Instant | null; rank: 1 | 2 | 3 | 4 | 5 | 6;
  at_stop_min: number | null; on_shift: boolean };

/* ── records and telemetry the server knows ─────────────────────────────── */

const byOccurred = (a: DriverRecord, b: DriverRecord): number =>
  cmpInstant(a.occurred_at, b.occurred_at) || cmpNum(a.seq, b.seq) || byCodepoint(a.key, b.key);

/** Voided records removed (by `voided_by`, or named by a `VOID`), in `occurred_at` order. */
export function liveRecords(w: World): DriverRecord[] {
  const voided = new Set(w.records.flatMap((r) => (r.type === 'VOID' ? [r.payload.target_key] : [])));
  return w.records.filter((r) => r.voided_by === null && !voided.has(r.key)).sort(byOccurred);
}
/** The live records the server had received by `now`. */
const knownRecords = (w: World, now: Instant): DriverRecord[] =>
  liveRecords(w).filter((r) => atOrBefore(r.received_at, now));

/** The truck's telemetry whose moment has passed, oldest first. The GPS toggle is the handler's to apply. */
export function visibleTelemetry(w: World, truckId: string, now: Instant): Telemetry[] {
  return w.telemetry.filter((t) => t.truck_id === truckId && atOrBefore(t.at, now))
    .sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id));
}
const received = (p: Page, now: Instant): boolean => p.received_at !== null && atOrBefore(p.received_at, now);
/** Whole minutes from → to, never negative (a phone clock ahead of the server must not print «−0:03»). */
const mins = (from: Instant, to: Instant): number => Math.max(0, minutesBetween(from, to));

/* ── the plan ───────────────────────────────────────────────────────────── */

const tripsById = (w: World): Map<string, Trip> => new Map(w.trips.map((t) => [t.id, t]));
/** Plan order: trip number, then the stop's place in the trip. */
function byPlan(trips: Map<string, Trip>): (a: PlannedStop, b: PlannedStop) => number {
  return (a, b) => byCodepoint(trips.get(a.trip_id)?.no ?? '', trips.get(b.trip_id)?.no ?? '') || cmpNum(a.seq, b.seq)
    || byCodepoint(a.id, b.id);
}
/** Every planned stop of the trips a truck drives on one business date, in plan order. */
function plannedStopsOf(w: World, truckId: string, date: BusinessDate): PlannedStop[] {
  const trips = tripsById(w);
  return w.plannedStops.filter((s) => { const t = trips.get(s.trip_id); return t?.truck_id === truckId && t.date === date; })
    .sort(byPlan(trips));
}
const placeById = (w: World, id: string | null): Place | null => (id === null ? null : w.places.find((p) => p.id === id) ?? null);
const baseId = (w: World): string => w.places.find((p) => p.kind === 'BASE')?.id ?? '';
const isBase = (w: World, placeId: string | null): boolean => placeById(w, placeId)?.kind === 'BASE';
/** What a stop is for: an unplanned stop takes the kind the driver gave it. */
const kindOf = (s: PlannedStop): string | null => (s.kind === 'UNPLANNED' ? s.unplanned_kind : s.kind);

/** The library's planned km between two places, either direction; 0 between a place and itself; null when unknown. */
export function plannedKm(w: World, fromPlaceId: string, toPlaceId: string): Km | null {
  if (fromPlaceId === toPlaceId) return 0;
  const from = placeById(w, fromPlaceId)?.code;
  const to = placeById(w, toPlaceId)?.code;
  if (from === undefined || to === undefined) return null;
  const hit = w.distances.find((d) => d.from_code === from && d.to_code === to)
    ?? w.distances.find((d) => d.from_code === to && d.to_code === from);
  return hit?.km ?? null;
}

/* ── truck-days ─────────────────────────────────────────────────────────── */

/** A truck-day is truck × the Kyiv business date of the shift start; one that never had a shift does not exist. */
export function truckDayIdFor(w: World, truckId: string, date: BusinessDate): string | null {
  return w.truckDays.find((d) => d.truck_id === truckId && d.date === date)?.id ?? null;
}
/** `READY` once every shift of the day has ended, `CONFIRMED` once confirmed (§7.3). A day with no shift keeps the
 *  status it was stored with (the fleet example's days). */
export function truckDayStatus(w: World, truckDayId: string): 'OPEN' | 'READY' | 'CONFIRMED' {
  const day = w.truckDays.find((d) => d.id === truckDayId);
  if (day === undefined) return 'OPEN';
  if (day.status === 'CONFIRMED') return 'CONFIRMED';
  const shifts = w.shifts.filter((s) => s.truck_day_id === truckDayId);
  if (shifts.length === 0) return day.status;
  const live = liveRecords(w);
  const ended = (s: Shift): boolean => s.ended_at !== null || live.some((r) => r.type === 'SHIFT_END' && r.shift_id === s.id);
  return shifts.every(ended) ? 'READY' : 'OPEN';
}

/* ── odometer readings ──────────────────────────────────────────────────── */

const INT = /^\d{1,9}$/;
/** The newest odometer correction of a record the office had made by `now`. */
function correctionOf(w: World, recordKey: string, now: Instant): Correction | null {
  return w.corrections.filter((c) => c.record_key === recordKey && c.field === 'odometer' && INT.test(c.new)
    && atOrBefore(c.at, now)).sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id)).at(-1) ?? null;
}
function odometerOf(r: DriverRecord): Odometer | null {
  switch (r.type) {
    case 'SHIFT_START': case 'SHIFT_END': case 'ARRIVED': case 'REFUEL': case 'DOCS_ADDED': return r.payload.odometer;
    default: return null;
  }
}
/** The record's reading as the office now holds it: the newest correction (source `OFFICE_EDIT`) over the driver's. */
function readingOf(w: World, r: DriverRecord, now: Instant): Odometer | null {
  const own = odometerOf(r);
  const c = correctionOf(w, r.key, now);
  if (c === null) return own;
  const base: Odometer = own ?? { value: null, source: 'OFFICE_EDIT', basis: 'NONE', expected: null, read: null,
    choice: 'AUTO', page_key: null };
  return { ...base, value: toInt(c.new), source: 'OFFICE_EDIT' };
}
/** An odometer flag nobody has corrected or resolved yet: `lastTrustedOf` skips such a point. */
function flaggedUnresolved(w: World, r: DriverRecord, now: Instant): boolean {
  if (!r.flags.some((f) => f.startsWith('ODOMETER_'))) return false;
  if (correctionOf(w, r.key, now) !== null) return false;
  return !w.resolutions.some((x) => (x.action === 'RESOLVE' || x.action === 'ACCEPT_AS_IS') && x.code.startsWith('ODOMETER_')
    && x.item_id.endsWith(`:${r.key}`) && atOrBefore(x.at, now));
}
const POINT_KIND: Partial<Record<DriverRecord['type'], OdometerPoint['kind']>> = {
  SHIFT_START: 'SHIFT_START', ARRIVED: 'ARRIVAL', REFUEL: 'REFUEL', SHIFT_END: 'SHIFT_END', DOCS_ADDED: 'DOCS' };
const placeOfRecord = (r: DriverRecord): string | null =>
  r.place_id ?? (r.type === 'SHIFT_END' ? r.payload.place_id : null);

/** Every odometer reading of a truck up to `until`: the driver's (shift starts, arrivals, refuels, shift ends,
 *  photos added later), the mechanic's, and CAN at each Ruptela IN/OUT — oldest first. */
export function odometerPoints(w: World, truckId: string, until: Instant): OdometerPoint[] {
  const points: OdometerPoint[] = [];
  for (const r of knownRecords(w, until)) {
    const kind = POINT_KIND[r.type];
    if (r.truck_id !== truckId || kind === undefined) continue;
    const odo = readingOf(w, r, until);
    if (odo === null) continue;
    const place = placeOfRecord(r);
    points.push({ at: r.occurred_at, value: odo.value, source: odo.source, kind, place_id: place,
      flagged: flaggedUnresolved(w, r, until), at_base: isBase(w, place), record_key: r.key });
  }
  const mech = w.trucks.find((t) => t.id === truckId)?.mechanic_reading ?? null;
  if (mech !== null && atOrBefore(mech.at, until)) {
    points.push({ at: mech.at, value: mech.value, source: 'OFFICE_EDIT', kind: 'MECHANIC', place_id: null, flagged: false,
      at_base: false, record_key: null });
  }
  for (const t of visibleTelemetry(w, truckId, until)) {
    if ((t.kind !== 'IN' && t.kind !== 'OUT') || t.can_km === null) continue;
    points.push({ at: t.at, value: t.can_km, source: 'CAN', kind: 'CAN', place_id: t.place_id, flagged: false,
      at_base: isBase(w, t.place_id), record_key: null });
  }
  return points.sort((a, b) => cmpInstant(a.at, b.at));
}

/* ── stops ──────────────────────────────────────────────────────────────── */

type Completion = RecordOf<'LOADED'> | RecordOf<'UNLOADED'> | RecordOf<'STOP_LEFT'>;
type Core = { facts: StopFacts; completion: Completion | null; records: DriverRecord[] };

/** Pages of these records, and every page that superseded one of them (a retake keeps its stop). */
function pagesOf(w: World, keys: ReadonlySet<string>, now: Instant): Page[] {
  const known = (p: Page): boolean => atOrBefore(p.received_at ?? p.captured_at, now);
  const out = w.pages.filter((p) => keys.has(p.record_key) && known(p));
  const seen = new Set(out.map((p) => p.key));
  for (let i = 0; i !== out.length; i += 1) {
    const next = out[i]?.superseded_by ?? null;
    const page = next === null || seen.has(next) ? undefined : w.pages.find((p) => p.key === next && known(p));
    if (page !== undefined) { out.push(page); seen.add(page.key); }
  }
  return out;
}

/** The k-th Ruptela IN at a place that day belongs to the k-th stop of that truck at that place, in plan order. */
function ruptelaIn(w: World, stop: PlannedStop, truckId: string, date: BusinessDate, now: Instant): Telemetry | null {
  const ins = visibleTelemetry(w, truckId, now)
    .filter((t) => t.kind === 'IN' && t.place_id === stop.place_id && businessDate(t.at) === date);
  const k = plannedStopsOf(w, truckId, date).filter((s) => s.place_id === stop.place_id).findIndex((s) => s.id === stop.id);
  return ins[Math.max(k, 0)] ?? null;
}

function core(w: World, stop: PlannedStop, now: Instant, known: DriverRecord[]): Core | null {
  const place = placeById(w, stop.place_id);
  const trip = w.trips.find((t) => t.id === stop.trip_id) ?? null;
  const records = known.filter((r) => r.stop_id === stop.id);
  const arrivalRec = records.find((r): r is RecordOf<'ARRIVED'> => r.type === 'ARRIVED') ?? null;
  const truckId = arrivalRec?.truck_id ?? records[0]?.truck_id ?? trip?.truck_id ?? null;
  if (place === null || truckId === null) return null;
  const truck = w.trucks.find((t) => t.id === truckId) ?? null;
  const rc = truck?.telematics === 'RUPTELA';
  const date = trip?.date ?? businessDate(arrivalRec?.occurred_at ?? now);
  const tin = rc ? ruptelaIn(w, stop, truckId, date, now) : null;

  const arrived_at = arrivalRec?.occurred_at ?? tin?.at ?? null;
  const arrival = arrivalRec !== null ? 'DRIVER' : tin !== null ? 'RUPTELA' : null;
  const completion = records.find((r): r is Completion => r.type === 'LOADED' || r.type === 'UNLOADED'
    || r.type === 'STOP_LEFT') ?? null;
  const completed_at = completion?.occurred_at ?? null;
  const payload = completion === null || completion.type === 'STOP_LEFT' ? null : completion.payload;

  // Departure: R+C the next OUT at the place (Ruptela); RG the completion's commit — or unknown when its photos were
  // deferred, because they were taken after the truck had already moved. Nothing is estimated from phone motion.
  const anchor = arrived_at ?? completed_at;
  const out = rc && anchor !== null
    ? visibleTelemetry(w, truckId, now).find((t) => t.kind === 'OUT' && t.place_id === stop.place_id && !isBefore(t.at, anchor))
    : undefined;
  const departure: StopFacts['departure'] = rc
    ? (out === undefined ? null : { kind: 'RUPTELA', at: out.at })
    : completion === null ? null
      : payload !== null && payload.deferred !== null ? { kind: 'UNKNOWN', at: null }
        : { kind: 'RECORD', at: completion.committed_at };
  const departed_at = departure?.at ?? null;

  // Segments: the arrival's chip, each SEGMENT, and «Чекаю вказівки» from a «Не приймають» inside the open stop.
  const segments: StopFacts['segments'] = [];
  if (arrivalRec?.payload.chip) segments.push({ chip: arrivalRec.payload.chip, from: arrivalRec.occurred_at });
  for (const r of records) {
    if (completed_at !== null && !isBefore(r.occurred_at, completed_at)) continue;
    if (r.type === 'SEGMENT') segments.push({ chip: r.payload.chip, from: r.occurred_at });
    if (r.type === 'STOP_PROBLEM' && r.payload.kind === 'NOT_ACCEPTED') segments.push({ chip: 'WAIT_ORDERS', from: r.occurred_at });
  }
  segments.sort((a, b) => cmpInstant(a.from, b.from));

  // The stop's point: the arrival's reading, else the one taken with the photos later, else CAN at the Ruptela IN.
  const docs = records.find((r): r is RecordOf<'DOCS_ADDED'> => r.type === 'DOCS_ADDED' && readingOf(w, r, now) !== null);
  const odometer = (arrivalRec === null ? null : readingOf(w, arrivalRec, now)) ?? (docs === undefined ? null : readingOf(w, docs, now))
    ?? (tin === null || tin.can_km === null ? null
      : { value: tin.can_km, source: 'CAN', basis: 'CAN_DELTA', expected: tin.can_km, read: null, choice: 'AUTO', page_key: null });

  const problems = records.flatMap((r) => (r.type === 'STOP_PROBLEM' ? [r.payload.kind] : []))
    .filter((k, i, all) => all.indexOf(k) === i);
  const truck_day_id = records.find((r) => r.truck_day_id !== null)?.truck_day_id ?? truckDayIdFor(w, truckId, date);
  const facts: StopFacts = { stop, place, truck_id: truckId, truck_day_id, arrived_at, arrival,
    arrival_key: arrivalRec?.key ?? null, completed_at, completion_key: completion?.key ?? null, departed_at, departure,
    segments, pages: pagesOf(w, new Set(records.map((r) => r.key)), now), deferred: payload?.deferred ?? null,
    no_doc_reason: payload?.no_doc_reason ?? null,
    on_site_min: arrived_at === null ? null : mins(arrived_at, completed_at ?? departed_at ?? now), odometer,
    accepted_at: stop.accepted_at !== null && atOrBefore(stop.accepted_at, now) ? stop.accepted_at : null, problems };
  return { facts, completion, records };
}

/** A stop opens at ARRIVED (or a Ruptela IN at its place on an R+C truck) and completes at LOADED / UNLOADED /
 *  STOP_LEFT; «На місці» = completion − arrival, final at the commit (§7.3). */
export function stopFacts(w: World, stopId: string, now: Instant): StopFacts | null {
  const stop = w.plannedStops.find((s) => s.id === stopId);
  return stop === undefined ? null : core(w, stop, now, knownRecords(w, now))?.facts ?? null;
}

function coresOfDay(w: World, truckDayId: string, now: Instant): Core[] {
  const day = w.truckDays.find((d) => d.id === truckDayId);
  if (day === undefined) return [];
  const planned = plannedStopsOf(w, day.truck_id, day.date);
  const ids = new Set(planned.map((s) => s.id));
  // A stop the day's records name but the truck's own plan does not (another truck's trip, an unplanned place).
  const known = knownRecords(w, now);
  for (const r of known) {
    if (r.truck_day_id === truckDayId && r.stop_id !== null && !ids.has(r.stop_id)) {
      const s = w.plannedStops.find((p) => p.id === r.stop_id);
      if (s !== undefined) { planned.push(s); ids.add(s.id); }
    }
  }
  return planned.sort(byPlan(tripsById(w))).flatMap((s) => core(w, s, now, known) ?? []);
}
/** Every stop of a truck-day, planned and unplanned, in plan order. */
export function stopsOfDay(w: World, truckDayId: string, now: Instant): StopFacts[] {
  return coresOfDay(w, truckDayId, now).map((c) => c.facts);
}

/* ── ТТН aboard, masses, legs ───────────────────────────────────────────── */

const docOf = (w: World, no: string): TtnDoc | null => w.ttnDocs.find((d) => d.no === no) ?? null;
function ttnNos(w: World, stop: PlannedStop, side: 'LOADING' | 'DROP'): string[] {
  if (stop.ttn_nos.length !== 0) return [...stop.ttn_nos];
  return w.ttnDocs.filter((d) => (side === 'LOADING' ? d.loading_stop_id : d.drop_stop_id) === stop.id).map((d) => d.no);
}
const TONNES = /^\d{1,6}(\.\d{1,3})?$/;
/** A ТТН's net mass: the office's (or OCR-accepted) field, else the plan's drop that carries this ТТН alone. */
function massOf(w: World, no: string): Dec3 | null {
  const typed = docOf(w, no)?.fields.mass?.value.replace(/\s/g, '').replace(',', '.') ?? null;
  if (typed !== null && TONNES.test(typed)) return typed;
  const single = (s: PlannedStop): boolean => s.ttn_nos.length === 1 && s.ttn_nos[0] === no && s.mass_t !== null;
  const plan = w.plannedStops.find((s) => kindOf(s) === 'DROP' && single(s))
    ?? w.plannedStops.find((s) => kindOf(s) === 'LOADING' && single(s));
  return plan?.mass_t ?? null;
}
/** Passing a stop: a loading puts its ТТН aboard once loaded (or, on R+C, once the truck left with nothing recorded);
 *  a drop takes its ТТН off once unloaded (or left). */
function pass(w: World, aboard: string[], c: Core): string[] {
  const kind = kindOf(c.facts.stop);
  const left = c.completion === null && c.facts.departed_at !== null;
  if (kind === 'LOADING' && (c.completion?.type === 'LOADED' || left)) {
    return [...aboard, ...ttnNos(w, c.facts.stop, 'LOADING').filter((no) => !aboard.includes(no))];
  }
  if (kind === 'DROP' && (c.completion?.type === 'UNLOADED' || left)) {
    const off = ttnNos(w, c.facts.stop, 'DROP');
    return aboard.filter((no) => !off.includes(no));
  }
  return aboard;
}
/** The ТТН arrival mark the office typed for this stop (loading row or unloading row of the reverse side). */
function ttnArrival(w: World, stop: PlannedStop): string | null {
  const drop = kindOf(stop) === 'DROP';
  const field: TtnField = drop ? 'drop_arrival' : 'arrival';
  const docs = w.ttnDocs.filter((d) => (drop ? d.drop_stop_id : d.loading_stop_id) === stop.id)
    .sort((a, b) => cmpNum(a.doc_index, b.doc_index));
  return docs.map((d) => d.fields[field]?.value ?? null).find((v) => v !== null) ?? null;
}

type Point = { place_id: string; value: Km | null; core: Core | null };
const recordOf = <T extends DriverRecord['type']>(recs: DriverRecord[], type: T, shift: Shift): RecordOf<T> | null =>
  (recs.find((r) => r.type === type && (r.shift_id === shift.id || (type === 'SHIFT_START' && r.key === shift.start_key)))
    ?? null) as RecordOf<T> | null;

/** Legs: consecutive points of each shift — its start, every stop it arrived at (refuels are not leg ends, the base
 *  stop is the shift end), its end. Loaded while any ТТН is aboard; a leg with an unknown point is unknown. */
export function legsOfDay(w: World, truckDayId: string, now: Instant): Leg[] {
  const cores = coresOfDay(w, truckDayId, now)
    .filter((c) => c.facts.arrived_at !== null && c.facts.stop.kind !== 'BASE')
    .sort((a, b) => cmpInstant(a.facts.arrived_at ?? now, b.facts.arrived_at ?? now));
  const shifts = w.shifts.filter((s) => s.truck_day_id === truckDayId && atOrBefore(s.started_at, now))
    .sort((a, b) => cmpInstant(a.started_at, b.started_at));
  const recs = knownRecords(w, now);
  const home = baseId(w);
  const value = (r: DriverRecord | null): Km | null => (r === null ? null : readingOf(w, r, now)?.value ?? null);
  const legs: Leg[] = [];
  let aboard: string[] = [];
  shifts.forEach((shift, i) => {
    const next = shifts[i + 1];
    const mine = cores.filter((c) => {
      const at = c.facts.arrived_at ?? now;
      return (i === 0 || !isBefore(at, shift.started_at)) && (next === undefined || isBefore(at, next.started_at));
    });
    const start = recordOf(recs, 'SHIFT_START', shift);
    const end = recordOf(recs, 'SHIFT_END', shift);
    const points: Point[] = [
      { place_id: start?.place_id ?? home, value: value(start), core: null },
      ...mine.map((c): Point => ({ place_id: c.facts.stop.place_id, value: c.facts.odometer?.value ?? null, core: c })),
      ...(end === null ? [] : [{ place_id: end.place_id ?? end.payload.place_id ?? home, value: value(end), core: null }]),
    ];
    points.forEach((a, k) => {
      const b = points[k + 1];
      if (a.core !== null) aboard = pass(w, aboard, a.core);
      if (b === undefined) return;
      const km = a.value === null || b.value === null ? null : b.value - a.value;
      const masses = aboard.map((no) => massOf(w, no));
      const mass = aboard.length === 0 || masses.includes(null) ? null : sum(masses as string[], 3);
      legs.push({ n: legs.length + 1, from_place_id: a.place_id, to_place_id: b.place_id, loaded: aboard.length !== 0, km,
        planned_km: plannedKm(w, a.place_id, b.place_id), mass, tkm: mass === null || km === null ? null : mul(mass, String(km), 1),
        ttn_nos: [...aboard], arrival_driver: b.core?.facts.arrived_at ?? null,
        arrival_ttn: b.core === null ? null : ttnArrival(w, b.core.facts.stop),
        original_received: aboard.length !== 0 && aboard.every((no) => (docOf(w, no)?.original ?? null) !== null) });
    });
  });
  return legs;
}

/** The day's kilometres, loaded, empty and t·km; any unknown leg makes its total unknown, never a smaller number. */
export function dayTotals(legs: Leg[]): { km: Km | null; loaded: Km | null; empty: Km | null; tkm: Dec1 | null } {
  if (legs.length === 0) return { km: null, loaded: null, empty: null, tkm: null };
  const total = (ls: Leg[]): Km | null => (ls.some((l) => l.km === null) ? null : ls.reduce((acc, l) => acc + (l.km ?? 0), 0));
  const loaded = legs.filter((l) => l.loaded);
  return { km: total(legs), loaded: total(loaded), empty: total(legs.filter((l) => !l.loaded)),
    tkm: loaded.some((l) => l.tkm === null) ? null : sum(loaded.map((l) => l.tkm ?? '0'), 1) };
}

/* ── documents ──────────────────────────────────────────────────────────── */

/** Distinct received page slots of one kind (a retake fills the slot it replaced, it does not add one). */
function slots(pages: Page[], artefact: Page['artefact'], now: Instant): number {
  return new Set(pages.filter((p) => p.artefact === artefact && received(p, now)).map((p) => `${p.doc_index}:${p.page_no}`)).size;
}
function dot(got: number, expected: number): DocDot {
  if (expected === 0 || got === 0) return 'none';
  return gte(got, expected) ? 'full' : 'part';
}
/** ТТН pages a loading owes: the pages it names, else a front and a back per ТТН — none when it said «Немає документа»
 *  or deferred them. */
function pagesExpected(c: RecordOf<'LOADED'>): number {
  if (c.payload.pages.length !== 0) return c.payload.pages.length;
  return c.payload.no_doc_reason !== null || c.payload.deferred !== null ? 0 : c.payload.ttn_count + c.payload.ttn_count;
}

/** The DocDots of C-01 and the counts behind «Документи: 5 з 5 в офісі» and the paper still owed (§4.2). */
export function docCounts(w: World, truckDayId: string, now: Instant): { ttn: DocDot; signed: DocDot;
  receipts: DocDot; label: string; in_office: number; total: number; owed: string[] } {
  const cores = coresOfDay(w, truckDayId, now);
  let ttnPages = 0; let ttnPagesGot = 0; let ttnDue = 0; let ttnGot = 0; let ttnPlanned = 0;
  let signedDue = 0; let signedGot = 0; let signedPlanned = 0;
  const owed: string[] = [];
  for (const c of cores) {
    const kind = kindOf(c.facts.stop);
    const done = c.completion;
    if (kind === 'LOADING') {
      if (done?.type !== 'LOADED') { ttnPlanned += c.facts.stop.ttn_expected; continue; }
      const n = Math.max(done.payload.ttn_count, 0);
      const fronts = Math.min(slots(c.facts.pages, 'TTN_FRONT', now), n);
      const backs = Math.min(slots(c.facts.pages, 'TTN_BACK', now), n);
      ttnPlanned += n; ttnDue += n; ttnGot += Math.min(fronts, backs);
      ttnPages += pagesExpected(done); ttnPagesGot += fronts + backs;
      owed.push(...ttnNos(w, c.facts.stop, 'LOADING').filter((no) => {
        const original = docOf(w, no)?.original ?? null;
        return original === null || !atOrBefore(original.received_at, now);
      }));
    }
    if (kind === 'DROP') {
      const n = Math.max(ttnNos(w, c.facts.stop, 'DROP').length, 1);
      signedPlanned += n;
      if (done?.type !== 'UNLOADED') continue;
      signedDue += n; signedGot += Math.min(slots(c.facts.pages, 'TTN_SIGNED', now), n);
    }
  }
  const refuels = knownRecords(w, now).filter((r) => r.truck_day_id === truckDayId && r.type === 'REFUEL');
  const receiptsGot = refuels.filter((r) => slots(pagesOf(w, new Set([r.key]), now), 'RECEIPT', now) !== 0).length;
  return {
    ttn: dot(ttnPagesGot, ttnPages), signed: dot(signedGot, signedDue), receipts: dot(receiptsGot, refuels.length),
    label: `ТТН: ${ttnGot} з ${ttnPlanned} · підписані: ${signedGot} з ${signedPlanned} · чеки: ${receiptsGot}`,
    in_office: ttnGot + signedGot + receiptsGot, total: ttnDue + signedDue + refuels.length, owed,
  };
}

/** One `TtnDoc` per ТТН of the loading's planned stop, in plan order: what OCR will suggest, nothing confirmed yet.
 *  `_now` is in the pinned signature (I-12); nothing here depends on the clock. */
export function newTtnDocs(w: World, loaded: RecordOf<'LOADED'>, _now: Instant): Omit<TtnDoc, 'id'>[] {
  const stop = w.plannedStops.find((s) => s.id === loaded.stop_id);
  if (stop === undefined) return [];
  const trip = w.trips.find((t) => t.id === stop.trip_id) ?? null;
  const drops = w.plannedStops.filter((s) => kindOf(s) === 'DROP')
    .sort((a, b) => cmpNum(a.trip_id === stop.trip_id ? 0 : 1, b.trip_id === stop.trip_id ? 0 : 1));
  const blank = (): Record<TtnField, null> => Object.fromEntries(TTN_FIELDS.map((f) => [f, null])) as Record<TtnField, null>;
  return stop.ttn_nos.map((no, i) => ({ no, label: `ТТН ${no}`, date: trip?.date ?? businessDate(loaded.occurred_at),
    trip_no: trip?.no ?? '', driver_id: loaded.driver_id, loading_stop_id: stop.id,
    drop_stop_id: drops.find((d) => d.ttn_nos.includes(no))?.id ?? null, doc_index: i + 1, ttn_count: stop.ttn_nos.length,
    fields: blank(), ocr: { ...blank(), ...TTN_CATALOGUE[no] },
    blank_reverse: false, original: null, driver_said_handed: null, ettn: null, note: null, example: false }));
}

/* ── the board (§4.2 C-01) ──────────────────────────────────────────────── */

const REGIS = 'позиція — з Регісу, фаза 2';
/** What the RG line calls the driver's last positional record; null for the records that say nothing about where
 *  the truck is (the attestation, request and correction replies, a retake, a void). */
function eventWord(r: DriverRecord): string | null {
  switch (r.type) {
    case 'SHIFT_START': return 'Зміну почато';
    case 'SHIFT_END': return 'Зміну закінчено';
    case 'ARRIVED': return 'Я на місці';
    case 'SEGMENT': return DC.segments[r.payload.chip];
    case 'LOADED': return 'Завантажено';
    case 'UNLOADED': return 'Вивантажено';
    case 'DOCS_ADDED': return 'Фото додано';
    case 'STOP_LEFT': return 'Поїхав далі';
    case 'REFUEL': return 'Заправка';
    case 'ROAD_STOP': return `Стою: ${DC.roadStopShort[r.payload.reason]}`;
    case 'ROAD_STOP_END': return 'Закінчилось';
    case 'STOP_PROBLEM': return 'Проблема на місці';
    case 'CALL_ME': return 'Подзвоніть мені';
    default: return null;
  }
}

/** RG: «остання подія: Я на місці 06:10 · Вільнянськ · 2:14 тому · позиція — з Регісу, фаза 2». */
function regisLine(w: World, recs: DriverRecord[], now: Instant): string {
  const ev = [...recs].reverse().find((r) => eventWord(r) !== null);
  if (ev === undefined) return REGIS;
  const town = placeById(w, placeOfRecord(ev))?.town ?? null;
  return [`остання подія: ${eventWord(ev) ?? ''} ${fmtTime(ev.occurred_at)}`, town,
    `${fmtTimer(mins(ev.occurred_at, now))} тому`, REGIS].filter((x) => x !== null).join(' · ');
}
/** R+C: Ruptela reports every few minutes; the age of the last position is simulated from the clock (the row carries
 *  «імітація»). */
function ruptelaLine(now: Instant): string {
  const n = kyivParts(now).mi % 5;
  return n === 0 ? 'Ruptela · позиція щойно' : `Ruptela · позиція ${n} хв тому`;
}
/** R+C: the newest positional fact (telemetry at a place, or a record at a place) says the truck is at base. */
function atBase(w: World, truckId: string, recs: DriverRecord[], now: Instant): boolean {
  const tel = visibleTelemetry(w, truckId, now).filter((t) => t.place_id !== null).at(-1) ?? null;
  const rec = recs.filter((r) => placeOfRecord(r) !== null).at(-1) ?? null;
  if (tel !== null && (rec === null || !isBefore(tel.at, rec.occurred_at))) return isBase(w, tel.place_id) && tel.kind !== 'OUT';
  return rec !== null && isBase(w, placeOfRecord(rec));
}
function shiftEndAt(recs: DriverRecord[], shift: Shift, now: Instant): Instant | null {
  const end = recs.find((r) => r.type === 'SHIFT_END' && r.shift_id === shift.id);
  if (end !== undefined) return end.occurred_at;
  return shift.ended_at !== null && atOrBefore(shift.ended_at, now) ? shift.ended_at : null;
}
function attestedAt(recs: DriverRecord[], shift: Shift, now: Instant): Instant | null {
  const rec = recs.find((r) => r.type === 'DRIVER_ATTESTED' && (r.shift_id === shift.id || r.payload.shift_id === shift.id));
  if (rec !== undefined) return rec.occurred_at;
  return shift.attested_at !== null && atOrBefore(shift.attested_at, now) ? shift.attested_at : null;
}
function plannedStart(w: World, truckId: string, date: BusinessDate): Instant | null {
  return w.trips.filter((t) => t.truck_id === truckId && t.date === date).flatMap((t) => (t.planned_start === null ? [] : [t.planned_start]))
    .sort(cmpInstant)[0] ?? null;
}
function driverIdOf(w: World, truck: Truck, date: BusinessDate): string | null {
  const trip = w.trips.filter((t) => t.truck_id === truck.id && t.date === date).sort((a, b) => byCodepoint(a.no, b.no))[0];
  return trip?.driver_id ?? w.drivers.find((d) => d.truck_id === truck.id)?.id ?? null;
}
function deviceBound(w: World, driverId: string, now: Instant): boolean {
  return w.devices.some((d) => d.driver_id === driverId && d.bound_at !== null && atOrBefore(d.bound_at, now)
    && (d.revoked_at === null || isBefore(now, d.revoked_at)));
}
/** The ROAD_STOP still open: no ROAD_STOP_END names it and, on R+C, no MOTION telemetry came after it. */
function openRoadStop(w: World, truck: Truck, recs: DriverRecord[], now: Instant): RecordOf<'ROAD_STOP'> | null {
  const motion = truck.telematics === 'RUPTELA'
    ? visibleTelemetry(w, truck.id, now).filter((t) => t.kind === 'MOTION').map((t) => t.at) : [];
  const open = recs.filter((r): r is RecordOf<'ROAD_STOP'> => r.type === 'ROAD_STOP'
    && !recs.some((e) => e.type === 'ROAD_STOP_END' && e.payload.road_stop_key === r.key)
    && !motion.some((at) => isBefore(r.occurred_at, at)));
  return open.at(-1) ?? null;
}

const LOADING_NOW: readonly SegmentChip[] = ['LOADING_NOW', 'DRIVE_IN'];
const UNLOADING_NOW: readonly SegmentChip[] = ['UNLOADING_NOW', 'DRIVE_IN', 'TTN_SHOWN'];
/** A truck standing at an open stop: queue, loading, unloading, or «Не приймають». */
function atStop(c: Core, now: Instant): BoardState {
  const f = c.facts;
  const arrived = f.arrived_at ?? now;
  const at_stop_min = mins(arrived, now);
  const rank = gt(at_stop_min, 120) ? 3 : 5;
  const base = { rank, at_stop_min, on_shift: true } as const;
  const problem = c.records.filter((r) => r.type === 'STOP_PROBLEM' && r.payload.kind === 'NOT_ACCEPTED').at(-1);
  if (problem !== undefined) {
    return { ...base, state: 'Стоїть', line: `Не приймають · ${fmtTimer(mins(problem.occurred_at, now))}`, since: problem.occurred_at };
  }
  const seg = f.segments.at(-1) ?? null;
  const since = seg?.from ?? arrived;
  const t = fmtTimer(mins(since, now));
  const kind = kindOf(f.stop);
  const queue = seg?.chip === 'QUEUE' || (seg === null && f.arrival === 'RUPTELA');
  const lead = seg === null ? (f.arrival === 'RUPTELA' ? 'Ruptela · ' : '') : `${DC.segments[seg.chip]} · `;
  if (kind === 'LOADING' || kind === 'DROP') {
    const loading = kind === 'LOADING';
    if (queue) return { ...base, state: loading ? 'У черзі на завантаження' : 'У черзі на вивантаження', line: `${lead}${t}`, since };
    if (seg !== null && (loading ? LOADING_NOW : UNLOADING_NOW).includes(seg.chip)) {
      return { ...base, state: loading ? 'Завантажується' : 'Вивантажується', line: t, since };
    }
    return { ...base, state: loading ? 'На завантаженні' : 'На вивантаженні', line: `${lead}${t}`, since };
  }
  if (kind === 'BASE') return { ...base, state: 'На базі', line: `${lead}${t}`, since };
  return { ...base, state: `На місці · ${f.place.label}`, line: `${lead}${t}`, since };
}

function onShift(w: World, truck: Truck, shift: Shift, recs: DriverRecord[], now: Instant): BoardState {
  const rc = truck.telematics === 'RUPTELA';
  const mine = recs.filter((r) => r.shift_id === shift.id || !isBefore(r.occurred_at, shift.started_at));
  const road = openRoadStop(w, truck, mine, now);
  if (road !== null) {
    return { state: 'Стоїть', line: `${DC.roadStopShort[road.payload.reason]} · ${fmtTimer(mins(road.occurred_at, now))}`,
      since: road.occurred_at, rank: 4, at_stop_min: null, on_shift: true };
  }
  const cores = coresOfDay(w, shift.truck_day_id, now);
  const arrivedAt = (c: Core): Instant => c.facts.arrived_at ?? now;
  const open = cores.filter((c) => c.facts.arrived_at !== null && c.facts.completed_at === null && c.facts.departed_at === null)
    .sort((a, b) => cmpInstant(arrivedAt(a), arrivedAt(b))).at(-1);
  if (open !== undefined) return atStop(open, now);

  const passedAt = (c: Core): Instant => c.facts.departed_at ?? c.facts.completed_at ?? arrivedAt(c);
  const passed = cores.filter((c) => c.facts.completed_at !== null || c.facts.departed_at !== null)
    .sort((a, b) => cmpInstant(passedAt(a), passedAt(b)));
  const last = passed.at(-1);
  const moving = { rank: 5, at_stop_min: null, on_shift: true } as const;
  const home = baseId(w);
  const toward = (fromPlace: string, c: Core): string => {
    const km = plannedKm(w, fromPlace, c.facts.stop.place_id);
    return `до ${c.facts.place.town_gen}${km === null ? '' : ` ${km} км`}`;
  };
  const plan = cores.map((c) => c.facts.stop.id);
  const nextAfter = (from: number): Core | undefined => cores.find((c, i) => gt(i, from)
    && c.facts.arrived_at === null && c.facts.completed_at === null && c.facts.stop.kind !== 'BASE');

  if (last === undefined) {
    const next = nextAfter(-1);
    const out = rc ? visibleTelemetry(w, truck.id, now).find((t) => t.kind === 'OUT' && isBase(w, t.place_id)
      && !isBefore(t.at, shift.started_at)) : undefined;
    if (out !== undefined && next !== undefined && kindOf(next.facts.stop) === 'LOADING') {
      return { ...moving, state: `Порожній, їде на завантаження · ${toward(home, next)}`, line: '', since: out.at };
    }
    return { ...moving, state: `На зміні · ${fmtTimer(mins(shift.started_at, now))}`,
      line: rc ? ruptelaLine(now) : regisLine(w, recs, now), since: shift.started_at };
  }

  const done = last.completion;
  if (done?.type === 'LOADED') {
    const expected = pagesExpected(done);
    const got = slots(last.facts.pages, 'TTN_FRONT', now) + slots(last.facts.pages, 'TTN_BACK', now);
    if (expected !== 0 && !gte(got, expected)) {
      return { ...moving, state: `Завантажено ${fmtTime(done.occurred_at)} · ${done.payload.ttn_count} ТТН (${expected} стор.) · фото ще в дорозі`,
        line: '', since: done.occurred_at };
    }
  }
  if (done?.type === 'UNLOADED' && done.payload.deferred !== null
    && !last.records.some((r) => r.type === 'DOCS_ADDED')) {
    return { ...moving, state: 'Вивантажено, чекає документ', line: '', since: done.occurred_at };
  }

  const aboard = passed.reduce((acc, c) => pass(w, acc, c), [] as string[]);
  const next = nextAfter(plan.indexOf(last.facts.stop.id));
  const since = passedAt(last);
  const t = fmtTimer(mins(since, now));
  if (aboard.length !== 0) {
    return { ...moving, state: 'Їде завантажений', line: `${t} · ${next === undefined ? 'до бази' : toward(last.facts.stop.place_id, next)}`, since };
  }
  if (next !== undefined && kindOf(next.facts.stop) === 'LOADING') {
    return { ...moving, state: `Порожній, їде на завантаження · ${toward(last.facts.stop.place_id, next)}`, line: '', since };
  }
  return { ...moving, state: 'Їде порожній', line: next === undefined ? 'до бази' : `${t} · ${toward(last.facts.stop.place_id, next)}`, since };
}

/** A pure function of the truck's latest facts (§4.2 C-01). Rank 3 at a stop over 2 h, 4 standing on the road, 5 on
 *  shift, 6 not on shift; ranks 1–2 come from open items and are the office view's to set. */
export function boardState(w: World, truckId: string, now: Instant): BoardState {
  const truck = w.trucks.find((t) => t.id === truckId);
  const off = (state: string, line: string, since: Instant | null): BoardState =>
    ({ state, line, since, rank: 6, at_stop_min: null, on_shift: false });
  if (truck === undefined) return off('Не на зміні', '', null);
  const today = businessDate(now);
  const rc = truck.telematics === 'RUPTELA';
  const recs = knownRecords(w, now).filter((r) => r.truck_id === truckId);
  const shift = w.shifts.filter((s) => s.truck_id === truckId && atOrBefore(s.started_at, now))
    .sort((a, b) => cmpInstant(a.started_at, b.started_at)).at(-1);
  const ended = shift === undefined ? null : shiftEndAt(recs, shift, now);
  if (shift !== undefined && ended === null) return onShift(w, truck, shift, recs, now);

  const position = rc ? ruptelaLine(now) : regisLine(w, recs, now);
  if (shift !== undefined && ended !== null && businessDate(ended) === today) {
    const day = w.truckDays.find((d) => d.id === shift.truck_day_id);
    const confirmed = day?.status === 'CONFIRMED' && day.confirmed_at !== null && atOrBefore(day.confirmed_at, now)
      ? day.confirmed_at : null;
    const attested = attestedAt(recs, shift, now);
    const tail = confirmed !== null ? `день підтверджено ${fmtTime(confirmed)}`
      : attested !== null ? `водій підтвердив ${fmtTime(attested)}` : 'водій не підтвердив';
    return off(`Не на зміні · закінчив ${fmtTime(ended)} · ${tail}`, position, ended);
  }
  const driverId = driverIdOf(w, truck, today);
  const driver = w.drivers.find((d) => d.id === driverId);
  if (driver?.mode === 'PAPER') return off('Не на зміні · ПАПІР', '', null);
  if (driverId === null || !deviceBound(w, driverId, now)) return off('Не на зміні · телефон не підключено', '', null);
  const plan = plannedStart(w, truckId, today);
  const planPart = plan === null ? '' : ` · план з ${fmtTime(plan)}`;
  if (rc && atBase(w, truckId, recs, now)) return off(`На базі${planPart}`, position, null);
  return off(`Не на зміні${planPart}`, position, null);
}

/** Board order: rank, then plate by code point. */
export function compareBoard(a: { rank: number; plate: string }, b: { rank: number; plate: string }): number {
  return cmpNum(a.rank, b.rank) || byCodepoint(a.plate, b.plate);
}
