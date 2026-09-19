// mocks/driver-report/src/domain/views/driver.ts
/** What the phone is told (§7.4 operations 1–4 and `DriverToday`), what a driver's record becomes when it lands (the
 *  shift it joins, the flags it carries — never a refusal, §7.3), and the console toast a driver's write raises (§5.9
 *  #4). Pure functions over a `World` snapshot; the handlers in `src/api/handlers/driver.ts` only store what these
 *  return.
 *
 *  `DriverToday` carries raw facts, not a mode: the phone derives its mode with `project.ts` over this plus its outbox.
 *  Everything here is time-gated to `now` — a record once received, a request once created, a page once received.
 *  The words test scans this file, comments included (§0.3). */
import { div, mul, round, sum } from '@agency/dec';
import { byCodepoint } from '@agency/mock';
import { fmtDateTime, fmtDec, fmtKm, fmtMass, fmtTime } from '../../app/format';
import { DC } from '../../copy/driver';
import { OC } from '../../copy/office';
import { addSeconds, atOrBefore, businessDate, cmpInstant, isBefore } from '../clock';
import { dayTotals, docCounts, legsOfDay, liveRecords, odometerPoints, plannedKm, stopsOfDay, truckDayStatus,
  visibleTelemetry } from '../derive';
import type { AutoEventView, BindPreview, CorrectionView, DaySummaryView, DriverToday, OdometerRefView, OnCallView,
  PaperReceipt, PlaceOption, PlannedStopView, RecordView, RequestCardView, ShiftView } from '../dto';
import { cmpNum, toInt } from '../num';
import { lastTrustedOf, odometerFlags, type OdometerPoint } from '../odometer';
import { DIESEL_PRICE_KOP } from '../seed';
import { FLAG_CODES, type ArtefactKind, type BindCode, type BusinessDate, type Correction, type Driver, type DriverRecord,
  type FlagCode, type Instant, type Km, type Odometer, type OdometerSource, type OfficeRole, type Page, type PlannedStop,
  type RecordOf, type Request, type RetakeReason, type Shift, type Trip, type Truck, type World } from '../types';
import { onSiteMinutes, roadStopMinutes, shiftMinutes } from '../worktime';

/* ── people and places ─────────────────────────────────────────────────── */

/** «Павло Ватаманюк»: the given name, then the family name (`full_name` is stored family name first). */
export function displayName(d: Driver): string {
  const family = d.full_name.split(' ')[0] ?? '';
  return family === '' ? d.first_name : `${d.first_name} ${family}`;
}
const NEW_PLACE = 'Нове місце';
const placeOf = (w: World, id: string | null) => (id === null || id === '' ? null : w.places.find((p) => p.id === id) ?? null);
const baseId = (w: World): string | null => w.places.find((p) => p.kind === 'BASE')?.id ?? null;
const userShort = (w: World, id: string): string => w.officeUsers.find((u) => u.id === id)?.short_name ?? id;
/** Where a record says it happened: its own place, or the place a shift end names. */
const placeOfRecord = (r: DriverRecord): string | null => r.place_id ?? (r.type === 'SHIFT_END' ? r.payload.place_id : null);
const byStart = (a: Shift, b: Shift): number => cmpInstant(a.started_at, b.started_at) || byCodepoint(a.id, b.id);
const byOccurred = (a: DriverRecord, b: DriverRecord): number =>
  cmpInstant(a.occurred_at, b.occurred_at) || cmpNum(a.seq, b.seq) || byCodepoint(a.key, b.key);
const known = (w: World, now: Instant): DriverRecord[] => liveRecords(w).filter((r) => atOrBefore(r.received_at, now));

/* ── binding (§3.3 D-01) ───────────────────────────────────────────────── */

/** The newest code with these digits the office had shown by `now`. */
export function codeAt(w: World, code: string, now: Instant): BindCode | null {
  return w.bindCodes.filter((b) => b.code === code && atOrBefore(b.created_at, now))
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).at(-1) ?? null;
}
/** Used once it bound a phone, expired at `expires_at`, unknown when there is no such code. */
export function bindStatus(b: BindCode | null, now: Instant): BindPreview['status'] {
  if (b === null) return 'UNKNOWN';
  if (b.used_at !== null && atOrBefore(b.used_at, now)) return 'USED';
  if (atOrBefore(b.expires_at, now)) return 'EXPIRED';
  return 'VALID';
}
/** «Це ви?»: the driver a live code names, and nothing at all otherwise. The preview binds nothing. */
export function bindPreviewView(w: World, code: string, now: Instant): BindPreview {
  const b = codeAt(w, code, now);
  const status = bindStatus(b, now);
  const driver = b === null || status !== 'VALID' ? undefined : w.drivers.find((d) => d.id === b.driver_id);
  if (driver === undefined) {
    return { status: status === 'VALID' ? 'UNKNOWN' : status, driver_name: null, initials: null, truck_plate: null, truck_model: null };
  }
  const truck = w.trucks.find((t) => t.id === driver.truck_id) ?? null;
  return { status, driver_name: displayName(driver), initials: driver.initials, truck_plate: truck?.plate ?? null,
    truck_model: truck?.model ?? null };
}

/* ── who answers now (§3.3 D-02 RoadStopCard, §4.1 sidebar) ────────────── */

