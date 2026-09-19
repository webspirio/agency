// mocks/driver-report/src/domain/views/myday.ts
/** «Мій день» and «Мій місяць» (§3.3 D-15, D-16; §7.4 operations 8–9): the driver's own record of one day, and his
 *  month as facts. Pure functions over a `World` snapshot; `src/api/handlers/myday.ts` only returns what these build.
 *  Everything is time-gated to `now`, like every view: a record once received, a page once received, a line the office
 *  wrote once it wrote it.
 *
 *  His facts come first and are final at the commit: a stop's on-site span is read from his own arrival and completion,
 *  so nothing the office does later moves it (§8.2 D-15/16 #2). What the office read off the ТТН, its acceptance and the
 *  originals it took are lines added under his. The month is facts, never a score: no ranking, no money, no fuel and no
 *  comparison with anyone (§8.6 #12).
 *
 *  The words test scans this file, comments included (§0.3). */
import { byCodepoint } from '@agency/mock';
import { fmtDay, fmtDayMonth, fmtDur, fmtKm, fmtTime, plural } from '../../app/format';
import { DC } from '../../copy/driver';
import { atOrBefore, businessDate, cmpInstant, isBefore, minutesBetween } from '../clock';
import { dayTotals, docCounts, legsOfDay, liveRecords, stopsOfDay, visibleTelemetry } from '../derive';
import type { CorrectionView, MyDay, MyDayRow, MyMonth, MyMonthDay, MyPageView } from '../dto';
import { cmpNum, intDiv, lt } from '../num';
import type { ArtefactKind, BusinessDate, Deferred, Driver, DriverRecord, Instant, Km, NoDocReason, Odometer, Page,
  PlannedStop, RecordOf, Shift, TtnDoc, World } from '../types';
import { onSiteMinutes, roadStopMinutes, shiftMinutes } from '../worktime';

/* ── shared ───────────────────────────────────────────────────────────── */

const NEW_PLACE = 'Нове місце';
const NO_DOCUMENT = 'Немає документа';
const SHIFT_FORMS: readonly [string, string, string] = ['зміна', 'зміни', 'змін'];
const MONTH_NAMES: Readonly<Record<string, string>> = { '01': 'Січень', '02': 'Лютий', '03': 'Березень',
  '04': 'Квітень', '05': 'Травень', '06': 'Червень', '07': 'Липень', '08': 'Серпень', '09': 'Вересень',
  '10': 'Жовтень', '11': 'Листопад', '12': 'Грудень' };
type StopWord = 'LOADING' | 'DROP' | 'REFUEL' | 'OTHER';
const KIND_WORD: Readonly<Record<StopWord, string>> = { LOADING: 'завантаження', DROP: 'вивантаження',
  REFUEL: 'заправка', OTHER: 'зупинка' };
const TTN_KINDS: readonly ArtefactKind[] = ['TTN_FRONT', 'TTN_BACK', 'TTN_SIGNED'];
/** What a row-less record is called in a late note. */
const RECORD_WORD: Readonly<Record<DriverRecord['type'], string>> = { SHIFT_START: 'Зміну почато',
  SHIFT_END: 'Зміну закінчено', DRIVER_ATTESTED: 'Зміну підтверджено', ARRIVED: 'Я на місці', SEGMENT: 'Відмітка на місці',
  LOADED: 'Завантажено', UNLOADED: 'Вивантажено', DOCS_ADDED: 'Фото додано', STOP_LEFT: 'Поїхав далі',
  REFUEL: DC.tiles.refuel, ROAD_STOP: DC.tiles.stand, ROAD_STOP_END: DC.primary.over, STOP_PROBLEM: 'Проблема на місці',
  CALL_ME: 'Подзвоніть мені', REQUEST_SEEN: 'Прохання офісу переглянуто', REQUEST_REPLY: 'Відповідь офісу',
  PHOTO_REPLACE: 'Фото перезнято', CORRECTION_ACK: 'Відповідь на виправлення', VOID: 'Скасовано' };

