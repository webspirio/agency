// mocks/driver-report/src/domain/export.ts
/** «В BAS» (§4.2 C-11, D8): the four sheets a day goes to BAS as, their CSV (;) and JSON text, the file names, and the
 *  «Ключові точки» CSV of C-10.
 *
 *  Rows: the truck-days of the date in scope that are READY or CONFIRMED, in plate order; only the confirmed ones reach
 *  a file. A pilot day is derived from its records (odometer readings with corrections, legs, receipts, shifts); an
 *  example day of «Весь парк» reads its `figures`, which carry day totals only — so its legs and refuels are those
 *  totals dealt out (see `exampleLegs`, `exampleLitres`), and whatever the figures do not say is «—», never 0.
 *
 *  Cells are what the file carries: dates `dd.mm.yyyy`, Kyiv `HH:MM`, kilometres as bare digits, decimals with a comma
 *  and no grouping, durations as decimal hours («11,55» — a number BAS and a spreadsheet can add), «так» / «ні», and
 *  sources as the badge words. Every decimal goes through @agency/dec; kilometres through ./num. */
import { div, mul, sub, sum } from '@agency/dec';
import { byCodepoint, type BusinessDate, type Instant } from '@agency/mock';
import { fmtDate, fmtDateTime, fmtTime } from '../app/format';
import { OC } from '../copy/office';
import { atOrBefore, businessDate, cmpInstant, minutesBetween } from './clock';
import { dayTotals, legsOfDay, liveRecords, odometerPoints, stopsOfDay, truckDayStatus, type Leg } from './derive';
import type { KeyPointRow, SheetRow, SheetView, SourceKey } from './dto';
import { gt, intDiv, lt } from './num';
import { DIESEL_PRICE_KOP } from './seed';
import type { Driver, DriverRecord, ExampleDayFigures, Km, OdometerSource, RecordOf, Scope, Shift, Truck, TruckDay,
  World } from './types';
import { nightMinutes, onSiteMinutes, shiftMinutes } from './worktime';

export type Sheet = 'WAYBILLS' | 'LEGS' | 'REFUELS' | 'WORKTIME';
const SHEETS: readonly Sheet[] = ['WAYBILLS', 'LEGS', 'REFUELS', 'WORKTIME'];
export const SHEET_TITLES: Record<Sheet, string> = {
  WAYBILLS: 'Подорожні листи', LEGS: 'Ділянки', REFUELS: 'Заправки', WORKTIME: 'Робочий час' };

const SRC = 'Джерело';
const CONFIRMED = 'Підтверджено';
/** §4.2 C-11: every value column is followed by its source; every row ends with «Підтверджено». */
const COLUMNS: Record<Sheet, readonly string[]> = {
  WAYBILLS: ['Номер', 'Дата', 'Машина', 'Водій', 'Таб. №', 'Одометр виїзд, км', SRC, 'Одометр повернення, км', SRC,
    'Пробіг, км', 'З вантажем, км', 'Пальне, л', SRC, 'Години на зміні', CONFIRMED],
  LEGS: ['Номер ПЛ', '№', 'Звідки', 'Куди', 'З вантажем', 'Км', SRC, 'Маса, т', 'т·км', 'ТТН', 'е-ТТН', 'Прибуття', SRC,
    CONFIRMED],
  REFUELS: ['Номер ПЛ', 'Час', 'АЗС', 'Чек', 'ФН РРО', 'Літри', SRC, 'Сума, грн', 'Картка', 'Бак повний', 'Одометр', SRC,
    CONFIRMED],
  WORKTIME: ['Водій', 'Таб. №', 'Дата', 'Початок', 'Кінець', 'Тривалість змін', 'На точках', 'Нічні 22–06', 'Тахограф',
    CONFIRMED],
};
const KEY_POINT_COLUMNS: readonly string[] = ['Машина', 'Місце', 'Прибуття', 'Виїзд', 'Одометр', 'Джерело'];
const FILE_STEMS: Record<Sheet | 'ALL' | 'KEY_POINTS', string> = { WAYBILLS: 'КТЛ-подорожні', LEGS: 'КТЛ-ділянки',
  REFUELS: 'КТЛ-заправки', WORKTIME: 'КТЛ-робочий-час', ALL: 'КТЛ-BAS', KEY_POINTS: 'КТЛ-ключові-точки' };