const ROLE_LABEL: Record<OfficeRole, string> = { DISPATCHER: 'диспетчер', ON_CALL: 'черговий', OPERATOR: 'оператор',
  ACCOUNTANT: 'бухгалтер', MECHANIC: 'механік' };
/** The rota slot answering drivers at `now`: the overnight slot (its `from` after its `to`, 20:00–06:00) from its start
 *  until midnight — «after 20:00 Дмитро Савчук · до 06:00» (§3.3 D-02, §4.1) — and the day slot every other minute, so
 *  the dispatcher of the day is the one named from the first departures of the morning. Wall times compare by code point:
 *  both are zero-padded «HH:MM».
 *
 *  `role_label` is the FINISHED words a call button says after the name: «диспетчер» by day, «черговий до 06:00» at
 *  night (§3.3 D-02 mode D, 04 X11). The hour rides on the label rather than on a slot of its own because the button
 *  renders «Подзвонити — <name>, <role_label>» and has no third slot (I-15), and because this is the only place that
 *  holds the role CODE: `OnCallView` carries `until` but not the role, so a component could only tell the two apart by
 *  matching the word «черговий», which is a string, not a discriminator. The day slot gets no «до 20:00»: the spec
 *  names one form for the dispatcher and another for the night man, and they are not symmetrical. */
export function onCallAt(w: World, now: Instant): OnCallView {
  const hm = fmtTime(now);
  const overnight = w.rota.find((r) => byCodepoint(r.to, r.from) === -1 && byCodepoint(hm, r.from) !== -1);
  const day = w.rota.find((r) => byCodepoint(r.from, r.to) === -1);
  const slot = overnight ?? day ?? w.rota[0] ?? null;
  const user = slot === null ? null : w.officeUsers.find((u) => u.id === slot.user_id) ?? null;
  if (slot === null || user === null) return { name: '', role_label: '', until: '', phone: '' };
  const role = user.role === 'ON_CALL' ? `${ROLE_LABEL[user.role]} до ${slot.to}` : ROLE_LABEL[user.role];
  return { name: user.full_name, role_label: role, until: slot.to, phone: user.phone ?? '' };
}

/* ── the plan ─────────────────────────────────────────────────────────── */

/** The driver's trips on a business date, by trip number. */
export function tripsOf(w: World, driverId: string, date: BusinessDate): Trip[] {
  return w.trips.filter((t) => t.driver_id === driverId && t.date === date).sort((a, b) => byCodepoint(a.no, b.no));
}
/** Every stop of those trips, planned and unplanned, in the order the day runs: trip by trip, stop by stop. An
 *  unplanned stop is numbered after its trip's plan, so it follows it. */
function dayStops(w: World, trips: readonly Trip[]): PlannedStop[] {
  return trips.flatMap((t) => w.plannedStops.filter((s) => s.trip_id === t.id)
    .sort((a, b) => cmpNum(a.seq, b.seq) || byCodepoint(a.id, b.id)));
}
const COMPLETIONS: readonly DriverRecord['type'][] = ['LOADED', 'UNLOADED', 'STOP_LEFT'];
const doneStops = (recs: readonly DriverRecord[]): Set<string> =>
  new Set(recs.flatMap((r) => (r.stop_id !== null && COMPLETIONS.includes(r.type) ? [r.stop_id] : [])));
/** The trip being driven: the first with a planned stop still to complete, else the last. */
export function currentTrip(w: World, trips: readonly Trip[], recs: readonly DriverRecord[]): Trip | null {
  const done = doneStops(recs);
  return trips.find((t) => w.plannedStops.some((s) => s.trip_id === t.id && s.kind !== 'UNPLANNED' && !done.has(s.id)))
    ?? trips.at(-1) ?? null;
}

function stopView(w: World, s: PlannedStop, seq: number, plannedKmTo: Km | null, now: Instant): PlannedStopView {
  const p = placeOf(w, s.place_id);
  return { stop_id: s.id, plan_key: s.plan_key, seq, kind: s.kind, place_id: s.place_id, label: p?.label ?? NEW_PLACE,
    short: p?.short ?? NEW_PLACE, town: p?.town ?? '', ttn_expected: s.ttn_expected, ttn_nos: [...s.ttn_nos],
    drop_index: s.drop_index, drop_count: s.drop_count, compartments: s.compartments, mass_t: s.mass_t,
    planned_km: plannedKmTo, no_photos: p?.no_photos ?? false, weigh_ticket: p?.weigh_ticket ?? false,
    accepted_at: s.accepted_at !== null && atOrBefore(s.accepted_at, now) ? s.accepted_at : null };
}

/** The TodayCard and TripRail inputs (§3.3 D-02): every stop of the day's trips (`seq` is the stop's place in the day,
 *  1…n, so a second trip follows the first), the planned km from the previous planned place (the first from the base),
 *  and the caption, mass and source line of the trip being driven. */