const known = (at: Instant | null | undefined, now: Instant): at is Instant => at != null && atOrBefore(at, now);
const latest = (xs: readonly Instant[]): Instant | null =>
  xs.reduce<Instant | null>((best, at) => (best === null || isBefore(best, at) ? at : best), null);
const earlier = (a: Instant, b: Instant | null): Instant => (b !== null && isBefore(b, a) ? b : a);
/** Whole minutes from → to, never negative. */
const span = (from: Instant, to: Instant): number => {
  const m = minutesBetween(from, to);
  return lt(m, 0) ? 0 : m;
};
const dot = (parts: readonly (string | null)[]): string => parts.filter((p): p is string => p !== null && p !== '').join(' · ');
const byOccurred = (a: DriverRecord, b: DriverRecord): number =>
  cmpInstant(a.occurred_at, b.occurred_at) || byCodepoint(a.key, b.key);

function driverOf(w: World, deviceId: string): Driver | null {
  const device = w.devices.find((d) => d.id === deviceId);
  return device?.driver_id == null ? null : w.drivers.find((d) => d.id === device.driver_id) ?? null;
}
const userShort = (w: World, id: string): string => w.officeUsers.find((u) => u.id === id)?.short_name ?? id;
/** What a stop is for: an unplanned stop takes the kind he gave it. */
function kindOf(s: PlannedStop): StopWord {
  if (s.kind === 'UNPLANNED') return s.unplanned_kind ?? 'OTHER';
  return s.kind === 'BASE' ? 'OTHER' : s.kind;
}
function odometerOf(r: DriverRecord): Odometer | null {
  switch (r.type) {
    case 'SHIFT_START': case 'SHIFT_END': case 'ARRIVED': case 'REFUEL': case 'DOCS_ADDED': return r.payload.odometer;
    default: return null;
  }
}
const pagesNamed = (r: DriverRecord): readonly string[] =>
  (r.type === 'LOADED' || r.type === 'UNLOADED' || r.type === 'DOCS_ADDED' ? r.payload.pages : []);
const received = (p: Page, now: Instant): boolean => known(p.received_at, now);

/* ── the day's frame: his shifts, his records, the truck-days ─────────── */

/** His shifts that started on `date` (Kyiv) by `now`, oldest first. An end the server did not know yet reads as open. */
function shiftsOn(w: World, driverId: string, date: BusinessDate, now: Instant): Shift[] {
  return w.shifts.filter((s) => s.driver_id === driverId && businessDate(s.started_at) === date && atOrBefore(s.started_at, now))
    .map((s) => (s.ended_at === null || atOrBefore(s.ended_at, now) ? s : { ...s, ended_at: null }))
    .sort((a, b) => cmpInstant(a.started_at, b.started_at) || byCodepoint(a.id, b.id));
}
type Frame = { shifts: Shift[]; dayIds: string[]; mine: DriverRecord[] };
function frameOf(w: World, driverId: string, date: BusinessDate, now: Instant): Frame {
  const shifts = shiftsOn(w, driverId, date, now);
  const shiftIds = new Set(shifts.map((s) => s.id));
  const dayIds = shifts.map((s) => s.truck_day_id).filter((id, i, all) => all.indexOf(id) === i);
  const mine = liveRecords(w).filter((r) => r.driver_id === driverId && atOrBefore(r.received_at, now)
    && (r.shift_id === null ? r.truck_day_id !== null && dayIds.includes(r.truck_day_id) : shiftIds.has(r.shift_id)))
    .sort(byOccurred);
  return { shifts, dayIds, mine };
}

/* ── stops ────────────────────────────────────────────────────────────── */

/** A stop as the day's row needs it, whether the derivations know its place or it is a «Нове місце». */
type StopIn = { stop: PlannedStop; town: string; arrived_at: Instant | null; end: Instant | null;
  on_site_min: number | null; accepted_at: Instant | null; deferred: Deferred | null; no_doc_reason: NoDocReason | null };
