// mocks/driver-report/src/domain/views/truckday.ts
/** The truck-day as the office reads it (§4.2 C-07 «Дні на підтвердження», C-08 «Подорожній лист», C-09 «Друк»): the
 *  rows of the C-07 list and the whole derived waybill of C-08 — requisites, the four summary cells, the chronology,
 *  the legs, the fuel block, the flags with their states, the history, the footer's consequence and the lines of the
 *  printed sheet. Pure functions over a `World` snapshot, time-gated to `now` exactly as derive.ts is (a record once
 *  received, a page once received, telemetry once its moment passed, a ТТН mark once the office typed it). The handlers
 *  in `src/api/handlers/truckdays.ts` store only what the office decides — a confirmation, a print — and return these.
 *
 *  Three kinds of day, one shape:
 *  - a pilot day not confirmed on an earlier date is derived in full from the driver's records: the cells carry every
 *    figure of C-08 («234 км · з вантажем 175 · порожній 59 · 2 878 т·км»);
 *  - a pilot day CONFIRMED ON AN EARLIER DATE is the filed waybill (beat 0 shows Friday's day read-only): its cells read
 *    as the paper it became — «212 км · з вантажем 98», «від повного до повного 15.09 → 18.09 · 32,3 л/100 проти 32,0
 *    (базова)», the shift span over «на зміні 11 год 33 хв»;
 *  - an example day of «Весь парк» renders from its `figures` and carries `example: true`; whatever the figures do not
 *    say is «—», never 0 (§8.6 #7). A paper driver's example day has one chronology row: the «зі слів водія» entry the
 *    dispatcher wrote down (UC-O15).
 *
 *  The documents cell of a confirmed day ends with its paper trail, «підтверджено Н. Шевчук 18.09 17:05 · надруковано ·
 *  водій підписав 17:10». `consequence` is the footer's left text: before confirmation the sentence of C-08, after it
 *  the stamp «Підтверджено Н. Шевчук 21.09 16:06».
 *
 *  Kilometres and minutes are whole numbers compared through ../num; litres, rates, tonnes and t·km are decimal strings
 *  that only @agency/dec touches. */
import { cmp, div, mul, round, sub } from '@agency/dec';
import { asDecimal2, byCodepoint } from '@agency/mock';
import { fmtDate, fmtDateTime, fmtDayMonth, fmtDec, fmtDur, fmtKm, fmtPct, fmtRate, fmtTime, MINUS, plural } from '../../app/format';
import { DC } from '../../copy/driver';
import { OC } from '../../copy/office';
import { atOrBefore, businessDate, cmpInstant, daysBetween, kyiv, kyivParts, minutesBetween } from '../clock';
import { dayTotals, docCounts, legsOfDay, liveRecords, odometerPoints, stopsOfDay, truckDayStatus, visibleTelemetry,
  type Leg, type StopFacts } from '../derive';
import type { Badge, ExceptionItem, LegRow, SourceKey, SummaryCellView, TimelineRow, TruckDayRow, TruckDayView } from '../dto';
import { openItems, resolvedToday } from '../exceptions';
import { deviation, fullToFull, normLitres, overTolerance } from '../fuel';
import { between, cmpNum, gt, intDiv, lt, toInt } from '../num';
import type { OdometerPoint } from '../odometer';
import { DIESEL_PRICE_KOP } from '../seed';
import { FLAG_CODES, ROAD_STOP_REASONS, type Audit, type BusinessDate, type DriverRecord,
  type ExampleDayFigures, type Instant, type Km, type OdometerSource, type OfficeRole, type Page, type PlannedStop,
  type RecordOf, type RoadStopReason, type Scope, type Shift, type Truck, type TruckDay, type World } from '../types';
import { onSiteMinutes, roadStopMinutes, shiftMinutes } from '../worktime';

/* ── words ──────────────────────────────────────────────────────────────── */

const NONE = '—';
const COMPANY = 'ТОВ «КОРМО-ТРАНС-ЛОГІСТИК» · ЄДРПОУ 37380270';
const COMPANY_TOWN = 'Запоріжжя';
const DRAFT_LINE = 'Чернетка електронного подорожнього листа · до наказу КТЛ';
const SHEET_TITLE = 'ПОДОРОЖНІЙ ЛИСТ ВАНТАЖНОГО АВТОМОБІЛЯ';
const REGIS_REMAINS = 'Залишки: немає даних з Регіс (фаза 1) · факт за день не рахується';
const REGIS_TACHO = 'тахограф: не звірено (Регіс)';
const OVER_TOLERANCE = 'понад допуск 5 % (приклад)';
const NO_FLAGS = 'Після підтвердження день стане лише для читання і піде у файл для BAS.';
const WITH_FLAGS = '— у BAS піде чернеткою з позначкою «Є нез\'ясовані позначки — не проводити»';
const FLAG_FORMS = ['позначка не з\'ясована', 'позначки не з\'ясовані', 'позначок не з\'ясовано'] as const;
const OPEN_FLAG = 'не з\'ясована';
const WEATHER_NOTE = 'погода за місцем і часом';
const RECEIPT_WORDS = 'OCR чека, не звірено';
const ROLE_WORD: Record<OfficeRole, string> = { DISPATCHER: 'диспетчер', OPERATOR: 'оператор', ACCOUNTANT: 'бухгалтер',
  MECHANIC: 'механік', ON_CALL: 'черговий' };
/** Road stops inside a line of the «На зміні» cell, lower-case («тривога 18 хв»). */
const ROAD_WORD: Record<RoadStopReason, string> = { ALERT: 'тривога', CURFEW: 'комендантська', HEAT: 'спека',
  CHECKPOINT: 'блокпост', BREAKDOWN: 'поломка', DETOUR: 'об\'їзд', ACCIDENT: 'ДТП', WEIGH_CONTROL: 'ваговий контроль' };
/** The badge a reading's source shows (§6.6). An unread photo has no value to vouch for. */
const SOURCE_OF: Record<OdometerSource, SourceKey | null> = { CAN: 'CAN', DASH_PHOTO: 'PHOTO', PLAN_CONFIRMED: 'PLAN_OK',
  DRIVER_TYPED: 'TYPED', UNREAD: null, OFFICE_EDIT: 'OFFICE', OFFICE_CALC: 'ESTIMATE', OFFICE_FROM_CALL: 'FROM_CALL' };
/** The record types the chronology shows (§4.2 C-08). Never a segment, a request's «seen», a retake, a reply, a
 *  correction's answer, an undo or a heartbeat; a road stop's end folds into the road stop's own row. */
const TIMELINE_TYPES: readonly DriverRecord['type'][] = ['SHIFT_START', 'ARRIVED', 'LOADED', 'UNLOADED', 'STOP_LEFT',
  'REFUEL', 'ROAD_STOP', 'DOCS_ADDED', 'SHIFT_END', 'DRIVER_ATTESTED'];
/** A flag is an exception item that a record's own flag raised (§7.3 FLAG_CODES); a stop review or a call of the lanes
 *  is work, not a flag on the waybill. */
const FLAG_ITEM_CODES: ReadonlySet<string> = new Set<string>(FLAG_CODES);
/** A phone clock this many minutes off the server's earns the day a badge (a badge, never an inbox item, C-08). */
const CLOCK_BADGE_MIN = 5;
/** The simulated air temperature by the Kyiv hour of a late-September day, °C — the requisite says «погода за місцем і
 *  часом», and the mock has no weather feed, so it reads one fixed day curve instead of inventing a number per call:
 *  departure 05:20 → +11, return 16:02 → +17 (§4.2 C-08). */
const TEMPERATURE_BY_HOUR: readonly number[] = [10, 10, 10, 10, 10, 11, 11, 12, 13, 14, 15, 16, 16, 17, 17, 17, 17, 16,
  15, 14, 13, 12, 11, 11];