function planView(w: World, trips: readonly Trip[], recs: readonly DriverRecord[], now: Instant): DriverToday['plan'] {
  const trip = currentTrip(w, trips, recs);
  if (trip === null) return null;
  const stops = dayStops(w, trips);
  let prev = baseId(w);
  const views = stops.map((s, i) => {
    const planned = s.kind !== 'UNPLANNED' && placeOf(w, s.place_id) !== null;
    const km = planned && prev !== null ? plannedKm(w, prev, s.place_id) : null;
    if (planned) prev = s.place_id;
    return stopView(w, s, i + 1, km, now);
  });
  const mine = stops.filter((s) => s.trip_id === trip.id);
  const towns = mine.filter((s) => s.kind === 'LOADING' || s.kind === 'DROP').map((s) => placeOf(w, s.place_id)?.town ?? '')
    .filter((t) => t !== '');
  const caption = towns.filter((t, i) => t !== towns[i - 1]).join(' → ');
  const masses = mine.flatMap((s) => (s.kind === 'LOADING' && s.mass_t !== null ? [s.mass_t] : []));
  const mass_label = masses.length === 0 ? '' : `${fmtMass(round(sum(masses, 3), 1))} т`;
  const imported_label = `${trip.source === 'BAS_FILE' ? 'план з BAS' : 'план від диспетчера'} ${fmtDateTime(trip.imported_at)}`;
  return { trip_no: trip.no, caption, mass_label, imported_label, stops: views };
}

/* ── the shift ────────────────────────────────────────────────────────── */

/** The shift the phone is on at `now`: its open one, else the last one that started or ended today. */
export function shiftOfDevice(w: World, deviceId: string, now: Instant): Shift | null {
  const mine = w.shifts.filter((s) => s.device_id === deviceId && atOrBefore(s.started_at, now)).sort(byStart);
  const open = mine.filter((s) => s.ended_at === null).at(-1);
  if (open !== undefined) return open;
  const today = businessDate(now);
  return mine.filter((s) => businessDate(s.started_at) === today || (s.ended_at !== null && businessDate(s.ended_at) === today))
    .at(-1) ?? null;
}
/** The shift a record at `at` belongs to: the one running at that moment (a record after midnight keeps its shift and
 *  so its day, EC-147), else the phone's open one, else the last one that started that day. */
export function shiftForRecord(w: World, deviceId: string, at: Instant): Shift | null {
  const mine = w.shifts.filter((s) => s.device_id === deviceId).sort(byStart);
  return mine.filter((s) => atOrBefore(s.started_at, at) && (s.ended_at === null || atOrBefore(at, s.ended_at))).at(-1)
    ?? mine.filter((s) => s.ended_at === null).at(-1)
    ?? mine.filter((s) => businessDate(s.started_at) === businessDate(at)).at(-1) ?? null;
}
/** The truck the phone is on: the shift's, else the day's plan, else the driver's own. */
export function todayTruckId(w: World, deviceId: string, now: Instant): string | null {
  const device = w.devices.find((d) => d.id === deviceId);
  const driver = device?.driver_id == null ? undefined : w.drivers.find((d) => d.id === device.driver_id);
  if (driver === undefined) return null;
  const shift = shiftOfDevice(w, deviceId, now);
  return shift?.truck_id ?? tripsOf(w, driver.id, businessDate(now))[0]?.truck_id ?? driver.truck_id;
}

/** A record's odometer reading as the office now holds it: the newest correction over the driver's value. */
function readingOf(w: World, r: DriverRecord | null, now: Instant): Km | null {
  if (r === null) return null;
  const fixed = w.corrections.filter((c) => c.record_key === r.key && c.field === 'odometer' && /^\d{1,9}$/.test(c.new)
    && atOrBefore(c.at, now)).sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id)).at(-1);
  if (fixed !== undefined) return toInt(fixed.new);
  return odometerOf(r)?.value ?? null;
}
function odometerOf(r: DriverRecord): Odometer | null {
  switch (r.type) {
    case 'SHIFT_START': case 'SHIFT_END': case 'ARRIVED': case 'REFUEL': case 'DOCS_ADDED': return r.payload.odometer;
    default: return null;
  }
}
function shiftView(w: World, shift: Shift, recs: readonly DriverRecord[], now: Instant): ShiftView {
  const start = recs.find((r) => r.key === shift.start_key) ?? recs.find((r) => r.type === 'SHIFT_START' && r.shift_id === shift.id) ?? null;
  const end = recs.filter((r) => r.type === 'SHIFT_END' && r.shift_id === shift.id).at(-1) ?? null;
  return { id: shift.id, started_at: shift.started_at, ended_at: shift.ended_at, attested_at: shift.attested_at,
    truck_plate: w.trucks.find((t) => t.id === shift.truck_id)?.plate ?? '',
    trailer_plate: w.trailers.find((t) => t.id === shift.trailer_id)?.plate ?? '',
    start_odometer: readingOf(w, start, now), end_odometer: readingOf(w, end, now) };
}
function daySummary(w: World, shift: Shift, now: Instant): DaySummaryView {
  const docs = docCounts(w, shift.truck_day_id, now);
  return { started_at: shift.started_at, ended_at: shift.ended_at, on_shift_min: shiftMinutes(shift, now),
    on_site_min: onSiteMinutes(stopsOfDay(w, shift.truck_day_id, now)), alert_min: roadStopMinutes(w, shift.id, now).ALERT,
    km: dayTotals(legsOfDay(w, shift.truck_day_id, now)).km, docs_in_office: docs.in_office, docs_total: docs.total,
    owed: docs.owed };
}

/* ── records, telemetry and the odometer reference ────────────────────── */

/** The page keys a record names are `${key}:p1` …, whoever the page was filed under later (a deferred receipt). */
const pagesOfKey = (w: World, key: string, now: Instant): Page[] =>
  w.pages.filter((p) => p.key.startsWith(`${key}:`) && p.received_at !== null && atOrBefore(p.received_at, now));