type Completion = RecordOf<'LOADED'> | RecordOf<'UNLOADED'> | RecordOf<'STOP_LEFT'>;
const isCompletion = (r: DriverRecord): r is Completion => r.type === 'LOADED' || r.type === 'UNLOADED' || r.type === 'STOP_LEFT';

/** Every loading, drop and other stop of his day that he reached (the base is not one): the derivations' own facts for
 *  the stops with a place, and the same facts read straight off his records for a place the library does not have. */
function stopsOf(w: World, driverId: string, f: Frame, now: Instant): StopIn[] {
  const mineKeys = new Set(f.mine.map((r) => r.key));
  const tripDriver = (s: PlannedStop): string | null => w.trips.find((t) => t.id === s.trip_id)?.driver_id ?? null;
  const out: StopIn[] = [];
  for (const dayId of f.dayIds) {
    for (const x of stopsOfDay(w, dayId, now)) {
      if (x.stop.kind === 'BASE' || (x.arrived_at === null && x.completed_at === null)) continue;
      const his = tripDriver(x.stop) === driverId || (x.arrival_key !== null && mineKeys.has(x.arrival_key))
        || (x.completion_key !== null && mineKeys.has(x.completion_key));
      if (!his || out.some((o) => o.stop.id === x.stop.id)) continue;
      out.push({ stop: x.stop, town: x.place.town, arrived_at: x.arrived_at, end: x.completed_at ?? x.departed_at,
        on_site_min: x.on_site_min, accepted_at: x.accepted_at, deferred: x.deferred, no_doc_reason: x.no_doc_reason });
    }
  }
  const covered = new Set(out.map((o) => o.stop.id));
  const loose = f.mine.flatMap((r) => (r.stop_id !== null && !covered.has(r.stop_id) ? [r.stop_id] : []))
    .filter((id, i, all) => all.indexOf(id) === i);
  for (const id of loose) {
    const stop = w.plannedStops.find((s) => s.id === id);
    if (stop === undefined || stop.kind === 'BASE') continue;
    const recs = f.mine.filter((r) => r.stop_id === id);
    const arrived_at = recs.find((r) => r.type === 'ARRIVED')?.occurred_at ?? null;
    const done = recs.find(isCompletion) ?? null;
    if (arrived_at === null && done === null) continue;
    const payload = done === null || done.type === 'STOP_LEFT' ? null : done.payload;
    out.push({ stop, town: w.places.find((p) => p.id === stop.place_id)?.town ?? NEW_PLACE, arrived_at,
      end: done?.occurred_at ?? null, on_site_min: arrived_at === null ? null : span(arrived_at, done?.occurred_at ?? now),
      accepted_at: known(stop.accepted_at, now) ? stop.accepted_at : null, deferred: payload?.deferred ?? null,
      no_doc_reason: payload?.no_doc_reason ?? null });
  }
  return out;
}