const WAYBILL = /^ПЛ-(\d{6})$/;
/** A ТТН mark as the office typed it: «07:48», or the four digits of the input («0748»). */
const HHMM = /^(\d{2}):?(\d{2})$/;
/** The two office acts on a day that never move its version (§7.3), as audit rows are written across the office
 *  handlers: `action` a code, `detail` the sentence «Історія змін» shows. */
export const CONFIRM_CODE = 'CONFIRM_DAY';
export const PRINT_CODE = 'PRINT_DAY';
export const confirmAction = (version: number): string => `Підтвердила день (версія ${version})`;
export const PRINT_ACTION = 'Надрукувала подорожній лист';
const CONFIRM_PREFIX = 'Підтвердила день';
/** Every audited office act that moves no version, so none can be what a stale confirm missed: the two above, and a
 *  retake request — office.ts `createRequest` audits it («Попросила перезняти …») without bumping, because asking
 *  changes nothing on the day. The acts that DO bump are office.ts's ACCEPT_PRINTED, SET_FIELD, MARK_BLANK_REVERSE,
 *  ACCEPT_STOP and CREATE_CORRECTION. */
const MOVES_NO_VERSION: readonly string[] = [CONFIRM_CODE, PRINT_CODE, 'CREATE_REQUEST'];

/* ── small helpers ──────────────────────────────────────────────────────── */

const dot = (parts: readonly (string | null | undefined)[]): string =>
  parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' · ');
const lowerFirst = (s: string): string => `${s.slice(0, 1).toLowerCase()}${s.slice(1)}`;
const userOf = (w: World, id: string) => w.officeUsers.find((u) => u.id === id || `user-${u.login}` === id) ?? null;
const userShort = (w: World, id: string): string => userOf(w, id)?.short_name ?? id;
const placeById = (w: World, id: string | null) => (id === null || id === '' ? null : w.places.find((p) => p.id === id) ?? null);
/** «База КТЛ» for the base (its name up to the town), the short name anywhere else («Дніпро-Корм, Вільнянськ»). */
function placeName(w: World, id: string | null): string {
  const place = placeById(w, id);
  if (place === null) return 'Нове місце';
  return place.kind === 'BASE' ? place.name.split(',')[0] ?? place.short : place.short;
}
const placeLabel = (w: World, id: string): string => placeById(w, id)?.label ?? NONE;
const baseId = (w: World): string | null => w.places.find((p) => p.kind === 'BASE')?.id ?? null;
/** «Н. Шевчук 21.09 16:06». */
const whoWhen = (by: string | null, at: Instant): string => (by === null ? fmtDateTime(at) : `${by} ${fmtDateTime(at)}`);
const kindOf = (s: PlannedStop): string | null => (s.kind === 'UNPLANNED' ? s.unplanned_kind : s.kind);
const received = (p: Page, now: Instant): boolean => p.received_at !== null && atOrBefore(p.received_at, now);
/** «+0,8» · «−0,6» · «0,0»: signed, with the grouping and comma of every other figure. */
const signed = (v: string): string => (cmp(v, '0') === 1 ? `+${fmtDec(v)}` : fmtDec(v));
/** The office's litres for a receipt at the example diesel price: 22 800,00 грн → 250,00 л (§7.6, W0-15). */
const receiptLitres = (sumUah: string): string => div(mul(sumUah, '100'), DIESEL_PRICE_KOP);
/** «+11» — a whole °C figure with its sign. */
const celsius = (n: number): string => (lt(n, 0) ? `${MINUS}${-n}` : `+${n}`);
/** A Kyiv 'HH:MM' on a business date as an instant, or null when it is not one. */
function wallOn(date: BusinessDate, hm: string | null): Instant | null {
  const m = hm === null ? null : HHMM.exec(hm);
  if (m === null) return null;
  try {
    return kyiv(`${date} ${m[1] ?? ''}:${m[2] ?? ''}`);
  } catch {
    return null;
  }
}

/** The badge a truck's row carries (§4.2 C-01, C-07). */
export function badgeOf(t: Truck): Badge {
  if (t.paper || t.telematics === 'NONE') return 'PAPER';
  return t.telematics === 'RUPTELA' ? 'RUPTELA' : 'REGIS';
}
const isRc = (t: Truck): boolean => t.telematics === 'RUPTELA' && t.has_can;

/* ── what the server knew at `now` ─────────────────────────────────────── */

type Ctx = { w: World; now: Instant; today: BusinessDate; known: DriverRecord[]; flags: Map<string, ExceptionItem[]> };

