// mocks/driver-report/src/domain/views/reports.ts
/** The office's reports (§4.2 C-10 … C-16, §7.4 operations 22–32): key points per visit, the «В BAS» preview and its
 *  files, the per-truck month and its fuel page, the paper chase, shift lengths beside the tachograph, and the drivers
 *  with their phones. Pure functions over a `World` snapshot; `src/api/handlers/reports.ts` only stores what these
 *  return.
 *
 *  Everything is time-gated to `now` where the rows carry a moment: a record once received, a code once shown, a
 *  statement line once it happened. Unknown is «—», never 0 (§8.6 #7). Every litre, hryvnia, rate and percentage goes
 *  through @agency/dec; kilometres, minutes and counts through ../num. No ПДВ figure exists anywhere (§4.2 C-13,
 *  [02 UC-A02]): without a norm наказ there is a deviation and a hold, nothing more. */
import { cmp, div, gt as decGt, mul, round, sub, sum } from '@agency/dec';
import { asBusinessDate, byCodepoint, type BusinessDate, type Instant } from '@agency/mock';
import { fmtDateTime, fmtDayMonth, fmtDec, fmtDur, fmtKm, fmtPct, fmtRate, fmtTime, NBSP, pluralN } from '../../app/format';
import { addDays, atOrBefore, businessDate, cmpInstant, daysBetween, isBefore } from '../clock';
import { stopFacts, stopsOfDay, truckDayIdFor, truckDayStatus, type StopFacts } from '../derive';
import type { Badge, DriverRow, ExportFile, ExportPreview, ImportResult, KeyPointRow, OriginalsRow, SheetView, SourceKey,
  SummaryCellView, TruckFuel, TruckMonthRow, WorktimeRow } from '../dto';
import { daysForExport, fileName, sheetView, toCsv, toJson, type Sheet } from '../export';
import { deviation, normLitres, overTolerance } from '../fuel';
import { cmpNum, gt, gte, intDiv } from '../num';
import { DIESEL_PRICE_KOP } from '../seed';
import type { Driver, ExportRow, OdometerSource, Scope, StatementLine, Truck, TruckMonth, TtnDoc, World } from '../types';

/* ── shared ─────────────────────────────────────────────────────────────── */

const NONE = '—';
const inScope = (scope: Scope, truck: Truck | undefined): truck is Truck => truck !== undefined && (scope === 'FLEET' || truck.pilot);
const truckOf = (w: World, id: string | null): Truck | undefined => (id === null ? undefined : w.trucks.find((t) => t.id === id));
const userShort = (w: World, id: string): string => w.officeUsers.find((u) => u.id === id)?.short_name ?? id;
/** The badge a truck's rows carry (§4.2 C-01): paper first, then the telematics. */
function badgeOf(t: Truck): Badge {
  if (t.paper) return 'PAPER';
  return t.telematics === 'RUPTELA' ? 'RUPTELA' : 'REGIS';
}
/** The badge an odometer source shows; an unread photo vouches for nothing. */
const SOURCE_OF: Record<OdometerSource, SourceKey | null> = { CAN: 'CAN', DASH_PHOTO: 'PHOTO', PLAN_CONFIRMED: 'PLAN_OK',
  DRIVER_TYPED: 'TYPED', UNREAD: null, OFFICE_EDIT: 'OFFICE', OFFICE_CALC: 'ESTIMATE', OFFICE_FROM_CALL: 'FROM_CALL' };
/** «+67,3» · «−0,6» · «0,0»: a signed decimal as the fuel lines write a difference. */
const signed = (v: string): string => (decGt(v, '0') ? `+${fmtDec(v)}` : fmtDec(v));
/** «82 %» — with the NBSP §0.1 puts before every «%». */
const pct = (v: string): string => `${fmtDec(v)}${NBSP}%`;

/* ── C-10 «Ключові точки» ───────────────────────────────────────────────── */

/** Every stop of the truck on `date` the server knows of — the truck-day's own (planned and unplanned) and the plan's
 *  stops a Ruptela IN reached before any shift was recorded. */
function visitsOf(w: World, truck: Truck, date: BusinessDate, now: Instant): StopFacts[] {
  const dayId = truckDayIdFor(w, truck.id, date);
  const facts = dayId === null ? [] : stopsOfDay(w, dayId, now);
  const seen = new Set(facts.map((f) => f.stop.id));
  const trips = new Set(w.trips.filter((t) => t.truck_id === truck.id && t.date === date).map((t) => t.id));
  for (const stop of w.plannedStops) {
    if (!trips.has(stop.trip_id) || seen.has(stop.id)) continue;
    const f = stopFacts(w, stop.id, now);
    if (f !== null) { facts.push(f); seen.add(stop.id); }
  }
  return facts.filter((f) => f.arrived_at !== null && f.truck_id === truck.id);
}