/** «на місці 06:10–08:40 · 2 год 30 хв»; «на місці з 13:45 · 20 хв» while he is still there. */
function onSiteLine(s: StopIn): string {
  if (s.arrived_at === null) return 'на місці —';
  const minutes = fmtDur(s.on_site_min ?? 0);
  return s.end === null ? `на місці з ${fmtTime(s.arrived_at)} · ${minutes}`
    : `на місці ${fmtTime(s.arrived_at)}–${fmtTime(s.end)} · ${minutes}`;
}
const HM = /^(\d{2}):?(\d{2})$/;
/** «за ТТН: прибуття 07:48», once the office typed the arrival mark off the reverse side (loading or unloading row). */
function ttnArrivalLine(w: World, stop: PlannedStop, now: Instant): string | null {
  const drop = kindOf(stop) === 'DROP';
  const docs = w.ttnDocs.filter((d) => (drop ? d.drop_stop_id : d.loading_stop_id) === stop.id)
    .sort((a, b) => cmpNum(a.doc_index, b.doc_index) || byCodepoint(a.no, b.no));
  for (const d of docs) {
    const field = d.fields[drop ? 'drop_arrival' : 'arrival'];
    const m = field === null || !atOrBefore(field.at, now) ? null : HM.exec(field.value.trim());
    if (m !== null) return `за ТТН: прибуття ${m[1] ?? ''}:${m[2] ?? ''}`;
  }
  return null;
}
/** «прочитано 412 866 · ви вибрали 412 566»: the number the photo gave, and the one he settled on instead. */
function readingLine(recs: readonly DriverRecord[]): string | null {
  for (const r of recs) {
    const o = odometerOf(r);
    if (o === null || o.value === null || o.read === null || o.read === o.value) continue;
    return `прочитано ${fmtKm(o.read)} · ${o.choice === 'TYPED' ? 'ви ввели' : 'ви вибрали'} ${fmtKm(o.value)}`;
  }
  return null;
}
/** The stop's documents: «ТТН 004517, 004518 · Прийнято диспетчером 10:09» once accepted (the row's accepted line),
 *  else «… · В офісі ✓ 08:42» once every page he took is in, «… · фото 1 з 4 ще в телефоні» before that, and the put-off
 *  or «Немає документа» answer when he took none. */
function docsLines(w: World, s: StopIn, recs: readonly DriverRecord[], now: Instant): { line: string | null; accepted: string | null } {
  const label = s.stop.ttn_nos.length === 0 ? 'Фото' : `ТТН ${s.stop.ttn_nos.join(', ')}`;
  if (s.accepted_at !== null) return { line: null, accepted: `${label} · ${DC.status.accepted} ${fmtTime(s.accepted_at)}` };
  const named = recs.flatMap(pagesNamed);
  if (named.length !== 0) {
    const got = named.flatMap((key) => {
      const p = w.pages.find((x) => x.key === key);
      return p !== undefined && known(p.received_at, now) ? [p.received_at] : [];
    });
    const left = named.length - got.length;
    const tail = left === 0 ? `${DC.status.inOffice} ${fmtTime(latest(got) ?? now)}` : DC.status.photosLeft(left, named.length);
    return { line: `${label} · ${tail}`, accepted: null };
  }
  if (s.deferred !== null) {
    return { line: `${label} · ${s.deferred === 'AT_PARKING' ? DC.status.atParking : DC.status.afterExit}`, accepted: null };
  }
  return { line: s.no_doc_reason === null ? null : `${label} · ${NO_DOCUMENT}`, accepted: null };
}
function stopRow(w: World, s: StopIn, mine: readonly DriverRecord[], now: Instant): MyDayRow {
  const recs = mine.filter((r) => r.stop_id === s.stop.id);
  const docs = docsLines(w, s, recs, now);
  const start = s.arrived_at ?? s.end ?? now;
  const lines = [onSiteLine(s), ttnArrivalLine(w, s.stop, now), readingLine(recs), docs.line]
    .filter((l): l is string => l !== null);
  return { kind: 'STOP', stop_id: s.stop.id, title: `${fmtTime(start)} ${s.town} · ${KIND_WORD[kindOf(s.stop)]}`,
    lines, accepted_line: docs.accepted, late_line: recs.some((r) => r.late) ? DC.status.late : null };
}

/* ── refuels and road stops ───────────────────────────────────────────── */