function recordView(w: World, r: DriverRecord, voided: ReadonlySet<string>, now: Instant): RecordView {
  const named = r.type === 'LOADED' || r.type === 'UNLOADED' || r.type === 'DOCS_ADDED' ? r.payload.pages.length : 0;
  const got = pagesOfKey(w, r.key, now).length;
  const stop = r.stop_id === null ? null : w.plannedStops.find((s) => s.id === r.stop_id) ?? null;
  const accepted = stop?.accepted_at ?? null;
  return { key: r.key, seq: r.seq, type: r.type, occurred_at: r.occurred_at, committed_at: r.committed_at,
    received_at: r.received_at, stop_id: r.stop_id, place_id: r.place_id, payload: r.payload,
    photos_expected: Math.max(named, got), photos_received: got,
    accepted_at: accepted !== null && atOrBefore(accepted, now) ? accepted : null,
    voided: r.voided_by !== null || voided.has(r.key), late: r.late };
}

/** Ruptela's events of the day (R+C), each IN matched to the k-th stop of the day at its place and each OUT to the stop
 *  of the IN before it; every one is simulated. Litres travel only with what went into or out of the tank (a ДУТ refuel
 *  or drain): the card-out's litres are the day's CAN fuel the office sets against the norm (§4.2 C-08), not his. */
const TANK_EVENTS: readonly string[] = ['REFUEL', 'DRAIN'];
function autoEvents(w: World, truckId: string, date: BusinessDate, stops: readonly PlannedStopView[], now: Instant): AutoEventView[] {
  const ins = new Map<string, number>();
  const lastIn = new Map<string, string | null>();
  return visibleTelemetry(w, truckId, now).filter((t) => businessDate(t.at) === date).map((t) => {
    let stop_id: string | null = null;
    if (t.place_id !== null && t.kind === 'IN') {
      const k = ins.get(t.place_id) ?? 0;
      ins.set(t.place_id, k + 1);
      stop_id = stops.filter((s) => s.place_id === t.place_id)[k]?.stop_id ?? null;
      lastIn.set(t.place_id, stop_id);
    } else if (t.place_id !== null && t.kind === 'OUT') {
      stop_id = lastIn.get(t.place_id) ?? null;
    }
    return { id: t.id, kind: t.kind, at: t.at, place_id: t.place_id, place_short: placeOf(w, t.place_id)?.short ?? null,
      stop_id, can_km: t.can_km, litres: TANK_EVENTS.includes(t.kind) ? t.litres : null, minutes: t.minutes, simulated: true };
  });
}

const NO_REFERENCE: OdometerRefView = { value: null, at: null, source: null, basis: 'NONE', place_short: null, kind: 'NONE' };
const BASIS: Record<Exclude<OdometerRefView['kind'], 'NONE'>, OdometerRefView['basis']> = {
  SHIFT_END_AT_BASE: 'LAST_AT_BASE', MECHANIC: 'MECHANIC', CAN: 'CAN_DELTA', POINT: 'PLANNED_KM' };
/** The last trusted reading of the truck at `now` (a flagged, unresolved one is skipped, §7.3) and what it is: a shift
 *  end at the base, the mechanic's reading, a CAN reading, or any other point. */
function odometerRef(w: World, truckId: string, now: Instant): OdometerRefView {
  const points = odometerPoints(w, truckId, now);
  const last = lastTrustedOf(points, addSeconds(now, 1));
  if (last === null) return NO_REFERENCE;
  const point = points.filter((p) => !p.flagged && p.value === last.value && p.at === last.at).at(-1) ?? null;
  const kind: Exclude<OdometerRefView['kind'], 'NONE'> = last.kind === 'MECHANIC' || last.kind === 'SHIFT_END_AT_BASE'
    ? last.kind : point?.source === 'CAN' ? 'CAN' : 'POINT';
  return { value: last.value, at: last.at, source: point?.source ?? null, basis: BASIS[kind],
    place_short: placeOf(w, point?.place_id ?? null)?.short ?? null, kind };
}
/** The newest CAN kilometre count the truck reported by `now` (R+C only). */
function canKm(w: World, truck: Truck, now: Instant): Km | null {
  if (!truck.has_can) return null;
  const readings = [
    ...visibleTelemetry(w, truck.id, now).flatMap((t) => (t.can_km === null ? [] : [{ at: t.at, km: t.can_km }])),
    ...odometerPoints(w, truck.id, now).flatMap((p) => (p.source === 'CAN' && p.value !== null ? [{ at: p.at, km: p.value }] : [])),
  ].sort((a, b) => cmpInstant(a.at, b.at));
  return readings.at(-1)?.km ?? null;
}

/* ── requests, corrections, paper ─────────────────────────────────────── */

const RETAKE_WORDS: Record<RetakeReason, string> = { BLUR: 'Розмито', CROPPED: 'Обрізано', GLARE: 'Відблиск',
  WRONG_SIDE: 'Не той бік', NO_ARRIVAL_TIME: 'Не видно часу прибуття' };