/* ── cells ──────────────────────────────────────────────────────────────── */

const NONE = '—';
/** The litres of a receipt are read off it (OCR) and not yet matched to the card statement (§4.2 C-08). */
const RECEIPT = 'OCR чека';
const REGIS_TACHO = 'не звірено (Регіс)';
const yes = (b: boolean): string => (b ? 'так' : 'ні');
const kmCell = (v: Km | null): string => (v === null ? NONE : String(v));
const decCell = (v: string | null): string => (v === null ? NONE : v.replace('.', ','));
const hoursCell = (minutes: number | null): string => (minutes === null ? NONE : decCell(div(String(minutes), 60, 2)));
const timeCell = (at: Instant | null): string => (at === null ? NONE : fmtTime(at));
const sourceCell = (s: SourceKey | null): string => (s === null ? NONE : OC.source[s]);

/** The badge an odometer source shows. An unread photo has no value to vouch for. */
const SOURCE_OF: Record<OdometerSource, SourceKey | null> = { CAN: 'CAN', DASH_PHOTO: 'PHOTO', PLAN_CONFIRMED: 'PLAN_OK',
  DRIVER_TYPED: 'TYPED', UNREAD: null, OFFICE_EDIT: 'OFFICE', OFFICE_CALC: 'ESTIMATE', OFFICE_FROM_CALL: 'FROM_CALL' };
type Reading = { value: Km | null; source: SourceKey | null };

/** The office's litres for a receipt at the example diesel price: 22 800,00 грн → 250,00 л (§7.6, W0-15). */
const litresOf = (sumUah: string): string => div(mul(sumUah, '100', 2), DIESEL_PRICE_KOP, 2);
/** And back: the hryvnias of `litres` at the same price, exact to the kopeck. */
const uahOf = (litres: string): string => div(mul(litres, String(DIESEL_PRICE_KOP), 2), 100, 2);

/* ── the days of a sheet ────────────────────────────────────────────────── */

type Day = { day: TruckDay; truck: Truck; driver: Driver | null; confirmed: boolean };
type Ctx = { w: World; now: Instant; known: DriverRecord[] };
type Line = { cells: string[]; ettn: boolean };

/** READY and CONFIRMED truck-days of `date` whose truck is in `scope`, in plate order. */
function sheetDays(w: World, date: BusinessDate, scope: Scope): Day[] {
  const trucks = new Map(w.trucks.filter((t) => scope === 'FLEET' || t.pilot).map((t) => [t.id, t]));
  return w.truckDays.flatMap((day): Day[] => {
    const truck = trucks.get(day.truck_id);
    if (day.date !== date || truck === undefined) return [];
    const status = truckDayStatus(w, day.id);
    if (status === 'OPEN') return [];
    return [{ day, truck, driver: w.drivers.find((d) => d.id === day.driver_id) ?? null, confirmed: status === 'CONFIRMED' }];
  }).sort((a, b) => byCodepoint(a.truck.plate, b.truck.plate) || byCodepoint(a.day.id, b.day.id));
}

/** The confirmed truck-days of `date` in `scope`, in plate order: what a file of that date carries. */
export function daysForExport(w: World, date: BusinessDate, scope: Scope): TruckDay[] {
  return sheetDays(w, date, scope).filter((d) => d.confirmed).map((d) => d.day);
}

/** The shifts of a day that had started by `now`, oldest first. */
const shiftsOf = (c: Ctx, day: TruckDay): Shift[] => c.w.shifts
  .filter((s) => s.truck_day_id === day.id && atOrBefore(s.started_at, c.now))
  .sort((a, b) => cmpInstant(a.started_at, b.started_at) || byCodepoint(a.id, b.id));
/** The day's live records the server had by `now`, in `occurred_at` order: those filed under it, and those of its
 *  shifts. */