/** RG: «08:40 (запис)» — the completion's commit; R+C: the Ruptela OUT; photos put off: unknown, by the ТТН; open: «—». */
function departedLabel(f: StopFacts): string {
  const d = f.departure;
  if (d === null) return NONE;
  if (d.kind === 'UNKNOWN' || d.at === null) return 'невідомо, за ТТН';
  return d.kind === 'RECORD' ? `${fmtTime(d.at)} (запис)` : fmtTime(d.at);
}

/** One row per visit (a stop with an arrival) on `date`, in arrival order (§4.2 C-10). Ruptela's rows are simulated. */
export function keyPointRows(w: World, date: BusinessDate, scope: Scope, truckId: string | null, now: Instant): KeyPointRow[] {
  const rows: KeyPointRow[] = [];
  for (const truck of w.trucks) {
    if (!inScope(scope, truck) || (truckId !== null && truck.id !== truckId)) continue;
    for (const f of visitsOf(w, truck, date, now)) {
      if (f.arrived_at === null) continue;
      const source = (f.odometer === null ? null : SOURCE_OF[f.odometer.source])
        ?? (f.arrival === 'RUPTELA' ? 'RUPTELA' : 'DRIVER');
      rows.push({ plate: truck.plate, place: f.place.label, arrived_at: f.arrived_at, departed_at: f.departed_at,
        departed_label: departedLabel(f), odometer: f.odometer?.value ?? null, source,
        simulated: truck.telematics === 'RUPTELA' });
    }
  }
  return rows.sort((a, b) => cmpInstant(a.arrived_at, b.arrived_at) || byCodepoint(a.plate, b.plate)
    || byCodepoint(a.place, b.place));
}

/* ── C-11 «В BAS» ───────────────────────────────────────────────────────── */

const SHEETS: readonly Sheet[] = ['WAYBILLS', 'LEGS', 'REFUELS', 'WORKTIME'];
const BAS_CONFIG = 'Для BAS УАТ — чернетки «Подорожній лист»; для BAS Бухгалтерії — файл для вашої обробки. Що саме — після '
  + 'відповіді про вашу конфігурацію.';
const DRAFTS = ['чернетку', 'чернетки', 'чернеток'] as const;
/** The one conflict a fleet import reports («приклад», §4.2 C-11): a day BAS already posted gets a correction under its
 *  own number, never a second waybill. */
export const FLEET_CONFLICT = 'ПЛ-000297 уже проведено. Зміна: пальне −45,00 л. У файлі — коригування до ПЛ-000297 (той '
  + 'самий номер), а не другий лист.';

/** The four sheets of a date and scope, keyed as the file writers want them. */
function sheetsOf(w: World, date: BusinessDate, scope: Scope, now: Instant): Record<Sheet, SheetView> {
  return { WAYBILLS: sheetView(w, 'WAYBILLS', date, scope, now), LEGS: sheetView(w, 'LEGS', date, scope, now),
    REFUELS: sheetView(w, 'REFUELS', date, scope, now), WORKTIME: sheetView(w, 'WORKTIME', date, scope, now) };
}

/** What an import said, rebuilt from what the export row keeps: the draft lines when something was new or changed,
 *  «Уже в BAS без змін N · нових M» when something was already there unchanged (§4.2 C-11). */
export function importResultOf(imp: NonNullable<ExportRow['import']>): ImportResult {
  const lines: string[] = [];
  if (imp.created !== 0 || imp.updated !== 0) lines.push(BAS_CONFIG);
  if (imp.created !== 0) lines.push(`Створено ${pluralN(imp.created, DRAFTS)} · не проведено · проводить бухгалтер`);
  if (imp.updated !== 0) {
    lines.push(`Оновлено ${pluralN(imp.updated, DRAFTS)} · коригування до того самого номера, а не другий лист`);
  }
  const note = imp.unchanged === 0 ? '' : `Уже в BAS без змін ${imp.unchanged} · нових ${imp.created}`;
  return { at: imp.at, created: imp.created, updated: imp.updated, unchanged: imp.unchanged,
    corrections: [...imp.corrections], note, lines };
}

/** The newest export of a date and scope (created by `now`). */
function lastExport(w: World, date: BusinessDate, scope: Scope, now: Instant): ExportRow | null {
  return w.exports.filter((e) => e.date === date && e.scope === scope && atOrBefore(e.created_at, now))
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).at(-1) ?? null;
}