const TTN_KINDS: readonly ArtefactKind[] = ['TTN_FRONT', 'TTN_BACK', 'TTN_SIGNED'];
const SIDE: Partial<Record<ArtefactKind, string>> = { TTN_FRONT: 'лицьовий бік', TTN_BACK: 'зворотний бік', TTN_SIGNED: 'з підписом' };
const OTHER_PAGE: Partial<Record<ArtefactKind, string>> = { RECEIPT: 'Чек', CLUSTER: 'Фото щитка', WEIGH_TICKET: 'Талон з ваг', ACT: 'Акт' };
/** How many ТТН the page's record carries: the loading's count, else the stop's plan, else the documents photographed. */
function ttnCountOf(w: World, page: Page): number {
  const r = w.records.find((x) => x.key === page.record_key) ?? null;
  const stop = r?.stop_id == null ? null : w.plannedStops.find((s) => s.id === r.stop_id) ?? null;
  const counted = r?.type === 'LOADED' ? r.payload.ttn_count : stop?.ttn_nos.length ?? 0;
  const photographed = new Set(w.pages.filter((p) => p.record_key === page.record_key && TTN_KINDS.includes(p.artefact))
    .map((p) => p.doc_index)).size;
  return Math.max(counted, photographed, page.doc_index);
}
/** «ТТН 2 з 2, зворотний бік», «ТТН 1 з 1, з підписом», «Чек». */
export function pageTarget(w: World, page: Page): string {
  const side = SIDE[page.artefact];
  if (side !== undefined) return `ТТН ${page.doc_index} з ${ttnCountOf(w, page)}, ${side}`;
  return OTHER_PAGE[page.artefact] ?? 'Фото';
}
const isOpen = (q: Request, now: Instant): boolean => atOrBefore(q.created_at, now)
  && (q.done_at === null || isBefore(now, q.done_at)) && (q.cancelled_at === null || isBefore(now, q.cancelled_at));
function requestCard(w: World, q: Request): RequestCardView {
  const page = q.page_key === null ? null : w.pages.find((p) => p.key === q.page_key) ?? null;
  const record = w.records.find((r) => r.key === q.record_key) ?? null;
  const target = page !== null ? pageTarget(w, page) : q.type === 'CALL_ME' ? 'Подзвонити диспетчеру' : 'Фото';
  return { id: q.id, type: q.type, record_key: q.record_key, page_key: q.page_key, stop_id: q.stop_id ?? record?.stop_id ?? null,
    artefact: page?.artefact ?? null, doc_index: page?.doc_index ?? null, page_no: page?.page_no ?? null,
    target_label: target, reasons: [...q.reasons], reason_line: q.reasons.map((r) => RETAKE_WORDS[r]).join(' · '),
    by_short: userShort(w, q.created_by), created_at: q.created_at, seen_at: q.seen_at, done_at: q.done_at,
    thumb_variant: page?.drawn?.variant ?? null };
}
function correctionCard(w: World, c: Correction): CorrectionView {
  return { id: c.id, record_key: c.record_key, field: c.field, old: c.old, new: c.new, reason: c.reason,
    driver_wording: DC.correctionWording[c.reason], by: userShort(w, c.by), at: c.at, needs_ack: c.needs_ack,
    ack: c.ack === null ? null : { ...c.ack } };
}

/* ── DriverToday (§7.4 operation 3) ────────────────────────────────────── */

/** Everything the phone's home needs, as raw facts at `now`. The motion toggles arrive as `sensors`: `speed_kmh` is the
 *  stage's «Швидкість» for this truck, `gps_lost` turns the position SUSPECT. */