function recordsOf(c: Ctx, day: TruckDay): DriverRecord[] {
  const shifts = shiftsOf(c, day);
  const ids = new Set(shifts.map((s) => s.id));
  const starts = new Set(shifts.flatMap((s) => (s.start_key === null ? [] : [s.start_key])));
  return c.known.filter((r) => r.truck_day_id === day.id || (r.shift_id !== null && ids.has(r.shift_id)) || starts.has(r.key));
}
/** A record's odometer reading as the office holds it now — a correction over the driver's value. */
function readingOf(c: Ctx, truckId: string, key: string): Reading | null {
  const point = odometerPoints(c.w, truckId, c.now).find((p) => p.record_key === key);
  return point === undefined ? null : { value: point.value, source: SOURCE_OF[point.source] };
}
/** The fleet board's reading for an example truck (§7.6, «16:05»): its odometer when the day ended. */
function boardReading(w: World, truckId: string): { value: Km; source: SourceKey | null } | null {
  const odo = w.exampleBoard.find((b) => b.truck_id === truckId)?.odometer ?? null;
  return odo === null ? null : { value: odo.value, source: SOURCE_OF[odo.source] };
}
/** When a shift ended: its own end, else its SHIFT_END record. */
function endOf(shift: Shift, records: DriverRecord[]): Instant | null {
  return shift.ended_at ?? records.find((r) => r.type === 'SHIFT_END' && r.shift_id === shift.id)?.occurred_at ?? null;
}
const placeLabel = (w: World, id: string | null): string =>
  (id === null ? null : w.places.find((p) => p.id === id)?.label) ?? NONE;
const ettnLine = (e: { no: string; platform: string; status: string }): string => `е-ТТН № ${e.no} · ${e.platform} · ${e.status}`;
/** The е-ТТН a day's driver carried that date (the fleet example has one, §7.6), or null. */
const exampleEttn = (w: World, day: TruckDay) =>
  w.ttnDocs.find((d) => d.ettn !== null && d.date === day.date && d.driver_id === day.driver_id) ?? null;

/* ── «Подорожні листи» ──────────────────────────────────────────────────── */

function waybillLines(c: Ctx, d: Day): Line[] {
  const { day, truck } = d;
  const records = recordsOf(c, day);
  const startRec = records.find((r) => r.type === 'SHIFT_START');
  const endRec = records.filter((r) => r.type === 'SHIFT_END').at(-1);
  const f = day.figures;
  const board = f === null ? null : boardReading(c.w, truck.id);
  // A record's reading wins where the day has one (Ярошенко's typed start); an example day's end is the board's
  // reading and its start that reading less the day's run.
  const start = (startRec === undefined ? null : readingOf(c, truck.id, startRec.key))
    ?? (board === null || f === null ? null : { value: board.value - f.km, source: board.source });
  const end = (endRec === undefined ? null : readingOf(c, truck.id, endRec.key)) ?? board;
  let run: Km | null;
  let loaded: Km | null;
  let fuel: string | null;
  let minutes: number | null;
  if (f !== null) {
    run = f.km; loaded = f.km_loaded; fuel = f.fuel_l; minutes = minutesBetween(f.from, f.to);
  } else {
    const totals = dayTotals(legsOfDay(c.w, day.id, c.now));
    const litres = records.filter((r): r is RecordOf<'REFUEL'> => r.type === 'REFUEL').map((r) => r.payload.sum_uah);
    const shifts = shiftsOf(c, day);
    run = totals.km; loaded = totals.loaded;
    fuel = litres.length === 0 || litres.includes(null) ? null : sum(litres.map((s) => litresOf(s ?? '0')), 2);
    minutes = shifts.length === 0 ? null
      : shifts.reduce((acc, s) => acc + shiftMinutes({ ...s, ended_at: endOf(s, records) }, c.now), 0);
  }
  return [{ ettn: false, cells: [day.waybill_no ?? NONE, fmtDate(day.date), truck.plate,
    f?.driver_short ?? d.driver?.short_name ?? NONE, d.driver?.tab_no ?? NONE,
    kmCell(start?.value ?? null), sourceCell(start?.source ?? null), kmCell(end?.value ?? null), sourceCell(end?.source ?? null),
    kmCell(run), kmCell(loaded), decCell(fuel), fuel === null ? NONE : RECEIPT, hoursCell(minutes)] }];
}

/* ── «Ділянки» ──────────────────────────────────────────────────────────── */