/** C-11: the count Reading, the four sheets, and the last export of that date and scope with its import. */
export function exportPreviewView(w: World, date: BusinessDate, scope: Scope, now: Instant): ExportPreview {
  const views = sheetsOf(w, date, scope, now);
  const confirmed = views.WAYBILLS.rows.filter((r) => r.confirmed).length;
  const unconfirmed = views.WAYBILLS.rows.length - confirmed;
  const still_on_shift = w.truckDays
    .filter((d) => d.date === date && inScope(scope, truckOf(w, d.truck_id)) && truckDayStatus(w, d.id) === 'OPEN')
    .map((d) => truckOf(w, d.truck_id)?.plate ?? NONE).sort(byCodepoint);
  const count_line = scope === 'PILOT'
    ? `Пілот: підтверджено днів ${confirmed} з ${confirmed + unconfirmed}`
      + (still_on_shift.length === 0 ? '' : ` · ${still_on_shift.join(', ')} ще на зміні`)
    : `Усі (приклад): підтверджено днів ${confirmed}`
      + (unconfirmed === 0 ? '' : ` · не підтверджено ${unconfirmed} — не потраплять у файл`);
  const last = lastExport(w, date, scope, now);
  return { date, scope, confirmed, unconfirmed, still_on_shift, count_line,
    sheets: { waybills: views.WAYBILLS, legs: views.LEGS, refuels: views.REFUELS, worktime: views.WORKTIME },
    last_export_id: last?.id ?? null, last_import: last?.import ? importResultOf(last.import) : null };
}

/** One file of «Завантажити файл ▾» (D8): a sheet as CSV (;), or all four sheets as JSON — `ALL` is always the JSON
 *  bundle, since four sheets do not fit one CSV. `rows` counts the confirmed rows the file carries. */
export function exportFileOf(w: World, date: BusinessDate, scope: Scope, sheet: Sheet | 'ALL', format: 'CSV' | 'JSON',
  now: Instant): Omit<ExportFile, 'id'> & { sheet: Sheet | 'ALL'; format: 'CSV' | 'JSON'; day_ids: string[] } {
  const day_ids = daysForExport(w, date, scope).map((d) => d.id);
  if (format === 'JSON' || sheet === 'ALL') {
    const views = sheetsOf(w, date, scope, now);
    return { sheet: 'ALL', format: 'JSON', day_ids, file_name: fileName('ALL', date, 'JSON'), mime: 'application/json',
      content: toJson(views), rows: SHEETS.reduce((acc, s) => acc + views[s].total, 0) };
  }
  const view = sheetView(w, sheet, date, scope, now);
  return { sheet, format: 'CSV', day_ids, file_name: fileName(sheet, date, 'CSV'), mime: 'text/csv;charset=utf-8',
    content: toCsv(view), rows: view.total };
}

/* ── C-12 «Машини» ──────────────────────────────────────────────────────── */

const METHOD_LABEL: Record<TruckMonth['fuel_method'], string> = { CAN: 'CAN', FULL_TO_FULL: 'від повного до повного' };

function monthRow(t: Truck, m: TruckMonth): TruckMonthRow {
  return { truck_id: t.id, plate: t.plate, badge: badgeOf(t), days: m.days, km: m.km, km_loaded: m.km_loaded,
    fuel_rate: m.fuel_rate, method_label: METHOD_LABEL[m.fuel_method], norm: t.norm_l_100, deviation: m.deviation,
    over_tolerance: overTolerance(m.deviation), fuel_uah: m.fuel_uah, site_hours: m.site_hours, idle_over_free: null,
    docs_on_time: m.docs_on_time, days_confirmed: m.days_confirmed, example: m.example, simulated: m.fuel_method === 'CAN' };
}
/** Deviation descending (dec.cmp), a truck without one last. */
const byDeviation = (a: TruckMonthRow, b: TruckMonthRow): number => {
  if (a.deviation === null || b.deviation === null) return cmpNum(a.deviation === null ? 1 : 0, b.deviation === null ? 1 : 0);
  return cmp(b.deviation, a.deviation);
};
const SORTS: Record<'fuel_dev' | 'plate' | 'km', (a: TruckMonthRow, b: TruckMonthRow) => number> = {
  fuel_dev: (a, b) => byDeviation(a, b) || byCodepoint(a.plate, b.plate),
  plate: (a, b) => byCodepoint(a.plate, b.plate),
  km: (a, b) => cmpNum(b.km, a.km) || byCodepoint(a.plate, b.plate),
};

/** C-12: each truck's month (D14: month-to-date), sorted as asked; «Простій понад безкоштовні» is «—» until contracts
 *  are set. */
export function truckMonthRows(w: World, scope: Scope, month: string, sort: 'fuel_dev' | 'plate' | 'km'): TruckMonthRow[] {
  return w.truckMonths.flatMap((m) => {
    const t = truckOf(w, m.truck_id);
    return m.month === month && inScope(scope, t) ? [monthRow(t, m)] : [];
  }).sort(SORTS[sort]);
}