/** «08:57 Заправка · ОККО Н-08 · 412 398 км», and «Чек · В офісі ✓ 08:57» once the receipt is in. */
function refuelRow(w: World, r: RecordOf<'REFUEL'>, now: Instant): MyDayRow {
  const km: Km | null = r.payload.odometer?.value ?? null;
  const receipts = w.pages.filter((p) => p.record_key === r.key && p.artefact === 'RECEIPT' && received(p, now));
  const at = latest(receipts.flatMap((p) => (p.received_at === null ? [] : [p.received_at])));
  return { kind: 'REFUEL', stop_id: null,
    title: dot([`${fmtTime(r.occurred_at)} ${DC.tiles.refuel}`, r.payload.station, km === null ? null : `${fmtKm(km)} км`]),
    lines: at === null ? [] : [`Чек · ${DC.status.inOffice} ${fmtTime(at)}`], accepted_line: null,
    late_line: r.late ? DC.status.late : null };
}
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
/** When a road stop ended: the time he picked when he closed it, else — on a truck with CAN — the first movement after it. */
function roadStopEnd(w: World, mine: readonly DriverRecord[], r: RecordOf<'ROAD_STOP'>, now: Instant): { at: Instant; key: string | null } | null {
  const end = mine.find((e): e is RecordOf<'ROAD_STOP_END'> => e.type === 'ROAD_STOP_END' && e.payload.road_stop_key === r.key);
  if (end !== undefined) return { at: INSTANT.test(end.payload.at) ? end.payload.at as Instant : end.occurred_at, key: end.key };
  const truck = w.trucks.find((t) => t.id === r.truck_id);
  if (truck?.telematics !== 'RUPTELA' || !truck.has_can) return null;
  const moved = visibleTelemetry(w, r.truck_id, now).find((t) => t.kind === 'MOTION' && isBefore(r.occurred_at, t.at));
  return moved === undefined ? null : { at: moved.at, key: null };
}
/** «12:30–12:48 Тривога · 18 хв»; «з 12:30 Тривога · 5 хв» while it lasts. Nothing counts past the end of his shift. */
function roadStopRow(w: World, r: RecordOf<'ROAD_STOP'>, f: Frame, now: Instant): { row: MyDayRow; endKey: string | null } {
  const shiftEnd = f.shifts.find((s) => s.id === r.shift_id)?.ended_at ?? null;
  const closed = roadStopEnd(w, f.mine, r, now);
  const end = closed === null ? shiftEnd : earlier(closed.at, shiftEnd);
  const word = DC.roadStopShort[r.payload.reason];
  const minutes = fmtDur(span(r.occurred_at, end ?? now));
  const title = end === null ? `з ${fmtTime(r.occurred_at)} ${word} · ${minutes}`
    : `${fmtTime(r.occurred_at)}–${fmtTime(end)} ${word} · ${minutes}`;
  const late = r.late || f.mine.some((e) => e.key === closed?.key && e.late);
  return { row: { kind: 'ROAD_STOP', stop_id: null, title, lines: [], accepted_line: null, late_line: late ? DC.status.late : null },
    endKey: closed?.key ?? null };
}

/* ── paper, corrections, pages ────────────────────────────────────────── */

/** The «Папір» section: each original the office took on this date — «Оригінал ТТН 004517 прийнято в офісі 16:15 ·
 *  Н. Шевчук» — and his last handover before it: «Оригінали, здані 18.09: 1 з 1 прийнято в офісі · Н. Шевчук». */