function legLines(c: Ctx, d: Day): Line[] {
  const { day } = d;
  const waybill = day.waybill_no ?? NONE;
  if (day.figures !== null) return exampleLegLines(c, d, day.figures);
  const records = recordsOf(c, day);
  const stops = stopsOfDay(c.w, day.id, c.now);
  // legsOfDay closes each shift with its SHIFT_END; those are the legs with no stop arrival, in shift order.
  const ends = shiftsOf(c, day).flatMap((s) => records.filter((r) => r.type === 'SHIFT_END' && r.shift_id === s.id).slice(0, 1));
  let k = 0;
  return legsOfDay(c.w, day.id, c.now).map((l: Leg): Line => {
    let arrival: Instant | null = null;
    let arrivalSource: SourceKey | null = null;
    let kmSource: SourceKey | null = null;
    if (l.arrival_driver !== null) {
      const stop = stops.find((s) => s.arrived_at === l.arrival_driver && s.stop.place_id === l.to_place_id);
      arrival = l.arrival_driver;
      arrivalSource = stop?.arrival === 'RUPTELA' ? 'RUPTELA' : 'DRIVER';
      kmSource = stop?.odometer ? SOURCE_OF[stop.odometer.source] : null;
    } else {
      const end = ends[k];
      k += 1;
      if (end !== undefined) {
        arrival = end.occurred_at;
        arrivalSource = 'DRIVER';
        kmSource = readingOf(c, day.truck_id, end.key)?.source ?? null;
      }
    }
    const ettns = l.ttn_nos.flatMap((no) => c.w.ttnDocs.flatMap((t) => (t.no === no && t.ettn !== null ? [t.ettn] : [])));
    return { ettn: ettns.length !== 0, cells: [waybill, String(l.n), placeLabel(c.w, l.from_place_id),
      placeLabel(c.w, l.to_place_id), yes(l.loaded), kmCell(l.km), l.km === null ? NONE : sourceCell(kmSource),
      decCell(l.mass), decCell(l.tkm), l.ttn_nos.length === 0 ? NONE : l.ttn_nos.join(', '),
      ettns.length === 0 ? NONE : ettns.map(ettnLine).join('; '),
      timeCell(arrival), arrival === null ? NONE : sourceCell(arrivalSource)] };
  });
}

/** An example day's legs from its totals alone: the last leg is the empty run home and the one before it the loaded run
 *  into the drop; the loaded km sit on that leg and the empty km are shared by the others (the remainder on the last).
 *  A one-leg day is one loaded leg of the whole run. Each day's legs add up to its `km`, never to a number of their own. */
function exampleLegs(f: ExampleDayFigures): { loaded: boolean; km: Km }[] {
  if (!gt(f.legs, 0)) return [];
  if (f.legs === 1) return [{ loaded: true, km: f.km }];
  const loadedAt = f.legs - 2;
  const emptyLegs = f.legs - 1;
  const empty = gt(f.km, f.km_loaded) ? f.km - f.km_loaded : 0;
  const share = intDiv(empty, emptyLegs);
  let left = empty;
  let emptySeen = 0;
  return Array.from({ length: f.legs }, (_, i) => {
    if (i === loadedAt) return { loaded: true, km: f.km - empty };
    emptySeen += 1;
    const km = emptySeen === emptyLegs ? left : share;
    left -= km;
    return { loaded: false, km };
  });
}

function exampleLegLines(c: Ctx, d: Day, f: ExampleDayFigures): Line[] {
  const board = boardReading(c.w, d.truck.id);
  const ettn = exampleEttn(c.w, d.day);
  let carried = false;
  return exampleLegs(f).map((l, i): Line => {
    const doc = l.loaded && !carried && ettn !== null ? ettn : null;
    if (doc !== null) carried = true;
    return { ettn: doc !== null, cells: [d.day.waybill_no ?? NONE, String(i + 1), NONE, NONE, yes(l.loaded), kmCell(l.km),
      sourceCell(board?.source ?? null), NONE, NONE, doc === null ? NONE : doc.no,
      doc?.ettn ? ettnLine(doc.ettn) : NONE, NONE, NONE] };
  });
}

/* ── «Заправки» ─────────────────────────────────────────────────────────── */