export function todayView(w: World, deviceId: string, now: Instant, sensors: { speed_kmh: number | null; gps_lost: boolean }): DriverToday {
  const device = w.devices.find((d) => d.id === deviceId) ?? null;
  const driver = device?.driver_id == null ? null : w.drivers.find((d) => d.id === device.driver_id) ?? null;
  const revoked = device?.revoked_at != null && atOrBefore(device.revoked_at, now);
  const on_call = onCallAt(w, now);
  if (device === null || driver === null) {
    return { server_time: now, device: { id: deviceId, bound: false, revoked }, driver: null, truck: null, trailer: null,
      plan: null, shift: null, records: [], auto_events: [], odometer_ref: NO_REFERENCE, requests: [], requests_done_today: [],
      corrections_to_ack: [], paper: { owed: [], receipts: [] }, on_call, last_contact_at: device?.last_contact_at ?? null,
      first_time: { examples_seen: [...(device?.seen_examples ?? [])], office_sees_read: device?.office_sees_read ?? false,
        first_arrival: true }, day: null };
  }

  const today = businessDate(now);
  const shift = shiftOfDevice(w, deviceId, now);
  const planDate = shift !== null && shift.ended_at === null ? businessDate(shift.started_at) : today;
  const trips = tripsOf(w, driver.id, planDate);
  const truckId = todayTruckId(w, deviceId, now);
  const truck = w.trucks.find((t) => t.id === truckId) ?? null;
  const trailerId = shift?.trailer_id ?? trips[0]?.trailer_id ?? truck?.trailer_id ?? null;
  const trailer = w.trailers.find((t) => t.id === trailerId) ?? null;
  const live = known(w, now);
  const plan = planView(w, trips, live.filter((r) => r.driver_id === driver.id), now);

  const voided = new Set(w.records.flatMap((r) => (r.type === 'VOID' && atOrBefore(r.received_at, now) ? [r.payload.target_key] : [])));
  const records = w.records.filter((r) => r.device_id === deviceId && atOrBefore(r.received_at, now)
    && ((shift !== null && r.shift_id === shift.id) || businessDate(r.occurred_at) === today))
    .sort(byOccurred).map((r) => recordView(w, r, voided, now));

  const requests = w.requests.filter((q) => q.device_id === deviceId && isOpen(q, now))
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).map((q) => requestCard(w, q));
  const requests_done_today = w.requests.flatMap((q) => (q.device_id === deviceId && q.done_at !== null
    && atOrBefore(q.done_at, now) && businessDate(q.done_at) === today ? [{ id: q.id, done_at: q.done_at }] : []))
    .sort((a, b) => cmpInstant(a.done_at, b.done_at) || byCodepoint(a.id, b.id));
  const ownKeys = new Set(w.records.filter((r) => r.device_id === deviceId).map((r) => r.key));
  const corrections_to_ack = w.corrections.filter((c) => ownKeys.has(c.record_key) && c.needs_ack && c.ack === null
    && atOrBefore(c.at, now)).sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id)).map((c) => correctionCard(w, c));

  const docs = w.ttnDocs.filter((d) => d.driver_id === driver.id && !d.example && d.ettn === null);
  const inOffice = (d: (typeof docs)[number]): boolean => d.original !== null && atOrBefore(d.original.received_at, now);
  const owed = docs.filter((d) => !inOffice(d)).sort((a, b) => byCodepoint(a.date, b.date) || byCodepoint(a.no, b.no))
    .map((d) => d.no).filter((no, i, all) => all.indexOf(no) === i);
  const receipts = docs.flatMap((d): PaperReceipt[] => (d.original !== null && inOffice(d)
    ? [{ label: d.label, received_at: d.original.received_at, by_short: userShort(w, d.original.received_by), date: d.date }] : []))
    .sort((a, b) => cmpInstant(b.received_at, a.received_at) || byCodepoint(a.label, b.label));

  return {
    server_time: now,
    device: { id: deviceId, bound: device.bound_at !== null, revoked },
    driver: { id: driver.id, name: displayName(driver), short_name: driver.short_name },
    truck: truck === null ? null : { id: truck.id, plate: truck.plate, model: truck.model, telematics: truck.telematics,
      has_can: truck.has_can, speed_kmh: sensors.speed_kmh, gnss: sensors.gps_lost ? 'SUSPECT' : 'OK', can_km: canKm(w, truck, now) },
    trailer: trailer === null ? null : { id: trailer.id, plate: trailer.plate, body_label: trailer.body_label,
      compartments: trailer.compartments },
    plan,
    shift: shift === null ? null : shiftView(w, shift, live, now),
    records,
    auto_events: truck === null ? [] : autoEvents(w, truck.id, planDate, plan?.stops ?? [], now),
    odometer_ref: truck === null ? NO_REFERENCE : odometerRef(w, truck.id, now),
    requests,
    requests_done_today,
    corrections_to_ack,
    paper: { owed, receipts },
    on_call,
    last_contact_at: device.last_contact_at,
    first_time: { examples_seen: [...device.seen_examples], office_sees_read: device.office_sees_read,
      first_arrival: !live.some((r) => r.driver_id === driver.id && r.type === 'ARRIVED') },
    day: shift === null ? null : daySummary(w, shift, now),
  };
}

/* ── «Я в іншому місці» (§3.3 D-12, operation 4) ─────────────────────── */

/** «За планом»: the day's loadings and drops not yet reached, except `stopId` (the one he is not at); «Поруч»: the
 *  library's places next to that stop (or to the next planned one), nearest first. */
export function nearbyPlaceOptions(w: World, deviceId: string, stopId: string | null, now: Instant): PlaceOption[] {
  const device = w.devices.find((d) => d.id === deviceId);
  if (device?.driver_id == null) return [];
  const shift = shiftOfDevice(w, deviceId, now);
  const date = shift !== null && shift.ended_at === null ? businessDate(shift.started_at) : businessDate(now);
  const reached = new Set(known(w, now).flatMap((r) => (r.stop_id !== null && (r.type === 'ARRIVED' || COMPLETIONS.includes(r.type))
    ? [r.stop_id] : [])));
  const remaining = dayStops(w, tripsOf(w, device.driver_id, date))
    .filter((s) => (s.kind === 'LOADING' || s.kind === 'DROP') && !reached.has(s.id) && placeOf(w, s.place_id) !== null);
  const planned = remaining.filter((s) => s.id !== stopId).flatMap((s): PlaceOption[] => {
    const p = placeOf(w, s.place_id);
    return p === null ? [] : [{ place_id: p.id, short: p.short, kind: p.kind, group: 'PLANNED', distance_km: null,
      ttn_no: s.ttn_nos.length === 0 ? null : s.ttn_nos.join(', '), stop_id: s.id }];
  });
  const named = stopId === null ? undefined : w.plannedStops.find((s) => s.id === stopId);
  const anchorStop = named ?? remaining[0] ?? null;
  const anchor = placeOf(w, anchorStop?.place_id ?? null);
  if (anchor === null) return planned;
  const taken = new Set(planned.map((o) => o.place_id));
  const nearby = w.places.flatMap((p): PlaceOption[] => {
    if (p.id === anchor.id || taken.has(p.id)) return [];
    const km = p.near_code === anchor.code ? p.near_km : anchor.near_code === p.code ? anchor.near_km : undefined;
    return km === undefined ? [] : [{ place_id: p.id, short: p.short, kind: p.kind, group: 'NEARBY', distance_km: km,
      ttn_no: null, stop_id: null }];
  }).sort((a, b) => cmpNum(a.distance_km ?? 0, b.distance_km ?? 0) || byCodepoint(a.short, b.short));
  return [...planned, ...nearby];
}