function paperLines(w: World, driverId: string, date: BusinessDate, now: Instant): string[] {
  const docs = w.ttnDocs.filter((d) => d.driver_id === driverId && !d.example && d.ettn === null);
  const takenAt = (d: TtnDoc): Instant | null => (d.original !== null && known(d.original.received_at, now) ? d.original.received_at : null);
  const handedOn = (d: TtnDoc): BusinessDate | null => {
    const at = takenAt(d);
    return at === null ? d.driver_said_handed : businessDate(at);
  };
  const lines = docs.flatMap((d) => {
    const at = takenAt(d);
    return at === null || d.original === null || businessDate(at) !== date ? []
      : [{ at, no: d.no, line: `Оригінал ${d.label} прийнято в офісі ${fmtTime(at)} · ${userShort(w, d.original.received_by)}` }];
  }).sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.no, b.no)).map((x) => x.line);

  const before = docs.flatMap((d) => {
    const on = handedOn(d);
    return on !== null && byCodepoint(on, date) === -1 ? [on] : [];
  }).sort(byCodepoint).at(-1);
  if (before !== undefined) {
    const batch = docs.filter((d) => handedOn(d) === before);
    const taken = batch.filter((d) => takenAt(d) !== null);
    const by = taken.flatMap((d) => (d.original === null ? [] : [userShort(w, d.original.received_by)]))
      .filter((x, i, all) => all.indexOf(x) === i).sort(byCodepoint);
    lines.push(dot([`Оригінали, здані ${fmtDayMonth(before)}: ${taken.length} з ${batch.length} прийнято в офісі`, by.join(', ')]));
  }
  return lines;
}
/** The office's corrections of his records, in his words (§6.6), oldest first. */
function correctionsOf(w: World, keys: ReadonlySet<string>, now: Instant): CorrectionView[] {
  return w.corrections.filter((c) => keys.has(c.record_key) && atOrBefore(c.at, now))
    .sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id))
    .map((c) => ({ id: c.id, record_key: c.record_key, field: c.field, old: c.old, new: c.new, reason: c.reason,
      driver_wording: DC.correctionWording[c.reason], by: userShort(w, c.by), at: c.at, needs_ack: c.needs_ack,
      ack: c.ack !== null && atOrBefore(c.ack.at, now) ? { ...c.ack } : null }));
}
/** The stop detail's thumbnails: every page of his day the office has, a retaken one replaced by its retake, each with
 *  the furthest thing that happened to it — the original taken, the stop accepted, or the page in the office. */
function pageViews(w: World, mine: readonly DriverRecord[], now: Instant): MyPageView[] {
  const byKey = new Map(mine.map((r) => [r.key, r]));
  const replaced = (p: Page): boolean => p.superseded_by !== null
    && w.pages.some((x) => x.key === p.superseded_by && received(x, now));
  return w.pages.filter((p) => byKey.has(p.record_key) && received(p, now) && !replaced(p))
    .sort((a, b) => cmpInstant(a.captured_at, b.captured_at) || byCodepoint(a.key, b.key))
    .map((p) => {
      const stopId = byKey.get(p.record_key)?.stop_id ?? null;
      const stop = stopId === null ? null : w.plannedStops.find((s) => s.id === stopId) ?? null;
      const no = stop === null || !TTN_KINDS.includes(p.artefact) ? null : stop.ttn_nos[p.doc_index - 1] ?? null;
      const original = no === null ? null : w.ttnDocs.find((d) => d.no === no)?.original ?? null;
      const state_line = original !== null && known(original.received_at, now) ? `${DC.status.original} ${fmtTime(original.received_at)}`
        : stop !== null && known(stop.accepted_at, now) ? `${DC.status.accepted} ${fmtTime(stop.accepted_at)}`
          : `${DC.status.inOffice} ${fmtTime(p.received_at ?? p.captured_at)}`;
      return { key: p.key, stop_id: stopId, artefact: p.artefact, doc_index: p.doc_index, page_no: p.page_no,
        drawn_variant: p.drawn?.variant ?? null, image: p.image, state_line, captured_at: p.captured_at };
    });
}

/* ── «Мій день» (§7.4 operation 8) ────────────────────────────────────── */

function emptyDay(date: BusinessDate, paper: string[]): MyDay {
  return { date, span_line: null, on_site_line: null, km_line: null, rows: [], paper, corrections: [],
    day_confirmed_at: null, printed_at: null, late_notes: [], pages: [], empty: true };
}