/* ── C-13 «Машина → Пальне» ─────────────────────────────────────────────── */

/** §4.2 C-13's figures that no store row carries — the fleet example has no telemetry of its own, and a month's
 *  full-to-full span is not kept beside its rate. Keyed by plate; a truck not listed derives what it can from its month
 *  and leaves the rest out rather than inventing it. */
const C13_EXAMPLE: Record<string, { sensor?: { litres: string; refuels: number; drains: number }; windowsKm?: number;
  /** The driver's word beside an unmatched statement line, keyed by the line's «dd.mm HH:MM». */
  unmatched?: Record<string, string> }> = {
  'АР 8150 КС': { sensor: { litres: '1228', refuels: 12, drains: 0 },
    unmatched: { '18.09 11:52': 'запис водія 11:50 «Зніму пізніше» (дрон-коридор)' } },
  'АР 1234 ВС': { windowsKm: 3490 },
};
const TRANSACTIONS = ['транзакція', 'транзакції', 'транзакцій'] as const;
const RECEIPTS = ['чек', 'чеки', 'чеків'] as const;
const WINDOWS = ['вікно', 'вікна', 'вікон'] as const;
const NORM_HOLD = 'Норму КТЛ не затверджено — надлишок для ПДВ не рахується';
const STEADY = 'Стабільно понад базову норму без подій зливу — перевірте норму з урахуванням т·км або призначте контрольний '
  + 'заїзд';

const monthOf = (at: Instant): string => businessDate(at).slice(0, 7);
/** A real calendar month, 'YYYY-MM' (01–12). */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** The office's litres for hryvnias at the example diesel price: 22 800,00 → 250,00 (§7.6). */
const litresOf = (uah: string): string => div(mul(uah, '100', 2), DIESEL_PRICE_KOP, 2);
/** Receipts a month holds when the office has no statement to count them from: a full fill every other shift day. */
const receiptsOf = (m: TruckMonth): number => intDiv(m.days + 1, 2);
const cell = (label: string, value: string, lines: string[], simulated: boolean, hold_lines: string[] = []): SummaryCellView =>
  ({ label, value, lines, hold_lines, simulated });

/** «Scania R500 (2021) · Ruptela + CAN · причіп АР 7702 ХТ, пневмобочка 6 відсіків · водій Олійник М.». */
function truckLine(w: World, t: Truck): string {
  const trailer = w.trailers.find((x) => x.id === t.trailer_id);
  const telematics = t.telematics === 'RUPTELA' ? (t.has_can ? 'Ruptela + CAN' : 'Ruptela')
    : t.telematics === 'REGIS' ? 'Регіс' : 'без телематики';
  const drivers = w.drivers.filter((d) => d.truck_id === t.id).sort((a, b) => byCodepoint(a.tab_no, b.tab_no));
  return [`${t.model}${t.year === null ? '' : ` (${t.year})`}`, telematics,
    trailer === undefined ? null : `причіп ${trailer.plate}, ${trailer.body_label.replace(',', '')}`,
    drivers.length === 0 ? null : `водій ${drivers.map((d) => d.short_name).join(' + ')}`]
    .filter((p): p is string => p !== null).join(' · ');
}

function statementCell(lines: StatementLine[]): SummaryCellView {
  if (lines.length === 0) return cell('Виписка', NONE, ['виписку ще не завантажено'], false);
  const brand = lines[0]?.station.split(' ')[0] ?? '';
  return cell(`Виписка ${brand}`.trim(), `${fmtDec(sum(lines.map((l) => l.litres), 2))} л`,
    [`${pluralN(lines.length, TRANSACTIONS)} · ${fmtDec(sum(lines.map((l) => l.sum_uah), 2))} грн`], false);
}
/** Receipts: the statement's lines that have one, read by OCR and not yet reconciled; without a statement, the month's
 *  receipts as the office's hryvnias at the example price. Simulated either way. */