/* ── a record lands (§7.3: never refused for content) ─────────────────── */

/** A shift start whose driver says the truck or trailer is not the planned one: the plate that differs, and the truck
 *  when neither does (he said so; the office sees which). */
function planMismatch(w: World, r: RecordOf<'SHIFT_START'>): FlagCode[] {
  if (r.payload.plan_match) return [];
  const trip = tripsOf(w, r.driver_id, businessDate(r.occurred_at))[0] ?? null;
  const flags: FlagCode[] = [];
  if (trip !== null && trip.truck_id !== r.payload.truck_id) flags.push('PLAN_MISMATCH_TRUCK');
  if (trip !== null && trip.trailer_id !== r.payload.trailer_id) flags.push('PLAN_MISMATCH_TRAILER');
  return flags.length === 0 ? ['PLAN_MISMATCH_TRUCK'] : flags;
}
/** The odometer checks of §7.3 against the last trusted reading before the record, with the planned km from that
 *  reading's place to this record's place (a shift start with no place of its own starts at the base; a shift start
 *  itself has no planned leg). An «Об'їзд» between the two suppresses OFF_PLAN. */
function odometerChecks(w: World, r: DriverRecord, odo: Odometer, now: Instant): FlagCode[] {
  const points = odometerPoints(w, r.truck_id, now);
  const last = lastTrustedOf(points, r.occurred_at);
  const point: OdometerPoint | null = last === null ? null
    : points.filter((p) => !p.flagged && p.value === last.value && p.at === last.at).at(-1) ?? null;
  const from = point === null ? null : point.place_id ?? (point.kind === 'SHIFT_START' ? baseId(w) : null);
  const to = r.type === 'SHIFT_START' ? null : placeOfRecord(r);
  const planned = from === null || to === null || to === '' ? null : plannedKm(w, from, to);
  const detour = last !== null && w.records.some((x) => x.type === 'ROAD_STOP' && x.payload.reason === 'DETOUR'
    && x.truck_id === r.truck_id && x.voided_by === null && isBefore(last.at, x.occurred_at) && atOrBefore(x.occurred_at, r.occurred_at));
  const truck = w.trucks.find((t) => t.id === r.truck_id);
  return odometerFlags({ value: odo.value, last: last?.value ?? null, plannedKm: planned,
    typed: odo.source === 'DRIVER_TYPED' && truck?.telematics !== 'RUPTELA', photoTaken: odo.page_key !== null || odo.read !== null,
    unread: odo.source === 'UNREAD' || odo.choice === 'UNREAD', detour });
}
/** Every flag a record lands with (§7.3), in FLAG_CODES order: its odometer checks, a plan mismatch at a shift start, a
 *  loading the shipper sent off without a ТТН, and a record for a day already confirmed (EC-142). `w` is the world the
 *  record lands in; the record itself is not in it yet. */
export function recordFlags(w: World, r: DriverRecord, now: Instant): FlagCode[] {
  const flags = new Set<FlagCode>();
  const odo = odometerOf(r);
  if (odo !== null) for (const f of odometerChecks(w, r, odo, now)) flags.add(f);
  if (r.type === 'SHIFT_START') for (const f of planMismatch(w, r)) flags.add(f);
  if (r.type === 'LOADED' && r.payload.no_doc_reason === 'SHIPPER_REFUSED') flags.add('NO_TTN_AT_DEPARTURE');
  if (r.truck_day_id !== null && truckDayStatus(w, r.truck_day_id) === 'CONFIRMED') flags.add('LATE_RECORD_ON_CONFIRMED_DAY');
  return FLAG_CODES.filter((f) => flags.has(f));
}
/** The stop a record names: a planned stop by id, or — for a place the plan did not have — the stop its arrival was
 *  filed under, named by that arrival's key (D-12). */
export function stopNamed(w: World, id: string | null | undefined): PlannedStop | null {
  if (id == null || id === '') return null;
  const stop = w.plannedStops.find((s) => s.id === id);
  if (stop !== undefined) return stop;
  const arrival = w.records.find((r) => r.key === id && r.type === 'ARRIVED');
  return arrival?.stop_id == null ? null : w.plannedStops.find((s) => s.id === arrival.stop_id) ?? null;
}
/** The refuel a later-photos record completes (D7): the phone's newest refuel whose photos were put off and that has no
 *  receipt yet — or whose receipt this very record brought, so every page of it lands on the same refuel. */
export function refuelCompletedBy(w: World, docs: RecordOf<'DOCS_ADDED'>): RecordOf<'REFUEL'> | null {
  const own = `${docs.key}:`;
  return liveRecords(w).filter((r): r is RecordOf<'REFUEL'> => r.type === 'REFUEL' && r.device_id === docs.device_id
    && r.payload.deferred && atOrBefore(r.occurred_at, docs.occurred_at)
    && w.pages.filter((p) => p.record_key === r.key && p.artefact === 'RECEIPT').every((p) => p.key.startsWith(own)))
    .at(-1) ?? null;
}

/* ── the console toast (§5.9 #4) ──────────────────────────────────────── */