/** «На зміні 05:20 – 16:02 · 10 год 42 хв»; «На зміні з 05:20 · 6 год 30 хв» while a shift is open. */
function spanLine(shifts: readonly Shift[], now: Instant): string | null {
  const first = shifts[0];
  const last = shifts.at(-1);
  if (first === undefined || last === undefined) return null;
  const total = fmtDur(shifts.reduce((sum, s) => sum + shiftMinutes(s, now), 0));
  const end = shifts.some((s) => s.ended_at === null) ? null : last.ended_at;
  return end === null ? `На зміні з ${fmtTime(first.started_at)} · ${total}`
    : `На зміні ${fmtTime(first.started_at)} – ${fmtTime(end)} · ${total}`;
}

/** His own record of `date`, as the office holds it at `now`. A day he had no shift on is `empty`. */
export function myDayView(w: World, deviceId: string, date: BusinessDate, now: Instant): MyDay {
  const driver = driverOf(w, deviceId);
  if (driver === null) return emptyDay(date, []);
  const paper = paperLines(w, driver.id, date, now);
  const f = frameOf(w, driver.id, date, now);
  if (f.shifts.length === 0) return emptyDay(date, paper);

  const stops = stopsOf(w, driver.id, f, now);
  const alert = f.shifts.reduce((sum, s) => sum + roadStopMinutes(w, s.id, now).ALERT, 0);
  const onSite = onSiteMinutes(stops);
  const kms = f.dayIds.map((id) => dayTotals(legsOfDay(w, id, now)).km);
  const km = kms.length === 0 || kms.includes(null) ? null : kms.reduce<number>((sum, k) => sum + (k ?? 0), 0);

  // Rows in the order the day ran: stops by arrival, refuels, road stops.
  const rows: { at: Instant; row: MyDayRow }[] = stops.map((s) => ({ at: s.arrived_at ?? s.end ?? now, row: stopRow(w, s, f.mine, now) }));
  const onRows = new Set<string>();
  for (const r of f.mine) {
    if (r.type === 'REFUEL') {
      rows.push({ at: r.occurred_at, row: refuelRow(w, r, now) });
      onRows.add(r.key);
    } else if (r.type === 'ROAD_STOP') {
      const { row, endKey } = roadStopRow(w, r, f, now);
      rows.push({ at: r.occurred_at, row });
      onRows.add(r.key);
      if (endKey !== null) onRows.add(endKey);
    }
  }
  const stopIds = new Set(stops.map((s) => s.stop.id));
  const late_notes = f.mine.filter((r) => r.late && !onRows.has(r.key) && (r.stop_id === null || !stopIds.has(r.stop_id)))
    .map((r) => `${fmtTime(r.occurred_at)} ${RECORD_WORD[r.type]} · ${DC.status.late}`);

  const days = f.dayIds.flatMap((id) => w.truckDays.filter((d) => d.id === id));
  const confirmed = days.length !== 0 && days.every((d) => d.status === 'CONFIRMED' && known(d.confirmed_at, now))
    ? latest(days.flatMap((d) => (d.confirmed_at === null ? [] : [d.confirmed_at]))) : null;

  return {
    date,
    span_line: spanLine(f.shifts, now),
    on_site_line: dot([`На точках ${fmtDur(onSite)}`, alert === 0 ? null : `тривога ${fmtDur(alert)}`]),
    km_line: `${fmtKm(km)} км`,
    rows: rows.sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.row.title, b.row.title)).map((x) => x.row),
    paper,
    corrections: correctionsOf(w, new Set(f.mine.map((r) => r.key)), now),
    day_confirmed_at: confirmed,
    printed_at: latest(days.flatMap((d) => (known(d.printed_at, now) ? [d.printed_at] : []))),
    late_notes,
    pages: pageViews(w, f.mine, now),
    empty: false,
  };
}

/* ── «Мій місяць» (§7.4 operation 9) ──────────────────────────────────── */

type DaySums = { date: BusinessDate; shifts: number; on_shift_min: number; on_site_min: number; docs_in_office: number;
  docs_total: number };