/** Every flag item of every day, open or closed today: one pass over the lanes, shared by all rows of a list. */
function flagItems(w: World, now: Instant): Map<string, ExceptionItem[]> {
  const all = [...openItems(w, 'FLEET', now)];
  if (w.resolutions.length !== 0 || w.corrections.length !== 0) {
    all.push(...resolvedToday(w, 'FLEET', now, 'NOW'), ...resolvedToday(w, 'FLEET', now, 'REVIEW'));
  }
  const out = new Map<string, ExceptionItem[]>();
  const seen = new Set<string>();
  for (const item of all) {
    if (item.truck_day_id === null || !FLAG_ITEM_CODES.has(item.code) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.set(item.truck_day_id, [...(out.get(item.truck_day_id) ?? []), item]);
  }
  for (const items of out.values()) items.sort((a, b) => cmpInstant(a.opened_at, b.opened_at) || byCodepoint(a.id, b.id));
  return out;
}
function context(w: World, now: Instant): Ctx {
  return { w, now, today: businessDate(now), known: liveRecords(w).filter((r) => atOrBefore(r.received_at, now)),
    flags: flagItems(w, now) };
}

type Day = { day: TruckDay; truck: Truck; records: DriverRecord[]; shifts: Shift[]; points: Map<string, OdometerPoint> };

function dayOf(c: Ctx, day: TruckDay, truck: Truck): Day {
  const shifts = c.w.shifts.filter((s) => s.truck_day_id === day.id && atOrBefore(s.started_at, c.now))
    .sort((a, b) => cmpInstant(a.started_at, b.started_at) || byCodepoint(a.id, b.id));
  const records = c.known.filter((r) => r.truck_day_id === day.id);
  const points = new Map(odometerPoints(c.w, truck.id, c.now).flatMap((p) => (p.record_key === null ? [] : [[p.record_key, p] as const])));
  return { day, truck, records, shifts, points };
}
/** When a shift ended: its SHIFT_END record, else the stored end once it has passed. */
function shiftEnd(d: Day, shift: Shift, now: Instant): Instant | null {
  const end = d.records.find((r) => r.type === 'SHIFT_END' && r.shift_id === shift.id);
  if (end !== undefined) return end.occurred_at;
  return shift.ended_at !== null && atOrBefore(shift.ended_at, now) ? shift.ended_at : null;
}
/** The newest attestation of the day's shifts, by record or as stored. */
function attestedAt(d: Day, now: Instant): Instant | null {
  const own = d.records.filter((r) => r.type === 'DRIVER_ATTESTED').map((r) => r.occurred_at);
  const stored = d.shifts.flatMap((s) => (s.attested_at !== null && atOrBefore(s.attested_at, now) ? [s.attested_at] : []));
  return [...own, ...stored].sort(cmpInstant).at(-1) ?? null;
}
const reading = (d: Day, r: DriverRecord | undefined): OdometerPoint | null =>
  (r === undefined ? null : d.points.get(r.key) ?? null);
/** A pilot day confirmed on a date before today: the filed waybill. */
const filed = (c: Ctx, day: TruckDay): boolean =>
  !day.example && day.status === 'CONFIRMED' && gt(daysBetween(day.date, c.today), 0);

/* ── the four summary cells ─────────────────────────────────────────────── */

function odometerCell(c: Ctx, d: Day, legs: Leg[]): SummaryCellView {
  const start = reading(d, d.records.find((r) => r.type === 'SHIFT_START'))?.value ?? null;
  const end = reading(d, d.records.filter((r) => r.type === 'SHIFT_END').at(-1))?.value ?? null;
  const value = start === null && end === null ? NONE : `${fmtKm(start)} → ${fmtKm(end)}`;
  const t = dayTotals(legs);
  const km = `${fmtKm(t.km)} км`;
  const loaded = `з вантажем ${fmtKm(t.loaded)}`;
  const lines = legs.length === 0 ? ['ділянок ще немає']
    : filed(c, d.day) ? [dot([km, loaded])]
      : [dot([km, loaded, `порожній ${fmtKm(t.empty)}`, t.tkm === null ? null : `${fmtDec(round(t.tkm, 0))} т·км`])];
  return { label: 'Одометр', value, lines, hold_lines: [], simulated: false };
}

type Fill = { at: Instant; value: Km; litres: string; full: boolean };
/** The truck's fills up to the end of `date`: a refuel with a reading and litres (the card statement's when matched,
 *  else the receipt's OCR), oldest first. */
function fillsUntil(c: Ctx, d: Day, date: BusinessDate): Fill[] {
  return c.known.filter((r): r is RecordOf<'REFUEL'> => r.type === 'REFUEL' && r.truck_id === d.truck.id
    && !gt(daysBetween(date, businessDate(r.occurred_at)), 0))
    .flatMap((r): Fill[] => {
      const value = d.points.get(r.key)?.value ?? null;
      const statement = c.w.statements.find((s) => s.matched_record_key === r.key)?.litres ?? null;
      const litres = statement ?? (r.payload.sum_uah === null ? null : receiptLitres(r.payload.sum_uah));
      return value === null || litres === null ? [] : [{ at: r.occurred_at, value, litres, full: r.payload.full_tank }];
    });
}
/** The last full-to-full window closed by the end of the day: its two full fills and what lies between. */
function lastWindow(fills: Fill[]): { from: Instant; to: Instant; rate: string; km: Km } | null {
  let last = -1;
  let prev = -1;
  fills.forEach((f, i) => { if (f.full) { prev = last; last = i; } });
  const a = fills[prev];
  const b = fills[last];
  if (lt(prev, 0) || a === undefined || b === undefined) return null;
  const w = fullToFull(fills.slice(prev, last + 1).map((f) => ({ value: f.value, litres: asDecimal2(f.litres), full: f.full })));
  return w === null ? null : { from: a.at, to: b.at, rate: w.rate, km: w.km };
}
/** The CAN fuel used on the day, as Ruptela reports it with the card out (a `CARD_OUT` carrying `litres`); null when no
 *  such report has arrived — then the cell says «—», never «0 л». */
function canFuel(c: Ctx, d: Day): string | null {
  return visibleTelemetry(c.w, d.truck.id, c.now)
    .filter((t) => t.kind === 'CARD_OUT' && t.litres !== null && businessDate(t.at) === d.day.date).at(-1)?.litres ?? null;
}
function fuelCell(c: Ctx, d: Day, legs: Leg[]): SummaryCellView {
  const norm = d.truck.norm_l_100;
  const normWords = d.truck.norm_order === null ? '(базова, без коефіцієнтів)' : `(наказ ${d.truck.norm_order})`;
  if (isRc(d.truck)) {
    const km = dayTotals(legs).km;
    const fact = canFuel(c, d);
    const normL = km === null ? null : round(normLitres(km, norm), 1);
    const factL = fact === null ? null : round(fact, 1);
    const dev = factL === null || normL === null || cmp(normL, '0') === 0 ? null : deviation(factL, normL);
    return { label: 'Пальне', value: factL === null ? NONE : `${fmtDec(factL)} л`,
      lines: [dot([factL === null ? 'факт (CAN): даних ще немає' : 'факт (CAN)', normL === null ? null : `норма ${fmtDec(normL)} л`,
        factL === null || normL === null || dev === null ? null : `${signed(sub(factL, normL, 1))} л (${fmtPct(dev)})`])],
      hold_lines: overTolerance(dev) ? [OVER_TOLERANCE] : [], simulated: true };
  }
  const win = lastWindow(fillsUntil(c, d, d.day.date));
  const dev = win === null ? null : deviation(win.rate, norm);
  const span = win === null ? null : `від повного до повного ${fmtDayMonth(win.from)} → ${fmtDayMonth(win.to)}`;
  const lines = filed(c, d.day)
    ? [dot([span, win === null ? `норма ${fmtRate(norm)} (базова)` : `${fmtRate(win.rate)} л/100 проти ${fmtRate(norm)} (базова)`])]
    : [dot([span, win === null ? null : `${fmtKm(win.km)} км`, `проти норми ${fmtRate(norm)} ${normWords}`,
      dev === null ? null : fmtPct(dev)])];
  return { label: 'Пальне', value: win === null ? NONE : `${fmtRate(win.rate)} л/100`, lines,
    hold_lines: [REGIS_REMAINS, ...(overTolerance(dev) ? [OVER_TOLERANCE] : [])], simulated: false };
}

/** R+C: the tachograph card's day split — керування, інша робота (standing at places and on the road) and перерва —
 *  from Ruptela's card in/out, IN/OUT and BREAK, and the day's road stops. Null until the card is out. */
function tachoLine(c: Ctx, d: Day): string | null {
  const tel = visibleTelemetry(c.w, d.truck.id, c.now).filter((t) => businessDate(t.at) === d.day.date);
  const cardIn = tel.find((t) => t.kind === 'CARD_IN') ?? null;
  const cardOut = tel.filter((t) => t.kind === 'CARD_OUT').at(-1) ?? null;
  if (cardIn === null) return null;
  if (cardOut === null) return `тахограф: картка з ${fmtTime(cardIn.at)}`;
  const span = Math.max(0, minutesBetween(cardIn.at, cardOut.at));
  const pause = tel.reduce((acc, t) => acc + (t.kind === 'BREAK' ? t.minutes ?? 0 : 0), 0);
  const outAfter = (at: Instant): Instant => tel.find((t) => t.kind === 'OUT' && atOrBefore(at, t.at))?.at ?? cardOut.at;
  const atPlaces = [cardIn.at, ...tel.filter((t) => t.kind === 'IN').map((t) => t.at)]
    .reduce((acc, at) => acc + Math.max(0, minutesBetween(at, outAfter(at))), 0);
  const onRoad = d.shifts.reduce((acc, s) => acc + Object.values(roadStopMinutes(c.w, s.id, c.now)).reduce((x, y) => x + y, 0), 0);
  const other = atPlaces + onRoad;
  const driving = Math.max(0, span - pause - other);
  return `тахограф: керування ${fmtDur(driving)} · інша робота ${fmtDur(other)} · перерва ${fmtDur(pause)}`;
}
function timeCell(c: Ctx, d: Day, stops: StopFacts[], legs: Leg[]): SummaryCellView {
  const ends = d.shifts.map((s) => shiftEnd(d, s, c.now));
  const span = d.shifts.reduce((acc, s, i) => acc + shiftMinutes({ ...s, ended_at: ends[i] ?? null }, c.now), 0);
  const onSite = onSiteMinutes(stops.filter((f) => f.stop.kind !== 'BASE'));
  const marks = legs.flatMap((l) => {
    const mark = l.arrival_driver === null ? null : wallOn(businessDate(l.arrival_driver), l.arrival_ttn);
    return mark === null || l.arrival_driver === null ? [] : [Math.max(0, minutesBetween(l.arrival_driver, mark))];
  });
  const road = Object.fromEntries(ROAD_STOP_REASONS.map((r) => [r, 0])) as Record<RoadStopReason, number>;
  for (const s of d.shifts) {
    const m = roadStopMinutes(c.w, s.id, c.now);
    for (const r of ROAD_STOP_REASONS) road[r] += m[r];
  }
  const onSitePart = `на точках ${fmtDur(onSite)}${marks.length === 0 ? '' : ` (до відмітки в ТТН ${fmtDur(marks.reduce((a, b) => a + b, 0))})`}`;
  const roadParts = ROAD_STOP_REASONS.filter((r) => gt(road[r], 0)).map((r) => `${ROAD_WORD[r]} ${fmtDur(road[r])}`);
  const rc = isRc(d.truck);
  const tacho = rc ? tachoLine(c, d) : REGIS_TACHO;
  const first = d.shifts[0]?.started_at ?? null;
  const last = ends.at(-1) ?? null;
  if (filed(c, d.day)) {
    return { label: 'На зміні', value: first === null ? NONE : `${fmtTime(first)}–${last === null ? NONE : fmtTime(last)}`,
      lines: rc ? [dot([`на зміні ${fmtDur(span)}`, onSitePart, ...roadParts]), ...(tacho === null ? [] : [tacho])]
        : [dot([`на зміні ${fmtDur(span)}`, onSitePart, ...roadParts, tacho])],
      hold_lines: [], simulated: rc };
  }
  return { label: 'На зміні', value: d.shifts.length === 0 ? NONE : fmtDur(span),
    lines: rc ? [dot([onSitePart, ...roadParts]), ...(tacho === null ? [] : [tacho])] : [dot([onSitePart, ...roadParts, tacho])],
    hold_lines: [], simulated: rc };
}

/** «ТТН 2 · підписані 2 з 2» over «чеки 1 · оригінали 0 з 2 · водій підтвердив 16:03», and the paper trail once
 *  confirmed. «водій не підтвердив» is a hold line. */
function documentsCell(c: Ctx, d: Day, stops: StopFacts[]): SummaryCellView {
  const recordByKey = (key: string | null) => (key === null ? undefined : c.known.find((r) => r.key === key));
  let ttn = 0;
  let signedGot = 0;
  let signedAll = 0;
  const nos: string[] = [];
  for (const f of stops) {
    const kind = kindOf(f.stop);
    const done = recordByKey(f.completion_key);
    if (kind === 'LOADING' && done?.type === 'LOADED') {
      ttn += done.payload.ttn_count;
      const own = f.stop.ttn_nos.length !== 0 ? f.stop.ttn_nos : c.w.ttnDocs.filter((x) => x.loading_stop_id === f.stop.id).map((x) => x.no);
      nos.push(...own.filter((no) => !nos.includes(no)));
    }
    if (kind === 'DROP') {
      const dropNos = f.stop.ttn_nos.length !== 0 ? f.stop.ttn_nos : c.w.ttnDocs.filter((x) => x.drop_stop_id === f.stop.id);
      const n = Math.max(dropNos.length, 1);
      signedAll += n;
      if (done?.type !== 'UNLOADED') continue;
      const got = new Set(f.pages.filter((p) => p.artefact === 'TTN_SIGNED' && received(p, c.now)).map((p) => `${p.doc_index}:${p.page_no}`)).size;
      signedGot += Math.min(got, n);
    }
  }
  const refuels = d.records.filter((r) => r.type === 'REFUEL');
  const receipts = refuels.filter((r) => c.w.pages.some((p) => p.record_key === r.key && p.artefact === 'RECEIPT' && received(p, c.now))).length;
  const originals = nos.filter((no) => {
    const original = c.w.ttnDocs.find((x) => x.no === no)?.original ?? null;
    return original !== null && atOrBefore(original.received_at, c.now);
  }).length;
  const attested = attestedAt(d, c.now);
  const trail = paperTrail(c, d.day);
  return { label: 'Документи', value: `ТТН ${ttn} · підписані ${signedGot} з ${signedAll}`,
    lines: [dot([`чеки ${receipts}`, `оригінали ${originals} з ${nos.length}`, attested === null ? null : `водій підтвердив ${fmtTime(attested)}`]),
      ...(trail === null ? [] : [trail])],
    hold_lines: attested === null ? ['водій не підтвердив'] : [], simulated: false };
}
/** «підтверджено Н. Шевчук 18.09 17:05 · надруковано · водій підписав 17:10». */
function paperTrail(c: Ctx, day: TruckDay): string | null {
  if (day.status !== 'CONFIRMED' || day.confirmed_at === null) return null;
  const by = day.confirmed_by === null ? null : userShort(c.w, day.confirmed_by);
  return dot([`підтверджено ${whoWhen(by, day.confirmed_at)}`,
    day.printed_at !== null && atOrBefore(day.printed_at, c.now) ? 'надруковано' : null,
    day.signed_at !== null && atOrBefore(day.signed_at, c.now) ? `водій підписав ${fmtTime(day.signed_at)}` : null]);
}

/* ── the chronology ─────────────────────────────────────────────────────── */

type Row = TimelineRow;
/** The «Місце» of a row (§4.2 C-09), or null where a row HAS no place — `placeName` answers «Нове місце» for an
 *  unknown id, which is right for an arrival and wrong for a tachograph break. */
const placeOf = (w: World, id: string | null): string | null => (placeById(w, id) === null ? null : placeName(w, id));
const point = (p: OdometerPoint | null): Row['odometer'] => {
  const source = p === null ? null : SOURCE_OF[p.source];
  return p === null || p.value === null || source === null ? null : { value: p.value, source };
};
/** The drawn thumbs of a record: its received pages, each replaced by the newest received retake of it. */
function thumbs(c: Ctx, key: string): string[] {
  const latest = (p: Page): Page => {
    let cur = p;
    for (let hop = 0; hop !== 8 && cur.superseded_by !== null; hop += 1) {
      const next = c.w.pages.find((x) => x.key === cur.superseded_by);
      if (next === undefined || !received(next, c.now)) break;
      cur = next;
    }
    return cur;
  };
  return c.w.pages.filter((p) => p.record_key === key && received(p, c.now))
    .map(latest).flatMap((p) => (p.drawn === null ? [] : [p.drawn.variant]));
}
const deferredWords = (d: 'AT_PARKING' | 'AFTER_EXIT'): string => (d === 'AT_PARKING' ? 'фото на стоянці' : 'фото після виїзду');

function recordRow(c: Ctx, d: Day, r: DriverRecord, stops: StopFacts[], legs: Leg[]): Row | null {
  const stop = r.stop_id === null ? null : stops.find((f) => f.stop.id === r.stop_id) ?? null;
  const base = { to: null, source: 'DRIVER' as const, odometer: point(reading(d, r)), thumbs: thumbs(c, r.key),
    simulated: false, example: false, place_short: placeOf(c.w, stop?.place.id ?? r.place_id) };
  switch (r.type) {
    case 'SHIFT_START':
      return { ...base, at: r.occurred_at, place_short: placeName(c.w, r.place_id ?? baseId(c.w)),
        event: `Зміну почато · ${placeName(c.w, r.place_id ?? baseId(c.w))}` };
    case 'SHIFT_END':
      return { ...base, at: r.occurred_at, place_short: placeName(c.w, r.place_id ?? r.payload.place_id ?? baseId(c.w)),
        event: `Зміну закінчено · ${placeName(c.w, r.place_id ?? r.payload.place_id ?? baseId(c.w))}` };
    case 'ARRIVED': {
      const place = placeById(c.w, stop?.place.id ?? r.place_id);
      const chip = r.payload.chip === null ? null : DC.segments[r.payload.chip];
      return { ...base, at: r.occurred_at, place_short: place === null ? 'Нове місце' : place.short,
        event: dot([`На місці: ${place === null ? 'Нове місце' : place.short}`, chip,
          place?.no_photos ? 'фото на фермі заборонені' : null]) };
    }
    case 'LOADED': {
      const p = r.payload;
      const pages = stop === null ? 0
        : new Set(stop.pages.filter((x) => (x.artefact === 'TTN_FRONT' || x.artefact === 'TTN_BACK') && received(x, c.now))
          .map((x) => `${x.doc_index}:${x.page_no}`)).size;
      const what = p.ttn_count === 0 ? 'Завантажено' : `Завантажено · ${p.ttn_count} ТТН${pages === 0 ? '' : `, ${pages} стор.`}`;
      const arrived = stop?.arrived_at ?? null;
      const leg = arrived === null ? undefined : legs.find((l) => l.arrival_driver === arrived);
      const mark = arrived === null || leg === undefined ? null : wallOn(businessDate(arrived), leg.arrival_ttn);
      const toMark = arrived === null || mark === null ? null : `до відмітки ${fmtDur(Math.max(0, minutesBetween(arrived, mark)))}`;
      return { ...base, at: r.occurred_at, event: dot([what, p.deferred === null ? null : deferredWords(p.deferred),
        p.no_doc_reason === null ? null : 'без документа', toMark]) };
    }
    case 'UNLOADED': {
      const p = r.payload;
      const index = p.drop_index ?? stop?.stop.drop_index ?? null;
      const count = stop?.stop.drop_count ?? null;
      const nos = stop?.stop.ttn_nos ?? [];
      const signedWords = nos.length === 0 ? 'ТТН підписана' : `ТТН ${nos.join(', ')} ${nos.length === 1 ? 'підписана' : 'підписані'}`;
      return { ...base, at: r.occurred_at, event: dot([index !== null && count !== null ? `Вивантажено ${index} з ${count}` : 'Вивантажено',
        p.deferred !== null ? deferredWords(p.deferred) : p.no_doc_reason !== null ? 'без документа' : signedWords]) };
    }
    case 'STOP_LEFT':
      return { ...base, at: r.occurred_at, event: dot(['Поїхав далі', stop === null ? null : stop.place.short]) };
    case 'REFUEL': {
      const p = r.payload;
      const statement = c.w.statements.find((s) => s.matched_record_key === r.key) ?? null;
      const litres = statement !== null ? `${fmtDec(statement.litres)} л (за випискою)`
        : p.sum_uah === null ? null : `${fmtDec(receiptLitres(p.sum_uah))} л (${RECEIPT_WORDS})`;
      return { ...base, at: r.occurred_at, event: dot(['Заправка', p.station, litres, p.full_tank ? 'бак повний' : null]) };
    }
    case 'ROAD_STOP': {
      const end = roadStopEnd(c, d, r);
      const minutes = end === null ? null : Math.max(0, minutesBetween(r.occurred_at, end));
      return { ...base, at: r.occurred_at, to: end, event: dot([`Стою: ${DC.roadStops[r.payload.reason]}`,
        minutes === null ? null : fmtDur(minutes)]) };
    }
    case 'DOCS_ADDED': {
      const o = r.payload.odometer;
      const shot = c.w.pages.filter((p) => p.record_key === r.key).map((p) => p.captured_at).sort(cmpInstant)[0] ?? r.occurred_at;
      const where = r.payload.deferred === 'AT_PARKING' ? 'на стоянці' : 'після виїзду';
      const read = o === null || o.read === null || o.value === null || o.read === o.value ? null
        : dot([`прочитано ${fmtKm(o.read)}`, o.expected === null ? null
          : `${o.basis === 'PLANNED_KM' ? 'за планом' : 'очікували'} ~${fmtKm(o.expected)}`, `водій вибрав ${fmtKm(o.value)}`]);
      return { ...base, at: shot, event: dot([`Фото додано ${where}`, read]) };
    }
    case 'DRIVER_ATTESTED': {
      const shiftId = r.payload.shift_id ?? r.shift_id;
      const shift = d.shifts.find((s) => s.id === shiftId) ?? null;
      const end = shift === null ? null : shiftEnd(d, shift, c.now);
      return { ...base, at: r.occurred_at, event: dot(['Водій підтвердив: '
        + dot([shift === null ? null : `зміна ${fmtTime(shift.started_at)}–${end === null ? NONE : fmtTime(end)}`,
          r.payload.km === null ? null : `${fmtKm(r.payload.km)} км`, `документів ${r.payload.documents}`])]) };
    }
    default:
      return null;
  }
}
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
/** When a road stop ended: the driver's «Закінчилось» (the time he picked), else — on R+C — the first motion after it. */
function roadStopEnd(c: Ctx, d: Day, r: RecordOf<'ROAD_STOP'>): Instant | null {
  const end = d.records.find((x): x is RecordOf<'ROAD_STOP_END'> => x.type === 'ROAD_STOP_END' && x.payload.road_stop_key === r.key)
    ?? c.known.find((x): x is RecordOf<'ROAD_STOP_END'> => x.type === 'ROAD_STOP_END' && x.payload.road_stop_key === r.key);
  if (end !== undefined) return INSTANT.test(end.payload.at) ? end.payload.at as Instant : end.occurred_at;
  if (!isRc(d.truck)) return null;
  return visibleTelemetry(c.w, d.truck.id, c.now).find((t) => t.kind === 'MOTION' && gt(cmpInstant(t.at, r.occurred_at), 0))?.at ?? null;
}

/** The office's ТТН marks, one row per stop: «Прибуття за ТТН · введено з фото: Н. Шевчук» at a loading, «ТТН
 *  пред'явлено (відмітка одержувача)» at a drop — each once the office has typed it. */
function markRows(c: Ctx, stops: StopFacts[]): Row[] {
  return stops.flatMap((f): Row[] => {
    const kind = kindOf(f.stop);
    if (kind !== 'LOADING' && kind !== 'DROP') return [];
    const drop = kind === 'DROP';
    const docs = c.w.ttnDocs.filter((x) => (drop ? x.drop_stop_id : x.loading_stop_id) === f.stop.id)
      .sort((a, b) => cmpNum(a.doc_index, b.doc_index));
    const field = docs.map((x) => (drop ? x.fields.drop_arrival : x.fields.arrival))
      .find((v) => v !== null && atOrBefore(v.at, c.now)) ?? null;
    const date = f.arrived_at === null ? null : businessDate(f.arrived_at);
    const at = field === null || date === null ? null : wallOn(date, field.value);
    if (field === null || at === null) return [];
    const who = field.source === 'OFFICE_TYPED' ? `введено з фото: ${userShort(c.w, field.by)}`
      : field.source === 'OCR' ? `OCR · ${userShort(c.w, field.by)}` : null;
    return [{ at, to: null, source: 'TTN', event: drop ? 'ТТН пред\'явлено (відмітка одержувача)' : dot(['Прибуття за ТТН', who]),
      place_short: f.place.short, odometer: null, thumbs: [], simulated: false, example: false }];
  });
}

/** Ruptela and the tachograph on an R+C truck (simulated): «Дніпро-Корм IN» with CAN, «заправка +196 л (ДУТ)»,
 *  «Перерва 45 хв (13:05–13:50)», the card in and out. Motion itself is not an event. */
function telemetryRows(c: Ctx, d: Day): Row[] {
  if (d.truck.telematics !== 'RUPTELA') return [];
  return visibleTelemetry(c.w, d.truck.id, c.now).filter((t) => businessDate(t.at) === d.day.date).flatMap((t): Row[] => {
    const odometer = t.can_km === null ? null : { value: t.can_km, source: 'CAN' as const };
    const row = (source: SourceKey, event: string, to: Instant | null = null): Row[] =>
      [{ at: t.at, to, source, event, place_short: placeOf(c.w, t.place_id), odometer, thumbs: [],
        simulated: true, example: false }];
    const label = placeById(c.w, t.place_id)?.label ?? null;
    switch (t.kind) {
      case 'IN': return row('RUPTELA', `${label ?? NONE} IN`);
      case 'OUT': return row('RUPTELA', `${label ?? NONE} OUT`);
      case 'REFUEL': return row('RUPTELA', `заправка +${t.litres === null ? NONE : fmtDec(round(t.litres, 0))} л (ДУТ)`);
      case 'DRAIN': return row('RUPTELA', `злив ${MINUS}${t.litres === null ? NONE : fmtDec(round(t.litres, 0))} л (ДУТ)`);
      case 'BREAK': return row('TACHO', `Перерва ${fmtDur(t.minutes ?? 0)}${t.until === null ? '' : ` (${fmtTime(t.at)}–${fmtTime(t.until)})`}`, t.until);
      case 'CARD_IN': return row('TACHO', 'Картку вставлено');
      case 'CARD_OUT': return row('TACHO', 'Картку вийнято');
      default: return [];
    }
  });
}

function timeline(c: Ctx, d: Day, stops: StopFacts[], legs: Leg[]): Row[] {
  const rows = [
    ...d.records.filter((r) => TIMELINE_TYPES.includes(r.type)).flatMap((r) => recordRow(c, d, r, stops, legs) ?? []),
    ...markRows(c, stops),
    ...telemetryRows(c, d),
  ];
  // Stable: rows of one minute keep the order above (records by their own order, then the marks, then telemetry).
  return rows.sort((a, b) => cmpInstant(a.at, b.at));
}

/* ── legs, flags, history, badges ───────────────────────────────────────── */

const legRow = (w: World, l: Leg): LegRow => ({ n: l.n, from: placeLabel(w, l.from_place_id), to: placeLabel(w, l.to_place_id),
  loaded: l.loaded, km: l.km, mass: l.mass, tkm: l.tkm, ttn: [...l.ttn_nos], arrival_driver: l.arrival_driver,
  arrival_ttn: l.arrival_ttn, original: l.original_received ? 'RECEIVED' : 'NONE' });

type Flag = TruckDayView['flags'][number];
function flagOf(item: ExceptionItem): Flag {
  const title = dot([item.title, item.evidence?.kind === 'line' ? item.evidence.text : null]);
  const r = item.resolved;
  if (r === null) return { id: item.id, title, state: OPEN_FLAG, tone: 'hold' };
  const when = `${r.by} ${fmtTime(r.at)}`;
  const state = r.correction !== null
    ? `виправлено: ${fmtDec(r.correction.old)} → ${fmtDec(r.correction.new)} · ${dot([r.reason, when])}`
    : `з'ясовано: ${dot([r.reason, when])}`;
  return { id: item.id, title, state, tone: 'plain' };
}
const flagsOf = (c: Ctx, dayId: string): Flag[] => (c.flags.get(dayId) ?? []).map(flagOf);
const openCount = (c: Ctx, dayId: string): number => (c.flags.get(dayId) ?? []).filter((i) => i.resolved === null).length;

/** An audit row's words: its detail when the action is a code (`ACCEPT_STOP`, `CONFIRM_DAY`), else the action. */
const auditText = (a: Audit): string => (/^[A-Z_]+$/.test(a.action) && a.detail !== '' ? a.detail : a.action);
/** The audit of the day, newest first, with the confirmation, the print and the signature the seed carries as stamps
 *  where no audit row tells of them. */
function historyOf(c: Ctx, d: Day): TruckDayView['history'] {
  const { day } = d;
  const rows = c.w.audit.filter((a) => a.truck_day_id === day.id && atOrBefore(a.at, c.now))
    .map((a) => ({ at: a.at, by: userShort(c.w, a.actor_id), text: auditText(a) }));
  const told = (prefix: string): boolean => rows.some((r) => r.text.startsWith(prefix));
  const confirmer = day.confirmed_by === null ? NONE : userShort(c.w, day.confirmed_by);
  if (day.status === 'CONFIRMED' && day.confirmed_at !== null && !told(CONFIRM_PREFIX)) {
    rows.push({ at: day.confirmed_at, by: confirmer, text: confirmAction(day.version) });
  }
  if (day.printed_at !== null && atOrBefore(day.printed_at, c.now) && !told(PRINT_ACTION)) {
    rows.push({ at: day.printed_at, by: confirmer, text: PRINT_ACTION });
  }
  if (day.signed_at !== null && atOrBefore(day.signed_at, c.now)) {
    const driver = c.w.drivers.find((x) => x.id === day.driver_id);
    rows.push({ at: day.signed_at, by: driver?.short_name ?? NONE, text: 'Водій підписав подорожній лист' });
  }
  // Newest first; rows of one minute keep their order reversed too (the print after the confirmation it followed).
  return rows.map((r, i) => ({ r, i })).sort((a, b) => cmpInstant(b.r.at, a.r.at) || cmpNum(b.i, a.i)).map((x) => x.r);
}

/** Day badges (never inbox items): a phone clock off the server's, and GPS the phone called unreliable. */
function badgesOf(d: Day): string[] {
  const out: string[] = [];
  const skewed = d.records.find((r) => !between(minutesBetween(r.committed_at, r.app_clock_at), -CLOCK_BADGE_MIN, CLOCK_BADGE_MIN));
  if (skewed !== undefined) {
    const m = minutesBetween(skewed.committed_at, skewed.app_clock_at);
    out.push(`годинник ${lt(m, 0) ? `${MINUS}${-m}` : `+${m}`} хв з ${fmtTime(skewed.committed_at)}`);
  }
  const gps = d.records.filter((r) => r.gps === 'UNRELIABLE');
  const a = gps[0];
  const b = gps.at(-1);
  if (a !== undefined && b !== undefined) out.push(`GPS недостовірний ${fmtTime(a.occurred_at)}–${fmtTime(b.occurred_at)}`);
  return out;
}

/* ── requisites and the printed sheet ───────────────────────────────────── */

type Requisite = TruckDayView['requisites'][number];
const req = (key: string, label: string, value: string, plate: string | null = null, note: string | null = null): Requisite =>
  ({ key, label, value, plate, note });
function requisites(c: Ctx, day: TruckDay, truck: Truck, times: { from: Instant | null; to: Instant | null }): Requisite[] {
  const w = c.w;
  const trailer = w.trailers.find((t) => t.id === truck.trailer_id) ?? null;
  const driver = w.drivers.find((x) => x.id === day.driver_id) ?? null;
  const driverName = day.figures?.driver_short ?? driver?.short_name ?? null;
  const issuer = userOf(w, truck.dispatcher_id);
  const mechanic = w.officeUsers.find((u) => u.role === 'MECHANIC') ?? null;
  const temp = (at: Instant | null): string => {
    const t = at === null ? undefined : TEMPERATURE_BY_HOUR[kyivParts(at).h];
    return t === undefined ? NONE : `${celsius(t)} °C`;
  };
  const trips = w.trips.filter((t) => t.truck_id === truck.id && t.date === day.date).map((t) => t.no).sort(byCodepoint);
  return [
    req('company', 'ПІДПРИЄМСТВО', COMPANY),
    req('truck', 'АВТОМОБІЛЬ', `${truck.model} · ${OC.badge[badgeOf(truck)]}`, truck.plate),
    req('trailer', 'ПРИЧІП', trailer === null ? NONE : `${trailer.plate} · ${trailer.body_label}`),
    req('driver', 'ВОДІЙ', driverName === null ? NONE : dot([driverName, driver === null ? null : `таб. № ${driver.tab_no}`])),
    req('issued', 'ВИДАВ', issuer === null ? NONE : `${ROLE_WORD[issuer.role]} ${issuer.short_name}`),
    req('release', 'ВИПУСК', mechanic === null ? NONE : `${ROLE_WORD[mechanic.role]} ${mechanic.short_name}`),
    req('temperature', 'ТЕМПЕРАТУРА', `виїзд ${temp(times.from)} · повернення ${temp(times.to)}`, null, WEATHER_NOTE),
    req('trip', 'РЕЙС', trips.length === 0 ? NONE : trips.join(', ')),
  ];
}

/** The C-09 sheet, top to bottom: the company line, the title, «від …», the run, the fuel, time and documents lines of
 *  C-08, who it was built from, the signature line and the footer. The requisites and the «Рух і одометр» table are the
 *  view's `requisites` and `timeline`. */
function printLines(c: Ctx, day: TruckDay, driverShort: string, legsTotal: ReturnType<typeof dayTotals>,
  summary: TruckDayView['summary']): string[] {
  const cellLine = (cell: SummaryCellView): string => `${cell.label}: ${dot([cell.value, ...cell.lines, ...cell.hold_lines])}`;
  const confirmer = day.confirmed_by === null ? null : userShort(c.w, day.confirmed_by);
  const built = day.status === 'CONFIRMED' && day.confirmed_at !== null
    ? `Сформовано з записів водія · підтвердила ${whoWhen(confirmer, day.confirmed_at)}`
    : 'Сформовано з записів водія · не підтверджено';
  return [
    `${COMPANY} · ${COMPANY_TOWN}`,
    day.waybill_no === null ? SHEET_TITLE : `${SHEET_TITLE} № ${day.waybill_no}`,
    `від ${fmtDate(day.date)}`,
    `Пробіг: ${fmtKm(legsTotal.km)} км (з вантажем ${fmtKm(legsTotal.loaded)}, порожній ${fmtKm(legsTotal.empty)})`,
    cellLine(summary.fuel),
    cellLine(summary.time),
    cellLine(summary.documents),
    built,
    `Водій: ${driverShort} ________   Диспетчер ________   Механік ________`,
    DRAFT_LINE,
  ];
}

function consequenceOf(c: Ctx, day: TruckDay, open: number): string {
  if (day.status === 'CONFIRMED' && day.confirmed_at !== null) {
    const by = day.confirmed_by === null ? null : userShort(c.w, day.confirmed_by);
    return `Підтверджено ${whoWhen(by, day.confirmed_at)}`;
  }
  return open === 0 ? NO_FLAGS : `${open} ${plural(open, FLAG_FORMS)} ${WITH_FLAGS}`;
}

function dayHeader(c: Ctx, day: TruckDay, truck: Truck): TruckDayView['day'] {
  return { id: day.id, date: day.date, status: truckDayStatus(c.w, day.id), waybill_no: day.waybill_no, version: day.version,
    confirmed: day.status === 'CONFIRMED' && day.confirmed_at !== null
      ? { by: day.confirmed_by === null ? NONE : userShort(c.w, day.confirmed_by), at: day.confirmed_at } : null,
    printed_at: day.printed_at, signed_at: day.signed_at, example: day.example, truck_plate: truck.plate, badge: badgeOf(truck) };
}

/* ── an example day, from its figures ───────────────────────────────────── */

/** The fleet board's odometer for an example truck when its day ended (§7.6 «16:05»), as the BAS sheet reads it. */
const boardOdometer = (w: World, truckId: string): Km | null =>
  w.exampleBoard.find((b) => b.truck_id === truckId)?.odometer?.value ?? null;
/** Its legs from the totals alone, dealt out exactly as the BAS «Ділянки» sheet deals them (export.ts): the last leg is
 *  the empty run home, the one before it the loaded run, the other empty km shared out, the remainder on the last. */
function exampleLegs(f: ExampleDayFigures): LegRow[] {
  const leg = (n: number, loaded: boolean, km: Km): LegRow => ({ n, from: NONE, to: NONE, loaded, km, mass: null, tkm: null,
    ttn: [], arrival_driver: null, arrival_ttn: null, original: 'NONE' });
  if (!gt(f.legs, 0)) return [];
  if (f.legs === 1) return [leg(1, true, f.km)];
  const empty = gt(f.km, f.km_loaded) ? f.km - f.km_loaded : 0;
  const share = intDiv(empty, f.legs - 1);
  let left = empty;
  let seen = 0;
  return Array.from({ length: f.legs }, (_, i) => {
    if (i === f.legs - 2) return leg(i + 1, true, f.km - empty);
    seen += 1;
    const km = seen === f.legs - 1 ? left : share;
    left -= km;
    return leg(i + 1, false, km);
  });
}
function exampleView(c: Ctx, day: TruckDay, truck: Truck, f: ExampleDayFigures): TruckDayView {
  const driver = c.w.drivers.find((x) => x.id === day.driver_id) ?? null;
  const end = boardOdometer(c.w, truck.id);
  const start = end === null ? null : end - f.km;
  const empty = gt(f.km, f.km_loaded) ? f.km - f.km_loaded : 0;
  const shift = Math.max(0, minutesBetween(f.from, f.to));
  const summary: TruckDayView['summary'] = {
    odometer: { label: 'Одометр', value: end === null ? NONE : `${fmtKm(start)} → ${fmtKm(end)}`,
      lines: [dot([`${fmtKm(f.km)} км`, `з вантажем ${fmtKm(f.km_loaded)}`, `порожній ${fmtKm(empty)}`])], hold_lines: [], simulated: false },
    fuel: { label: 'Пальне', value: f.fuel_l === null ? NONE : `${fmtDec(f.fuel_l)} л`,
      lines: [f.refuels === 0 ? 'заправок не було' : dot([`заправок ${f.refuels}`, 'OCR чека'])], hold_lines: [], simulated: false },
    time: { label: 'На зміні', value: fmtDur(shift), lines: [`${fmtTime(f.from)}–${fmtTime(f.to)}`], hold_lines: [], simulated: false },
    documents: { label: 'Документи', value: f.docs, lines: [dot([`ділянок ${f.legs}`, `чеків ${f.refuels}`])],
      hold_lines: [], simulated: false },
  };
  const trail = paperTrail(c, day);
  if (trail !== null) summary.documents.lines.push(trail);
  const onApp = driver?.mode === 'APP';
  const base = baseId(c.w);
  const row = (at: Instant, source: SourceKey, event: string, place: string | null = null): TimelineRow =>
    ({ at, to: null, source, event, place_short: place, odometer: null, thumbs: [], simulated: false, example: true });
  const call = f.call_entry === null ? []
    : [row(f.call_entry.at, 'FROM_CALL', `зі слів водія · дзвінок ${fmtTime(f.call_entry.at)} · ${f.call_entry.by_short}`)];
  const rows = onApp ? [row(f.from, 'DRIVER', `Зміну почато · ${placeName(c.w, base)}`, placeName(c.w, base)), ...call,
    row(f.to, 'DRIVER', `Зміну закінчено · ${placeName(c.w, base)}`, placeName(c.w, base))] : call;
  const open = openCount(c, day.id);
  const totals = { km: f.km, loaded: f.km_loaded, empty, tkm: null };
  return {
    day: dayHeader(c, day, truck), requisites: requisites(c, day, truck, { from: f.from, to: f.to }), summary,
    timeline: rows.sort((a, b) => cmpInstant(a.at, b.at)), legs: exampleLegs(f),
    fuel_block: [summary.fuel.value, ...summary.fuel.lines], flags: flagsOf(c, day.id), history: historyOf(c, dayOf(c, day, truck)),
    badges: [], version: day.version, driver_attested_at: onApp ? f.to : null, flags_open: open,
    consequence: consequenceOf(c, day, open), print_lines: printLines(c, day, f.driver_short, totals, summary),
  };
}

/* ── the public face (I-12) ─────────────────────────────────────────────── */

function view(c: Ctx, day: TruckDay): TruckDayView | null {
  const truck = c.w.trucks.find((t) => t.id === day.truck_id);
  if (truck === undefined) return null;
  if (day.figures !== null) return exampleView(c, day, truck, day.figures);
  const d = dayOf(c, day, truck);
  const stops = stopsOfDay(c.w, day.id, c.now);
  const legs = legsOfDay(c.w, day.id, c.now);
  const summary = { odometer: odometerCell(c, d, legs), fuel: fuelCell(c, d, legs), time: timeCell(c, d, stops, legs),
    documents: documentsCell(c, d, stops) };
  const refuels = d.records.filter((r): r is RecordOf<'REFUEL'> => r.type === 'REFUEL').map((r) => {
    const p = r.payload;
    const statement = c.w.statements.find((s) => s.matched_record_key === r.key) ?? null;
    const litres = statement !== null ? `${fmtDec(statement.litres)} л` : p.sum_uah === null ? null : `${fmtDec(receiptLitres(p.sum_uah))} л`;
    return dot([`Заправка ${fmtTime(r.occurred_at)}`, p.station, p.receipt_no === null ? null : `чек ${p.receipt_no}`,
      p.rro_no === null ? null : `ФН РРО ${p.rro_no}`, litres, statement !== null ? 'за випискою картки' : litres === null ? null : 'OCR чека',
      statement !== null || litres === null ? null : 'не звірено з випискою',
      p.card_mask === null ? null : `спосіб: картка ${p.card_mask} (з чека)`, p.full_tank ? 'бак повний (водій)' : 'бак не повний (водій)']);
  });
  const ruptelaFills = telemetryRows(c, d).filter((r) => r.event.startsWith('заправка')).map((r) => `Ruptela · ${fmtTime(r.at)} · ${r.event}`);
  const driver = c.w.drivers.find((x) => x.id === day.driver_id) ?? null;
  const open = openCount(c, day.id);
  const ends = d.shifts.map((s) => shiftEnd(d, s, c.now));
  return {
    day: dayHeader(c, day, truck),
    requisites: requisites(c, day, truck, { from: d.shifts[0]?.started_at ?? null, to: ends.at(-1) ?? null }),
    summary,
    timeline: timeline(c, d, stops, legs),
    legs: legs.map((l) => legRow(c.w, l)),
    fuel_block: [summary.fuel.value, ...summary.fuel.lines, ...summary.fuel.hold_lines, ...refuels, ...ruptelaFills],
    flags: flagsOf(c, day.id),
    history: historyOf(c, d),
    badges: badgesOf(d),
    version: day.version,
    driver_attested_at: attestedAt(d, c.now),
    flags_open: open,
    consequence: consequenceOf(c, day, open),
    print_lines: printLines(c, day, driver?.short_name ?? NONE, dayTotals(legs), summary),
  };
}

/** The whole derived waybill of one truck-day (§4.2 C-08, C-09), or null when there is no such day. */
export function truckDayView(w: World, truckDayId: string, now: Instant): TruckDayView | null {
  const day = w.truckDays.find((d) => d.id === truckDayId);
  return day === undefined ? null : view(context(w, now), day);
}

/** C-07's tabs: «На підтвердження» = READY, «Підтверджені» = CONFIRMED and not yet in BAS, «У BAS» = exported. */
function inState(w: World, day: TruckDay, state: 'to-confirm' | 'confirmed' | 'exported'): boolean {
  const status = truckDayStatus(w, day.id);
  if (state === 'to-confirm') return status === 'READY';
  if (state === 'confirmed') return status === 'CONFIRMED' && day.exported === null;
  return day.exported !== null;
}

/** The rows of «Дні на підтвердження» (§4.2 C-07) for one tab, in `scope`, of one date or of every date: newest date
 *  first, then plate order. */
export function truckDayRows(w: World, state: 'to-confirm' | 'confirmed' | 'exported', scope: Scope, date: BusinessDate | null,
  now: Instant): TruckDayRow[] {
  const c = context(w, now);
  const trucks = new Map(w.trucks.filter((t) => scope === 'FLEET' || t.pilot).map((t) => [t.id, t]));
  return w.truckDays.flatMap((day): TruckDayRow[] => {
    const truck = trucks.get(day.truck_id);
    if (truck === undefined || (date !== null && day.date !== date) || !inState(w, day, state)) return [];
    const driver = w.drivers.find((x) => x.id === day.driver_id) ?? null;
    const base = { id: day.id, plate: truck.plate, badge: badgeOf(truck), date: day.date, flags_open: openCount(c, day.id),
      status: truckDayStatus(w, day.id), waybill_no: day.waybill_no, exported_at: day.exported?.at ?? null, example: day.example };
    const f = day.figures;
    if (f !== null) {
      return [{ ...base, driver: f.driver_short, span: { from: f.from, to: f.to }, km: f.km, docs: f.docs,
        attested_at: driver?.mode === 'APP' ? f.to : null }];
    }
    const d = dayOf(c, day, truck);
    const first = d.shifts[0];
    const last = d.shifts.at(-1);
    const docs = docCounts(w, day.id, now);
    return [{ ...base, driver: driver?.short_name ?? NONE,
      span: first === undefined || last === undefined ? null : { from: first.started_at, to: shiftEnd(d, last, now) },
      km: dayTotals(legsOfDay(w, day.id, now)).km, docs: `${docs.in_office} з ${docs.total}`, attested_at: attestedAt(d, now) }];
  }).sort((a, b) => byCodepoint(b.date, a.date) || byCodepoint(a.plate, b.plate) || byCodepoint(a.id, b.id));
}

/** The next number of a waybill series (§7.6): the pilot's «ПЛ-000NNN», or the fleet example's «ПЛ-1NNNNN» for an example
 *  day — the highest issued plus one, so a double confirmation can never draw two. */
export function nextWaybillNo(w: World, example: boolean): string {
  const lo = example ? 100000 : 0;
  const hi = example ? 999999 : 99999;
  const top = w.truckDays.reduce((max, d) => {
    const digits = d.waybill_no === null ? undefined : WAYBILL.exec(d.waybill_no)?.[1];
    const n = digits === undefined ? null : toInt(digits);
    return n === null || !between(n, lo, hi) || !gt(n, max) ? max : n;
  }, lo);
  return `ПЛ-${String(top + 1).padStart(6, '0')}`;
}

/** What changed the day since the version the office looked at (§7.5 DAY_CHANGED ctx): the newest office audit row of
 *  the day that changed its data (a confirmation, a print or a retake request moves no version, so it is never the
 *  answer — MOVES_NO_VERSION), or the newest driver record the server received for it. */
export function lastChange(w: World, truckDayId: string, now: Instant): { by: string; at: Instant; change: string } {
  const audit = w.audit.filter((a) => a.truck_day_id === truckDayId && atOrBefore(a.at, now)
    && !MOVES_NO_VERSION.includes(a.action) && !auditText(a).startsWith(CONFIRM_PREFIX)
    && auditText(a) !== PRINT_ACTION)
    .sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id)).at(-1) ?? null;
  const rec = liveRecords(w).filter((r) => r.truck_day_id === truckDayId && atOrBefore(r.received_at, now))
    .sort((a, b) => cmpInstant(a.received_at, b.received_at) || byCodepoint(a.key, b.key)).at(-1) ?? null;
  if (rec !== null && (audit === null || gt(cmpInstant(rec.received_at, audit.at), 0))) {
    const driver = w.drivers.find((x) => x.id === rec.driver_id);
    return { by: driver?.short_name ?? NONE, at: rec.received_at, change: `новий запис водія о ${fmtTime(rec.occurred_at)}` };
  }
  if (audit !== null) return { by: userShort(w, audit.actor_id), at: audit.at, change: lowerFirst(auditText(audit)) };
  return { by: NONE, at: now, change: 'день змінено' };
}