function refuelLines(c: Ctx, d: Day): Line[] {
  const { day, truck } = d;
  const waybill = day.waybill_no ?? NONE;
  if (day.figures !== null) {
    return exampleLitres(day.figures).map((litres): Line => ({ ettn: false, cells: [waybill, NONE, NONE, NONE, NONE,
      decCell(litres), litres === null ? NONE : RECEIPT, decCell(litres === null ? null : uahOf(litres)),
      truck.card_mask ?? NONE, NONE, NONE, NONE] }));
  }
  return recordsOf(c, day).filter((r): r is RecordOf<'REFUEL'> => r.type === 'REFUEL').map((r): Line => {
    const p = r.payload;
    const litres = p.sum_uah === null ? null : litresOf(p.sum_uah);
    const odo = readingOf(c, truck.id, r.key);
    return { ettn: false, cells: [waybill, fmtTime(r.occurred_at), p.station, p.receipt_no ?? NONE, p.rro_no ?? NONE,
      decCell(litres), litres === null ? NONE : RECEIPT, decCell(p.sum_uah), p.card_mask ?? NONE, yes(p.full_tank),
      kmCell(odo?.value ?? null), odo === null || odo.value === null ? NONE : sourceCell(odo.source)] };
  });
}

/** An example day's refuels from its litres alone: equal shares to the hundredth, the remainder on the last, so they add
 *  up to `fuel_l` exactly. Unknown litres stay unknown on every row. */
function exampleLitres(f: ExampleDayFigures): (string | null)[] {
  if (!gt(f.refuels, 0)) return [];
  const total = f.fuel_l;
  if (total === null) return Array.from({ length: f.refuels }, () => null);
  const share = div(total, f.refuels, 2);
  const head = Array.from({ length: f.refuels - 1 }, () => share);
  return [...head, sub(total, sum(head, 2), 2)];
}

/* ── «Робочий час» ──────────────────────────────────────────────────────── */

/** The tachograph beside the app's span: Регіс trucks send none («не звірено»); an R+C truck's card in → card out that
 *  day, once both are known; otherwise unknown. */
function tachoCell(c: Ctx, truck: Truck, date: BusinessDate): string {
  if (truck.telematics === 'REGIS') return REGIS_TACHO;
  if (!truck.has_tacho) return NONE;
  const card = c.w.telemetry.filter((t) => t.truck_id === truck.id && businessDate(t.at) === date && atOrBefore(t.at, c.now))
    .sort((a, b) => cmpInstant(a.at, b.at));
  const inAt = card.find((t) => t.kind === 'CARD_IN')?.at ?? null;
  const outAt = card.filter((t) => t.kind === 'CARD_OUT').at(-1)?.at ?? null;
  return inAt === null || outAt === null || lt(minutesBetween(inAt, outAt), 0) ? NONE : hoursCell(minutesBetween(inAt, outAt));
}

function worktimeLines(c: Ctx, d: Day): Line[] {
  const { day, truck } = d;
  const who = [d.day.figures?.driver_short ?? d.driver?.short_name ?? NONE, d.driver?.tab_no ?? NONE, fmtDate(day.date)];
  const f = day.figures;
  if (f !== null) {
    return [{ ettn: false, cells: [...who, fmtTime(f.from), fmtTime(f.to), hoursCell(minutesBetween(f.from, f.to)), NONE,
      hoursCell(nightMinutes(f.from, f.to)), tachoCell(c, truck, day.date)] }];
  }
  const records = recordsOf(c, day);
  const shifts = shiftsOf(c, day).map((s) => ({ ...s, ended_at: endOf(s, records) }));
  const first = shifts[0];
  const last = shifts.at(-1);
  if (first === undefined || last === undefined) {
    return [{ ettn: false, cells: [...who, NONE, NONE, NONE, NONE, NONE, tachoCell(c, truck, day.date)] }];
  }
  const span = shifts.reduce((acc, s) => acc + shiftMinutes(s, c.now), 0);
  const night = shifts.reduce((acc, s) => acc + nightMinutes(s.started_at, s.ended_at ?? c.now), 0);
  return [{ ettn: false, cells: [...who, fmtTime(first.started_at), timeCell(last.ended_at), hoursCell(span),
    hoursCell(onSiteMinutes(stopsOfDay(c.w, day.id, c.now))), hoursCell(night), tachoCell(c, truck, day.date)] }];
}