function receiptsCell(lines: StatementLine[], m: TruckMonth | null): SummaryCellView {
  const label = 'Чеки (QR)';
  if (lines.length !== 0) {
    const matched = lines.filter((l) => l.matched_record_key !== null);
    return cell(label, `${fmtDec(sum(matched.map((l) => l.litres), 2))} л`,
      [`${pluralN(matched.length, RECEIPTS)} · OCR · не звірено`], true);
  }
  if (m === null || m.fuel_uah === null) return cell(label, NONE, ['чеків за місяць немає'], false);
  return cell(label, `${fmtDec(litresOf(m.fuel_uah))} л`, [`${pluralN(receiptsOf(m), RECEIPTS)} · ${fmtDec(m.fuel_uah)} грн`], true);
}
/** The fuel-level sensor: Ruptela's refuels and drains (simulated); Регіс has no levels in phase 1. */
function sensorCell(t: Truck, m: TruckMonth | null): SummaryCellView {
  if (t.telematics === 'REGIS') return cell('Регіс', NONE, ['рівні — у фазі 2'], false);
  if (t.telematics !== 'RUPTELA' || !t.has_fuel_sensor) return cell('Ruptela', NONE, ['датчика рівня немає'], false);
  const known = C13_EXAMPLE[t.plate]?.sensor;
  const sensor = known ?? (m === null || m.fuel_rate === null ? null
    : { litres: div(mul(String(m.km), m.fuel_rate, 4), 100, 0), refuels: receiptsOf(m), drains: 0 });
  if (sensor === null) return cell('Ruptela', NONE, ['за місяць даних ще немає'], true);
  return cell('Ruptela', `${fmtDec(sensor.litres)} л`, [`заправок ${sensor.refuels} · зливів ${sensor.drains}`], true);
}
/** «Факт і норма»: CAN — the fact in litres against the norm's litres; RG — full-to-full against the norm. Beyond the
 *  tolerance the line is a hold line. Never an over-norm figure for ПДВ. */
function factCell(t: Truck, m: TruckMonth | null): SummaryCellView {
  const label = 'Факт і норма';
  if (m === null || m.fuel_rate === null) return cell(label, NONE, ['за місяць даних ще немає'], false);
  const rate = m.fuel_rate;
  const norm = t.norm_l_100;
  const dev = m.deviation ?? deviation(rate, norm);
  let line: string;
  if (m.fuel_method === 'CAN') {
    const fact = div(mul(String(m.km), rate, 4), 100, 1);
    const normL = round(normLitres(m.km, norm), 1);
    line = `факт CAN ${fmtDec(fact)} л · норма ${fmtDec(normL)} л (базова ${fmtRate(norm)}) · `
      + `${signed(sub(fact, normL, 1))} л (${fmtPct(dev)})`;
  } else {
    const windowsKm = C13_EXAMPLE[t.plate]?.windowsKm;
    const windows = receiptsOf(m) - 1;
    line = ['від повного до повного', gt(windows, 0) ? pluralN(windows, WINDOWS) : null,
      windowsKm === undefined ? null : `${fmtKm(windowsKm)} км`, `проти ${fmtRate(norm)}`, fmtPct(dev)]
      .filter((p): p is string => p !== null).join(' · ');
  }
  const over = overTolerance(dev);
  return cell(label, `${fmtRate(rate)} л/100`, over ? [] : [line], m.fuel_method === 'CAN', over ? [line] : []);
}

/** «Розбіжності»: statement lines no receipt answers. */
function mismatchLines(t: Truck, lines: StatementLine[]): string[] {
  const notes = C13_EXAMPLE[t.plate]?.unmatched ?? {};
  return lines.filter((l) => l.matched_record_key === null).map((l) => {
    const when = fmtDateTime(l.at);
    const note = notes[when];
    return ['транзакція без чека', when, l.station, `${fmtDec(l.litres)} л`, note ?? null, 'чек не сфотографовано']
      .filter((p): p is string => p !== null).join(' · ');
  });
}

/** Loaded km over all km of every truck's month, whole per cent — the «(парк: …)» beside a truck's own share. */
function fleetLoadedShare(w: World, month: string): string | null {
  const ms = w.truckMonths.filter((m) => m.month === month);
  const km = ms.reduce((acc, m) => acc + m.km, 0);
  const loaded = ms.reduce((acc, m) => acc + m.km_loaded, 0);
  return gt(km, 0) ? div(mul(String(loaded), '100', 0), km, 0) : null;
}

function normBlock(w: World, t: Truck, m: TruckMonth | null, month: string): TruckFuel['norm_block'] {
  const hold = t.norm_order === null ? NORM_HOLD : `Норма КТЛ — наказ ${t.norm_order}`;
  if (m === null) return { hold, lines: [], trend: [], trend_label: '', dispatcher: [] };
  const drains = C13_EXAMPLE[t.plate]?.sensor?.drains ?? 0;
  const fleet = fleetLoadedShare(w, month);
  const share = m.loaded_share === null ? null
    : `з вантажем ${pct(m.loaded_share)} км${fleet === null ? '' : ` (парк: ${pct(fleet)})`}`;
  const parts = [share,
    m.tkm === null ? null : `${fmtDec(round(m.tkm, 0))} т·км`,
    m.tkm === null || !gt(m.km_loaded, 0) ? null : `середня маса ${fmtDec(div(m.tkm, m.km_loaded, 1))} т`]
    .filter((p): p is string => p !== null);
  const norm = t.norm_l_100;
  const dispatcher: string[] = [];
  if (m.fuel_rate !== null && overTolerance(m.deviation ?? deviation(m.fuel_rate, norm))) {
    dispatcher.push(`${fmtRate(m.fuel_rate)} л/100 за фактом проти ${fmtRate(norm)} — понад на `
      + `${fmtRate(sub(m.fuel_rate, norm, 1))} л/100: або злив, або гора`);
    if (drains === 0 && m.trend.length !== 0 && m.trend.every((v) => decGt(v, norm))) dispatcher.push(STEADY);
  }
  return { hold, lines: parts.length === 0 ? [] : [parts.join(' · ')], trend: [...m.trend],
    trend_label: m.trend.length === 0 ? '' : `${m.trend.map(fmtRate).join(' · ')} л/100 · подій зливу ${drains}`, dispatcher };
}