/** One shift day, straight from his records: the shift span, the on-site minutes and the documents in the office. */
function daySums(w: World, driverId: string, date: BusinessDate, now: Instant): DaySums {
  const f = frameOf(w, driverId, date, now);
  const docs = f.dayIds.map((id) => docCounts(w, id, now));
  return { date, shifts: f.shifts.length, on_shift_min: f.shifts.reduce((sum, s) => sum + shiftMinutes(s, now), 0),
    on_site_min: onSiteMinutes(stopsOf(w, driverId, f, now)),
    docs_in_office: docs.reduce((sum, d) => sum + d.in_office, 0), docs_total: docs.reduce((sum, d) => sum + d.total, 0) };
}
/** Whole hours, to the nearest: a month is read in hours. */
const hours = (minutes: number): number => intDiv(minutes + 30, 60);

/** His month as facts (§3.3 D-16): the shifts, the time on shift and at the points, the documents and the originals
 *  accepted, and one line per shift day, newest first. The totals are the month row the pilot keeps (P0-seeded) when
 *  there is one, and are counted from his records otherwise; a day the row lists reads as listed, every other shift day
 *  of the month is counted from his records. */
export function myMonthView(w: World, deviceId: string, month: string, now: Instant): MyMonth {
  const title = /^\d{4}-\d{2}$/.test(month) ? MONTH_NAMES[month.slice(5, 7)] ?? '' : '';
  const driver = driverOf(w, deviceId);
  if (title === '' || driver === null) return { month, title, lines: [], days: [] };
  const today = businessDate(now);
  const inMonth = (date: string): boolean => date.startsWith(`${month}-`) && byCodepoint(date, today) !== 1;

  const row = w.driverMonths.find((m) => m.driver_id === driver.id && m.month === month) ?? null;
  const listed: DaySums[] = (row?.days ?? []).filter((d) => inMonth(d.date))
    .map((d) => ({ date: d.date, shifts: 1, on_shift_min: d.on_shift_min, on_site_min: 0, docs_in_office: d.docs_in_office,
      docs_total: d.docs_total }));
  const listedDates = new Set(listed.map((d) => d.date));
  const lived = w.shifts.filter((s) => s.driver_id === driver.id && atOrBefore(s.started_at, now))
    .map((s) => businessDate(s.started_at)).filter((date, i, all) => inMonth(date) && !listedDates.has(date) && all.indexOf(date) === i)
    .map((date) => daySums(w, driver.id, date, now));
  const days: MyMonthDay[] = [...listed, ...lived].sort((a, b) => byCodepoint(b.date, a.date)).map((d) => ({ date: d.date,
    line: `${fmtDay(d.date)} · на зміні ${fmtDur(d.on_shift_min)} · документи ${d.docs_in_office} з ${d.docs_total}` }));

  const docs = w.ttnDocs.filter((d) => d.driver_id === driver.id && !d.example && d.ettn === null && inMonth(d.date));
  const totals = row ?? {
    shifts: lived.reduce((sum, d) => sum + d.shifts, 0),
    on_shift_min: lived.reduce((sum, d) => sum + d.on_shift_min, 0),
    on_site_min: lived.reduce((sum, d) => sum + d.on_site_min, 0),
    docs_accepted: lived.reduce((sum, d) => sum + d.docs_in_office, 0),
    docs_total: lived.reduce((sum, d) => sum + d.docs_total, 0),
    originals_accepted: docs.filter((d) => d.original !== null && known(d.original.received_at, now)).length,
    originals_total: docs.length,
  };
  return {
    month,
    title,
    lines: [
      `${totals.shifts} ${plural(totals.shifts, SHIFT_FORMS)} · на зміні ${hours(totals.on_shift_min)} год · з них на точках ${hours(totals.on_site_min)} год`,
      `Документів прийнято ${totals.docs_accepted} з ${totals.docs_total}`,
      `Оригіналів прийнято ${totals.originals_accepted} з ${totals.originals_total}`,
    ],
    days,
  };
}