/* ── the sheet ──────────────────────────────────────────────────────────── */

const LINES: Record<Sheet, (c: Ctx, d: Day) => Line[]> = {
  WAYBILLS: waybillLines, LEGS: legLines, REFUELS: refuelLines, WORKTIME: worktimeLines };

/** «У BAS 21.09 16:07 · версія 1» — shown under the row on C-11, never written into a file. */
const exportedLine = (day: TruckDay): string | null =>
  (day.exported === null ? null : `У BAS ${fmtDateTime(day.exported.at)} · версія ${day.exported.version}`);

export function sheetView(w: World, sheet: Sheet, date: BusinessDate, scope: Scope, now: Instant): SheetView {
  const c: Ctx = { w, now, known: liveRecords(w).filter((r) => atOrBefore(r.received_at, now)) };
  const rows = sheetDays(w, date, scope).flatMap((d) => LINES[sheet](c, d).map((l): SheetRow => ({
    cells: [...l.cells, yes(d.confirmed)], confirmed: d.confirmed, example: d.day.example, ettn: l.ettn,
    exported_line: exportedLine(d.day) })));
  return { title: SHEET_TITLES[sheet], columns: [...COLUMNS[sheet]], rows, total: rows.filter((r) => r.confirmed).length };
}

/* ── files ──────────────────────────────────────────────────────────────── */

const BOM = '﻿';
const CRLF = '\r\n';
const NEEDS_QUOTES = /[;"\r\n]/;
const csvCell = (v: string): string => (NEEDS_QUOTES.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** UTF-8 with BOM (so a Ukrainian Excel opens it as Cyrillic), `;`-separated, every line ending CRLF. */
const csv = (columns: readonly string[], rows: readonly (readonly string[])[]): string =>
  BOM + [columns, ...rows].map((r) => `${r.map(csvCell).join(';')}${CRLF}`).join('');

/** The sheet as a CSV file: the header, then the confirmed rows only. */
export function toCsv(view: SheetView): string {
  return csv(view.columns, view.rows.filter((r) => r.confirmed).map((r) => r.cells));
}

/** A column that appears more than once in a sheet («Джерело») is named after the column it follows in the JSON, where
 *  two equal keys would silently keep only the last. */
const jsonKeys = (columns: readonly string[]): string[] => columns.map((col, i) =>
  (columns.indexOf(col) === columns.lastIndexOf(col) ? col : `${col} (${columns[i - 1] ?? ''})`));

/** All four sheets as one JSON document keyed by sheet title, each a list of `{ column: cell }` for the confirmed rows. */
export function toJson(views: Record<Sheet, SheetView>): string {
  const doc: Record<string, Record<string, string>[]> = {};
  for (const sheet of SHEETS) {
    const v = views[sheet];
    const keys = jsonKeys(v.columns);
    doc[SHEET_TITLES[sheet]] = v.rows.filter((r) => r.confirmed)
      .map((r) => Object.fromEntries(keys.map((k, i) => [k, r.cells[i] ?? NONE])));
  }
  return JSON.stringify(doc, null, 2);
}

/** «КТЛ-подорожні-21.09.2026.csv» … «КТЛ-BAS-21.09.2026.json» (§4.2 C-10, C-11). */
export function fileName(sheet: Sheet | 'ALL' | 'KEY_POINTS', date: BusinessDate, format: 'CSV' | 'JSON'): string {
  return `${FILE_STEMS[sheet]}-${fmtDate(date)}.${format === 'CSV' ? 'csv' : 'json'}`;
}

/** C-10 «Завантажити CSV»: Машина · Місце · Прибуття · Виїзд · Одометр · Джерело, same CSV rules. */
export function keyPointsCsv(rows: KeyPointRow[]): string {
  return csv(KEY_POINT_COLUMNS, rows.map((r) => [r.plate, r.place, fmtTime(r.arrived_at),
    r.departed_label === '' ? NONE : r.departed_label, kmCell(r.odometer), OC.source[r.source]]));
}