/** `n` of `total` flags set, spread evenly with an integer accumulator rather than a ratio. */
function spread(n: number, total: number): boolean[] {
  let acc = 0;
  return Array.from({ length: total }, () => {
    acc += n;
    if (!gte(acc, total)) return false;
    acc -= total;
    return true;
  });
}

/** One cell per day of the month up to today: a truck-day's own status where one exists, the driver's shift days of
 *  the month as confirmed, today ringed; a truck with neither spreads its month's days evenly (the fleet example). */
function monthStrip(w: World, t: Truck, m: TruckMonth | null, month: string, now: Instant): TruckFuel['month_strip'] {
  const today = businessDate(now);
  if (!MONTH.test(month)) return [];
  const dates: BusinessDate[] = [];
  // Every day of the month that has begun: a month still to come has none.
  for (let d = asBusinessDate(`${month}-01`); d.slice(0, 7) === month && gte(daysBetween(d, today), 0); d = addDays(d, 1)) {
    dates.push(d);
  }
  const drivers = new Set(w.drivers.filter((d: Driver) => d.truck_id === t.id).map((d) => d.id));
  const worked = new Set(w.driverMonths.filter((dm) => dm.month === month && drivers.has(dm.driver_id))
    .flatMap((dm) => dm.days.map((x) => x.date)));
  const prior = dates.filter((d) => d !== today);
  const spreadDays = worked.size === 0 && m !== null
    ? spread(Math.max(0, Math.min(m.days - 1, prior.length)), prior.length) : prior.map(() => false);
  return dates.map((date) => {
    if (date === today) return { date, state: 'TODAY' as const };
    const day = w.truckDays.find((x) => x.truck_id === t.id && x.date === date);
    if (day !== undefined) return { date, state: truckDayStatus(w, day.id) === 'CONFIRMED' ? 'CONFIRMED' as const : 'OPEN' as const };
    const worksHere = worked.has(date) || (spreadDays[prior.indexOf(date)] ?? false);
    return { date, state: worksHere ? 'CONFIRMED' as const : 'OFF' as const };
  });
}

/** C-13: the four summary cells, the statement lines no receipt answers, the norm block and the month strip; `null`
 *  for an unknown truck. */
export function truckFuelView(w: World, truckId: string, month: string, now: Instant): TruckFuel | null {
  const t = w.trucks.find((x) => x.id === truckId);
  if (t === undefined) return null;
  const m = w.truckMonths.find((x) => x.truck_id === t.id && x.month === month) ?? null;
  const statement = w.statements.filter((l) => l.truck_id === t.id && monthOf(l.at) === month && atOrBefore(l.at, now))
    .sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id));
  return { truck: { id: t.id, plate: t.plate, line: truckLine(w, t) },
    cells: [statementCell(statement), receiptsCell(statement, m), sensorCell(t, m), factCell(t, m)],
    mismatches: mismatchLines(t, statement), norm_block: normBlock(w, t, m, month),
    month_strip: monthStrip(w, t, m, month, now), month: m === null ? null : monthRow(t, m), example: t.example };
}

/* ── C-14 «Оригінали» ───────────────────────────────────────────────────── */

/** §7.3: a document whose paper is not in the office three days after its date is overdue. */
const OVERDUE_DAYS = 3;

/** The truck a document rode on: its loading stop's trip, else its driver's truck. */
function truckOfDoc(w: World, d: TtnDoc): Truck | undefined {
  const stop = w.plannedStops.find((s) => s.id === d.loading_stop_id);
  const trip = stop === undefined ? undefined : w.trips.find((t) => t.id === stop.trip_id);
  return truckOf(w, trip?.truck_id ?? w.drivers.find((x) => x.id === d.driver_id)?.truck_id ?? null);
}
/** The consignee a document is chased by: «ТТН 004503 («Добробут»)». */
function consigneeLabel(w: World, d: TtnDoc): string {
  const drop = w.plannedStops.find((s) => s.id === d.drop_stop_id);
  const place = drop === undefined ? undefined : w.places.find((p) => p.id === drop.place_id);
  return place === undefined ? d.label : `${d.label} («${place.label}»)`;
}
const receivedBy = (d: TtnDoc, now: Instant): TtnDoc['original'] =>
  (d.original !== null && atOrBefore(d.original.received_at, now) ? d.original : null);