const SOURCE_LABEL: Record<OdometerSource, string | null> = { CAN: OC.source.CAN, DASH_PHOTO: OC.source.PHOTO,
  PLAN_CONFIRMED: OC.source.PLAN_OK, DRIVER_TYPED: OC.source.TYPED, UNREAD: null, OFFICE_EDIT: OC.source.OFFICE,
  OFFICE_CALC: OC.source.ESTIMATE, OFFICE_FROM_CALL: OC.source.FROM_CALL };
const NO_DOCUMENT = 'Немає документа';
/** «412 355 ФОТО». */
function readingLine(o: Odometer | null): string | null {
  if (o === null || o.value === null) return null;
  const label = SOURCE_LABEL[o.source];
  return label === null ? fmtKm(o.value) : `${fmtKm(o.value)} ${label}`;
}
const dot = (parts: readonly (string | null)[]): string => parts.filter((p): p is string => p !== null && p !== '').join(' · ');
const put = (deferred: 'AT_PARKING' | 'AFTER_EXIT'): string => (deferred === 'AT_PARKING' ? DC.status.atParking : DC.status.afterExit);

/** The toast a driver's write raises on the console (§5.9 #4): the driver's name and what happened, then the one line
 *  the office wants next to it. Litres from a receipt are the sum at the example diesel price. `null` for every record
 *  the office does not need to see arrive. */
export function driverToast(w: World, record: DriverRecord): { title: string; line: string } | null {
  const driver = w.drivers.find((d) => d.id === record.driver_id);
  const title = (what: string): string => (driver === undefined ? what : `${displayName(driver)} · ${what}`);
  const plate = w.trucks.find((t) => t.id === record.truck_id)?.plate ?? '';
  const stop = stopNamed(w, record.stop_id);
  const place = placeOf(w, stop?.place_id ?? record.place_id);
  const label = place?.label ?? NEW_PLACE;
  const at = fmtTime(record.occurred_at);
  switch (record.type) {
    case 'SHIFT_START':
      return { title: title(`Зміну почато ${at}`), line: dot([plate, readingLine(record.payload.odometer)]) };
    case 'ARRIVED': {
      const chip = record.payload.chip === null ? null : DC.segments[record.payload.chip];
      return { title: title(dot([`На місці: ${label}`, chip])), line: readingLine(record.payload.odometer) ?? plate };
    }
    case 'LOADED': {
      const p = record.payload;
      const pages = p.pages.length;
      const what = p.ttn_count === 0 ? 'Завантажено' : pages === 0 ? `Завантажено · ${p.ttn_count} ТТН`
        : `Завантажено · ${p.ttn_count} ТТН, ${pages} стор.`;
      const inOffice = pages !== 0 && p.pages.every((k) => w.pages.some((x) => x.key === k && x.received_at !== null));
      const line = p.deferred !== null ? put(p.deferred) : p.no_doc_reason !== null || pages === 0 ? NO_DOCUMENT
        : inOffice ? 'фото в офісі' : 'фото ще в дорозі';
      return { title: title(what), line };
    }
    case 'PHOTO_REPLACE': {
      const old = w.pages.find((x) => x.key === record.payload.supersedes) ?? null;
      const request = (record.payload.request_id === null ? undefined : w.requests.find((q) => q.id === record.payload.request_id))
        ?? w.requests.find((q) => q.page_key === record.payload.supersedes && q.device_id === record.device_id);
      return { title: title(dot(['Фото перезнято', old === null ? null : pageTarget(w, old)])),
        line: request?.done_at == null ? at : `запит виконано ${fmtTime(request.done_at)}` };
    }
    case 'REFUEL': {
      const p = record.payload;
      const litres = p.sum_uah === null ? null : div(mul(p.sum_uah, '100'), DIESEL_PRICE_KOP);
      const receipt = litres === null ? [] : [`${fmtDec(litres)} л`, 'OCR чека', DC.simChip];
      return { title: title(dot([DC.tiles.refuel, p.station])), line: dot([...receipt, readingLine(p.odometer)]) || plate };
    }
    case 'UNLOADED': {
      const p = record.payload;
      const index = p.drop_index ?? stop?.drop_index ?? null;
      const count = stop?.drop_count ?? null;
      const nos = stop?.ttn_nos ?? [];
      const signed = nos.length === 0 ? 'ТТН підписана' : `ТТН ${nos.join(', ')} ${nos.length === 1 ? 'підписана' : 'підписані'}`;
      const line = p.deferred !== null ? put(p.deferred) : p.no_doc_reason !== null || p.pages.length === 0 ? NO_DOCUMENT : signed;
      return { title: title(dot([index !== null && count !== null ? `Вивантажено ${index} з ${count}` : 'Вивантажено', label])), line };
    }
    case 'ROAD_STOP':
      return { title: title(`Стоїть · ${DC.roadStopShort[record.payload.reason]}`), line: `з ${at}` };
    case 'SHIFT_END':
      return { title: title(`Зміну закінчено ${at}`), line: readingLine(record.payload.odometer) ?? plate };
    case 'DRIVER_ATTESTED': {
      const shiftId = record.payload.shift_id ?? record.shift_id;
      const ended = w.shifts.find((x) => x.id === shiftId)?.ended_at ?? record.occurred_at;
      return { title: title(`Зміну закінчено ${fmtTime(ended)}`), line: `водій підтвердив ${at}` };
    }
    default:
      return null;
  }
}