function loadedToday(w: World, driverId: string, today: BusinessDate, now: Instant): boolean {
  return w.records.some((r) => r.type === 'LOADED' && r.driver_id === driverId && r.voided_by === null
    && atOrBefore(r.received_at, now) && businessDate(r.occurred_at) === today);
}
/** The office has printed the waybill of the day this document rode on: the driver signs it at the window when he
 *  hands in the paper (§4.2 C-17 «офіс друкує лист з даних, водій підписує, коли здає ТТН»), so his originals are
 *  what the office expects today. */
function printedFor(w: World, d: TtnDoc, now: Instant): boolean {
  const t = truckOfDoc(w, d);
  const printed = (t === undefined ? undefined : w.truckDays.find((x) => x.truck_id === t.id && x.date === d.date))?.printed_at ?? null;
  return printed !== null && atOrBefore(printed, now);
}

/** C-14: «Понад 3 дні» (grouped by driver and trip, each document its own chip) and «Очікуємо сьогодні» — today's ТТН of
 *  the drivers who loaded today and whose day's waybill is printed, waiting for their signature at the window (§8.3
 *  C-14 #1: at 16:15 that is Павло alone; Олег's confirmed-but-unprinted day and Григорій's open one are not yet due).
 *  A document received today stays in its row, plain, so the chip can say so. */
export function originalsRows(w: World, scope: Scope, now: Instant): OriginalsRow[] {
  const today = businessDate(now);
  const groups = new Map<string, { group: OriginalsRow['group']; driver: Driver | undefined; trip_no: string; docs: TtnDoc[] }>();
  for (const d of w.ttnDocs) {
    if (!inScope(scope, truckOfDoc(w, d))) continue;
    const got = receivedBy(d, now);
    if (got !== null && businessDate(got.received_at) !== today) continue;
    const age = daysBetween(d.date, today);
    const group: OriginalsRow['group'] | null = gte(age, OVERDUE_DAYS) ? 'OVERDUE'
      : d.date === today && !d.example && loadedToday(w, d.driver_id, today, now) && printedFor(w, d, now) ? 'TODAY' : null;
    if (group === null) continue;
    const key = `${group}:${d.driver_id}:${d.trip_no}`;
    const g = groups.get(key) ?? { group, driver: w.drivers.find((x) => x.id === d.driver_id), trip_no: d.trip_no, docs: [] };
    g.docs.push(d);
    groups.set(key, g);
  }
  const rows = [...groups.entries()].map(([id, g]): OriginalsRow => {
    const docs = [...g.docs].sort((a, b) => cmpNum(a.doc_index, b.doc_index) || byCodepoint(a.no, b.no));
    const notes = docs.flatMap((d) => [d.note, d.driver_said_handed === null ? null
      : `водій натиснув «Здав» ${fmtDayMonth(d.driver_said_handed)}`]).filter((n): n is string => n !== null);
    return { id, driver: g.driver?.short_name ?? NONE, trip_no: g.trip_no,
      docs: docs.map((d) => {
        const got = receivedBy(d, now);
        return { id: d.id, label: g.group === 'OVERDUE' ? consigneeLabel(w, d) : d.label,
          received_at: got?.received_at ?? null, received_by: got === null ? null : userShort(w, got.received_by) };
      }),
      days: docs.reduce((acc, d) => Math.max(acc, daysBetween(d.date, today)), 0),
      note: notes.length === 0 ? null : notes.join(' · '), group: g.group, example: docs.some((d) => d.example) };
  });
  const groupOrder = (r: OriginalsRow): number => (r.group === 'OVERDUE' ? 0 : 1);
  return rows.sort((a, b) => cmpNum(groupOrder(a), groupOrder(b)) || cmpNum(a.example ? 1 : 0, b.example ? 1 : 0)
    || byCodepoint(a.driver, b.driver) || byCodepoint(a.trip_no, b.trip_no));
}

/** The row a document is shown in — in any scope — or a row of its own when no list shows it any more. */
export function originalRowOf(w: World, docId: string, now: Instant): OriginalsRow | null {
  const hit = originalsRows(w, 'FLEET', now).find((r) => r.docs.some((d) => d.id === docId));
  if (hit !== undefined) return hit;
  const d = w.ttnDocs.find((x) => x.id === docId);
  if (d === undefined) return null;
  const got = receivedBy(d, now);
  const today = businessDate(now);
  return { id: `DOC:${d.id}`, driver: w.drivers.find((x) => x.id === d.driver_id)?.short_name ?? NONE, trip_no: d.trip_no,
    docs: [{ id: d.id, label: consigneeLabel(w, d), received_at: got?.received_at ?? null,
      received_by: got === null ? null : userShort(w, got.received_by) }],
    days: Math.max(0, daysBetween(d.date, today)), note: d.note,
    group: gte(daysBetween(d.date, today), OVERDUE_DAYS) ? 'OVERDUE' : 'TODAY', example: d.example };
}
/** The truck-day a document belongs to, for the live highlight: its truck on its date. */
export function truckDayOfDoc(w: World, docId: string): string | null {
  const d = w.ttnDocs.find((x) => x.id === docId);
  const t = d === undefined ? undefined : truckOfDoc(w, d);
  return d === undefined || t === undefined ? null : truckDayIdFor(w, t.id, d.date);
}

/* ── C-15 «Робочий час» ─────────────────────────────────────────────────── */

/** Minutes as the column writes them; nothing counted is «—». */
const hours = (minutes: number): string => (gt(minutes, 0) ? fmtDur(minutes) : NONE);

/** C-15: shift lengths beside the tachograph, never a legal verdict. A driver whose only shift is today's reads «на
 *  зміні». The column is «Тривалість змін», never «Робочий час». */
export function worktimeRows(w: World, month: string, scope: Scope): WorktimeRow[] {
  return w.driverMonths.flatMap((dm) => {
    const d = w.drivers.find((x) => x.id === dm.driver_id);
    if (dm.month !== month || d === undefined || (scope === 'PILOT' && !d.pilot)) return [];
    return [{ driver: d.short_name, shifts: String(dm.shifts),
      span: gt(dm.on_shift_min, 0) ? fmtDur(dm.on_shift_min) : gt(dm.shifts, 0) ? 'на зміні' : NONE,
      on_site: hours(dm.on_site_min), night: hours(dm.night_min), curfew_heat: dm.curfew_heat_label,
      tacho: dm.tacho_label, diff: dm.diff_label, weekend: dm.weekend_label, simulated: dm.simulated,
      example: dm.example }];
  }).sort((a, b) => cmpNum(a.example ? 1 : 0, b.example ? 1 : 0) || byCodepoint(a.driver, b.driver));
}

/* ── C-16 «Водії» ───────────────────────────────────────────────────────── */

/** C-16: every driver in scope with the phone bound to him, or the code the office is showing him. BOUND wins; a live
 *  code is CODE_SHOWN until the phone opened it (OPENED); an expired, unused code leaves the state NONE but keeps its
 *  digits and expiry, so the card can say «Код застарів». */
export function driverRows(w: World, scope: Scope, now: Instant): DriverRow[] {
  return w.drivers.filter((d) => scope === 'FLEET' || d.pilot).map((d): DriverRow => {
    const truck = truckOf(w, d.truck_id);
    const device = w.devices.filter((x) => x.driver_id === d.id && x.bound_at !== null && atOrBefore(x.bound_at, now)
      && (x.revoked_at === null || isBefore(now, x.revoked_at)))
      .sort((a, b) => cmpInstant(a.bound_at ?? now, b.bound_at ?? now) || byCodepoint(a.id, b.id)).at(-1) ?? null;
    const code = w.bindCodes.filter((b) => b.driver_id === d.id && atOrBefore(b.created_at, now))
      .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).at(-1) ?? null;
    const used = code !== null && code.used_at !== null && atOrBefore(code.used_at, now);
    const live = code !== null && !used && isBefore(now, code.expires_at);
    let binding: DriverRow['binding'];
    if (device !== null) {
      binding = { state: 'BOUND', code: null, expires_at: null, bound_at: device.bound_at, device_label: device.os_label };
    } else if (live) {
      binding = { state: code.opened_at !== null && atOrBefore(code.opened_at, now) ? 'OPENED' : 'CODE_SHOWN',
        code: code.code, expires_at: code.expires_at, bound_at: null, device_label: null };
    } else {
      binding = { state: 'NONE', code: code === null || used ? null : code.code,
        expires_at: code === null || used ? null : code.expires_at, bound_at: null, device_label: null };
    }
    const phone_label = d.mode === 'PAPER' ? 'смартфона немає'
      : device === null || device.bound_at === null ? 'не підключено'
        : `${device.os_label} · підключено ${fmtDayMonth(device.bound_at)}`;
    return { id: d.id, full_name: d.full_name, tab_no: d.tab_no, plate: truck?.plate ?? NONE, mode: d.mode, phone_label,
      pilot: d.pilot, binding, example: d.example };
  }).sort((a, b) => cmpNum(a.pilot ? 0 : 1, b.pilot ? 0 : 1) || byCodepoint(a.full_name, b.full_name)
    || byCodepoint(a.tab_no, b.tab_no));
}
