// mocks/driver-report/src/domain/views/office.ts
/** What the console is told (§7.4 operations 10–17, §4.1, §4.2 C-01 … C-06): the header's summary and the three
 *  tiles, the fleet board's rows, the paper-mirror of one stop, a retake request and a correction as the office sees
 *  them. Pure functions over a `World` snapshot at `now`; `src/api/handlers/office.ts` only stores what the office did
 *  and asks these for the answer.
 *
 *  The board is the pilot's own trucks, derived (`boardState`, lifted to rank 1 by an open «Зараз» item and to rank 2
 *  by an open «Перевірка» item), and — in the fleet scope only — the 97 rows of the fleet example as they read at 16:05,
 *  lifted the same way by the items open at `now`, so a correction or a «З'ясовано» moves a row there too.
 *
 *  The console's users are the office of §7.6. The sentences it writes about them are in the feminine («підтвердила»,
 *  «Прийняла»), as §4.2 writes them: every user who works the console in the mock (Наталія, Ірина, Оксана, Тетяна,
 *  Людмила) is a woman; the two men of the office (Дмитро — черговий, Микола — механік) never act on it.
 *
 *  No `*`, `/` or relational operator: whole minutes, pages and kilometres go through num.ts. */
import { byCodepoint } from '@agency/mock';
import { fmtBytes, fmtDayMonth, fmtDur, fmtTime, pluralN } from '../../app/format';
import { DC } from '../../copy/driver';
import { atOrBefore, businessDate, cmpInstant, isBefore, kyiv, minutesBetween } from '../clock';
import { boardState, compareBoard, docCounts, liveRecords, odometerPoints, stopFacts, truckDayIdFor, truckDayStatus,
  visibleTelemetry, type StopFacts } from '../derive';
import type { CorrectionView, DocDot, ExceptionItem, FleetRow, OfficeSummary, PageView, RequestView, SourceKey,
  StopReview, TtnDocView, TtnFieldView } from '../dto';
import { closedToday, counts, openItems } from '../exceptions';
import { cmpNum, gt, gte, intDiv, lte, toInt } from '../num';
import type { ArtefactKind, BusinessDate, Correction, Driver, ExampleBoardRow, Instant, OdometerSource, OfficeRole,
  OfficeUser, Page, PlannedStop, Request, Scope, Truck, TruckDay, TtnDoc, TtnField, TtnFieldValue, World } from '../types';
import { onCallAt, pageTarget } from './driver';

/* ── people ─────────────────────────────────────────────────────────────── */

const ROLE_LABEL: Record<OfficeRole, string> = { OPERATOR: 'оператор', DISPATCHER: 'диспетчер', ACCOUNTANT: 'бухгалтер',
  MECHANIC: 'механік', ON_CALL: 'черговий' };
const userById = (w: World, id: string | null): OfficeUser | null =>
  (id === null ? null : w.officeUsers.find((u) => u.id === id) ?? null);
/** «Н. Шевчук» for a store id; the id itself when no such user exists (never an empty cell). */
const userShort = (w: World, id: string | null): string => userById(w, id)?.short_name ?? id ?? '';
const shown = (at: Instant | null, now: Instant): Instant | null => (at !== null && atOrBefore(at, now) ? at : null);

/* ── the board (§4.2 C-01) ──────────────────────────────────────────────── */

/** How a reading was taken, as the SourceBadge names it. An unread photo has no number to badge. */
const SOURCE_KEY: Record<OdometerSource, SourceKey | null> = { CAN: 'CAN', DASH_PHOTO: 'PHOTO', PLAN_CONFIRMED: 'PLAN_OK',
  DRIVER_TYPED: 'TYPED', UNREAD: null, OFFICE_EDIT: 'OFFICE', OFFICE_CALC: 'ESTIMATE', OFFICE_FROM_CALL: 'FROM_CALL' };
/** «Без зв'язку понад 2 год» (§4.2 C-01, 04 EC-68). */
const STALE_MIN = 120;
/** A stop over 2 h ranks 3 (§4.2 C-01 «Order»). */
const LONG_STOP_MIN = 120;
const NO_DOCS: FleetRow['docs'] = { ttn: 'none', signed: 'none', receipts: 'none', label: '—' };

type NotStarted = 'MOVING_RUPTELA' | 'REGIS_NO_DATA' | 'ABSENT' | 'AT_BASE';
/** One board row plus what the tiles count and do not show as columns. */
type BoardRow = { row: FleetRow; at_stop_min: number | null; on_shift: boolean; not_started: NotStarted | null };

const badgeOf = (t: Truck, d: Driver | null): FleetRow['badge'] =>
  (t.paper || d?.mode === 'PAPER' ? 'PAPER' : t.telematics === 'RUPTELA' ? 'RUPTELA' : 'REGIS');
const minRank = (a: number, b: number): number => (lte(a, b) ? a : b);
const staleSince = (at: Instant | null, now: Instant): boolean =>
  at !== null && atOrBefore(at, now) && gt(minutesBetween(at, now), STALE_MIN);

/** Rank 1 for an open «Зараз» item of the truck, 2 for an open «Перевірка» item, and «в роботі: НШ» from the newest
 *  TAKE among them. The fleet's sample names no truck, so it lifts nothing. */
function liftsOf(items: readonly ExceptionItem[]): Map<string, { rank: number; taken: string | null }> {
  const out = new Map<string, { rank: number; taken: string | null }>();
  for (const i of items) {
    if (i.truck_plate === '') continue;
    const had = out.get(i.truck_plate) ?? { rank: 6, taken: null };
    out.set(i.truck_plate, { rank: minRank(had.rank, i.lane === 'NOW' ? 1 : 2), taken: had.taken ?? i.taken_by });
  }
  return out;
}

/** The truck's driver today: the one on its shift, else its trip's, else the one it is assigned to. */
function driverOf(w: World, truck: Truck, today: BusinessDate, shiftDriver: string | null): Driver | null {
  const trip = w.trips.filter((t) => t.truck_id === truck.id && t.date === today).sort((a, b) => byCodepoint(a.no, b.no))[0];
  const id = shiftDriver ?? trip?.driver_id ?? w.drivers.find((d) => d.truck_id === truck.id)?.id ?? null;
  return w.drivers.find((d) => d.id === id) ?? null;
}
/** The newest `received_at` of the truck's records today (the board's «щойно · 05:21»). */
function changedAt(w: World, truckId: string, today: BusinessDate, now: Instant): Instant | null {
  return liveRecords(w).filter((r) => r.truck_id === truckId && atOrBefore(r.received_at, now)
    && businessDate(r.received_at) === today).map((r) => r.received_at).sort(cmpInstant).at(-1) ?? null;
}

function pilotRow(w: World, truck: Truck, now: Instant, lifts: ReturnType<typeof liftsOf>): BoardRow {
  const today = businessDate(now);
  const state = boardState(w, truck.id, now);
  const shift = w.shifts.filter((x) => x.truck_id === truck.id && atOrBefore(x.started_at, now))
    .sort((a, b) => cmpInstant(a.started_at, b.started_at)).at(-1) ?? null;
  const shiftToday = shift !== null && businessDate(shift.started_at) === today ? shift : null;
  const driver = driverOf(w, truck, today, shiftToday?.driver_id ?? null);
  const device = shiftToday !== null ? w.devices.find((d) => d.id === shiftToday.device_id) ?? null
    : w.devices.find((d) => driver !== null && d.driver_id === driver.id && d.bound_at !== null && atOrBefore(d.bound_at, now)
      && (d.revoked_at === null || isBefore(now, d.revoked_at))) ?? null;
  const contactAt = shown(device?.last_contact_at ?? null, now);
  const point = odometerPoints(w, truck.id, now).filter((p) => p.value !== null).at(-1) ?? null;
  const dayId = truckDayIdFor(w, truck.id, today);
  const dots = dayId === null ? null : docCounts(w, dayId, now);
  const docs = dots === null ? NO_DOCS : { ttn: dots.ttn, signed: dots.signed, receipts: dots.receipts, label: dots.label };
  const lift = lifts.get(truck.plate);
  return {
    row: { truck_id: truck.id, truck_day_id: dayId, plate: truck.plate, badge: badgeOf(truck, driver),
      driver: driver?.short_name ?? '—', taken_by: lift?.taken == null ? null : `в роботі: ${lift.taken}`,
      state: state.state, state_line: state.line, state_since: state.since, rank: minRank(state.rank, lift?.rank ?? 6),
      odometer: { value: point?.value ?? null, source: point === null ? null : SOURCE_KEY[point.source] }, docs,
      contact: { at: contactAt, unsent_at_contact: device?.unsent_at_contact ?? 0,
        stale: state.on_shift && staleSince(contactAt, now) },
      phone: driver?.phone ?? null, changed_at: changedAt(w, truck.id, today, now), example: false,
      simulated: truck.telematics === 'RUPTELA' },
    at_stop_min: state.at_stop_min, on_shift: state.on_shift, not_started: notStarted(w, truck, now),
  };
}

/** A pilot truck whose planned start has passed with no shift, split by what is actually known (04 EC-113): Ruptela
 *  saw it move, Ruptela has it standing at base, or Регіс knows nothing about motion. Never «зателефонуйте». */
function notStarted(w: World, truck: Truck, now: Instant): NotStarted | null {
  const today = businessDate(now);
  const due = w.trips.some((t) => t.truck_id === truck.id && t.date === today && t.planned_start !== null
    && atOrBefore(t.planned_start, now));
  const started = w.shifts.some((x) => x.truck_id === truck.id && businessDate(x.started_at) === today
    && atOrBefore(x.started_at, now));
  if (!due || started) return null;
  if (truck.telematics !== 'RUPTELA') return 'REGIS_NO_DATA';
  const moved = visibleTelemetry(w, truck.id, now).some((t) => (t.kind === 'OUT' || t.kind === 'MOTION') && businessDate(t.at) === today);
  return moved ? 'MOVING_RUPTELA' : 'AT_BASE';
}

/** The base rank of a fleet-example row, as the seed ranked it before any item lifted it: 6 off shift, 4 standing on the
 *  road, 3 at a stop over 2 h, 5 otherwise (§4.2 C-01 «Order»). */
function exampleBase(r: ExampleBoardRow): number {
  if (!r.on_shift) return 6;
  if (r.state === 'Стоїть') return 4;
  return r.at_stop_min !== null && gt(r.at_stop_min, LONG_STOP_MIN) ? 3 : 5;
}
/** An example day's DocDots from its figures («4 з 5»), since it has no records to count. */
function exampleDocs(day: TruckDay | null): FleetRow['docs'] {
  const f = day?.figures ?? null;
  const m = f === null ? null : /^(\d+) з (\d+)$/.exec(f.docs);
  if (f === null || m === null) return NO_DOCS;
  const got = toInt(m[1] ?? '0');
  const total = toInt(m[2] ?? '0');
  const dot: DocDot = got === 0 || total === 0 ? 'none' : gte(got, total) ? 'full' : 'part';
  return { ttn: dot, signed: dot, receipts: f.refuels === 0 ? 'none' : 'full', label: `Документи: ${f.docs}` };
}
function exampleRow(w: World, r: ExampleBoardRow, now: Instant, lifts: ReturnType<typeof liftsOf>): BoardRow | null {
  const truck = w.trucks.find((t) => t.id === r.truck_id);
  if (truck === undefined) return null;
  const today = businessDate(now);
  const day = w.truckDays.find((d) => d.truck_id === truck.id && d.date === today) ?? null;
  const driver = w.drivers.find((d) => d.id === day?.driver_id) ?? w.drivers.find((d) => d.truck_id === truck.id) ?? null;
  const lift = lifts.get(truck.plate);
  return {
    row: { truck_id: truck.id, truck_day_id: day?.id ?? null, plate: truck.plate, badge: badgeOf(truck, driver),
      driver: r.driver_label, taken_by: lift?.taken == null ? null : `в роботі: ${lift.taken}`, state: r.state,
      state_line: r.state_line, state_since: null, rank: minRank(exampleBase(r), lift?.rank ?? 6),
      odometer: { value: r.odometer?.value ?? null, source: r.odometer === null ? null : SOURCE_KEY[r.odometer.source] },
      docs: exampleDocs(day),
      contact: { at: r.contact_at, unsent_at_contact: r.unsent_at_contact, stale: r.on_shift && staleSince(r.contact_at, now) },
      phone: driver?.phone ?? null, changed_at: changedAt(w, truck.id, today, now), example: true, simulated: r.simulated },
    at_stop_min: r.at_stop_min, on_shift: r.on_shift, not_started: r.not_started,
  };
}

/** Every row of the scope, in board order. */
function boardRows(w: World, scope: Scope, now: Instant): BoardRow[] {
  const lifts = liftsOf(openItems(w, scope, now));
  const pilot = w.trucks.filter((t) => t.pilot).map((t) => pilotRow(w, t, now, lifts));
  const example = scope === 'FLEET' ? w.exampleBoard.flatMap((r) => exampleRow(w, r, now, lifts) ?? []) : [];
  return [...pilot, ...example].sort((a, b) => compareBoard(a.row, b.row));
}

/** The board of §4.2 C-01: needs-action first, ties by plate. «Потребують дії» keeps ranks 1–4. */
export function fleetRows(w: World, scope: Scope, filter: 'ALL' | 'NEEDS_ACTION', now: Instant): FleetRow[] {
  return boardRows(w, scope, now).map((b) => b.row).filter((r) => filter === 'ALL' || lte(r.rank, 4));
}

/* ── the header and the tiles (§4.1, §4.2 C-01) ─────────────────────────── */

const TRUCK_FORMS = ['машина', 'машини', 'машин'] as const;
const NOT_STARTED_LINE: Record<NotStarted, (n: number) => string> = {
  MOVING_RUPTELA: (n) => `їдуть (Ruptela) · ${n} — зміна відкриється на першій зупинці`,
  REGIS_NO_DATA: (n) => `Регіс, без даних про рух · ${n} — перевірте в Регісі; дзвонити, лише якщо о 07:00 ще нічого`,
  ABSENT: (n) => `відсутній (план / табель) · ${n}`,
  AT_BASE: (n) => `стоять на базі (Ruptela) · ${n}`,
};
const NOT_STARTED_ORDER: readonly NotStarted[] = ['MOVING_RUPTELA', 'REGIS_NO_DATA', 'ABSENT', 'AT_BASE'];
const NO_CONTACT_LINE = "записи без зв'язку прийдуть самі, коли з'явиться інтернет · останній зв'язок — у рядку машини";

/** The header's user, clock and scope caption, the sidebar counts, the three StatTiles, who answers drivers now, and
 *  the lane footer's «Закрилось само сьогодні». */
export function summaryView(w: World, userId: string, scope: Scope, now: Instant): OfficeSummary {
  const u = userById(w, userId);
  const rows = boardRows(w, scope, now);
  const pilotCount = w.trucks.filter((t) => t.pilot).length;
  const all = pilotCount + w.exampleBoard.length;
  const caption = scope === 'PILOT'
    ? `Пілот: ${pluralN(pilotCount, TRUCK_FORMS)} · нижче — як це виглядатиме на всіх ${all}`
    : `Весь парк · ${pluralN(all, TRUCK_FORMS)} · приклад · потребують дії — зверху`;

  const late = rows.flatMap((r) => (r.not_started === null ? [] : [r.not_started]));
  const today = businessDate(now);
  const pilotIds = new Set(w.trucks.filter((t) => t.pilot).map((t) => t.id));
  const first = w.trips.filter((t) => t.date === today && t.planned_start !== null && pilotIds.has(t.truck_id))
    .flatMap((t) => (t.planned_start === null ? [] : [t.planned_start])).sort(cmpInstant)[0] ?? null;
  const notStartedLines = late.length !== 0
    ? NOT_STARTED_ORDER.flatMap((k) => { const n = late.filter((x) => x === k).length; return n === 0 ? [] : [NOT_STARTED_LINE[k](n)]; })
    : [first !== null && isBefore(now, first) ? `Перша зміна за планом — ${fmtTime(first)}` : 'Усі, хто за планом, на зміні'];

  const atStops = rows.filter((r) => r.at_stop_min !== null);
  const minutes = atStops.reduce((acc, r) => acc + (r.at_stop_min ?? 0), 0);
  const onCall = onCallAt(w, now);
  return {
    clock: now,
    user: { id: u?.id ?? userId, name: u?.full_name ?? '', initials: u?.initials ?? '', role: u?.role ?? 'OPERATOR',
      role_label: ROLE_LABEL[u?.role ?? 'OPERATOR'] },
    scope, caption, counts: counts(w, scope, now),
    tiles: {
      not_started: { value: late.length, lines: notStartedLines },
      at_stops: { value: atStops.length, line: `разом ${fmtDur(minutes)} на точках зараз` },
      no_contact: { value: rows.filter((r) => r.row.contact.stale).length, line: NO_CONTACT_LINE },
    },
    on_call: { name: onCall.name, until: onCall.until }, closed_today: closedToday(w, scope, now), example: scope === 'FLEET',
  };
}

/* ── requests and corrections (§4.2 C-05, C-06) ─────────────────────────── */

const isOpen = (q: Request, now: Instant): boolean => atOrBefore(q.created_at, now)
  && (q.done_at === null || isBefore(now, q.done_at)) && (q.cancelled_at === null || isBefore(now, q.cancelled_at));
/** The request still open on this record at `now` («one open request per target record», §7.3). */
export function openRequestOn(w: World, recordKey: string, now: Instant): Request | null {
  return w.requests.filter((q) => q.record_key === recordKey && isOpen(q, now))
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).at(-1) ?? null;
}
/** Where the request stands, in the words of the RequestTrack: «побачив 08:43» · «на телефоні 08:43» · «надіслано». */
export function requestState(q: Request, now: Instant): string {
  const seen = shown(q.seen_at, now);
  if (seen !== null) return `побачив ${fmtTime(seen)}`;
  const delivered = shown(q.delivered_at, now);
  return delivered !== null ? `на телефоні ${fmtTime(delivered)}` : 'надіслано';
}
/** «Не видно…» 2 h after sending, still unseen; «ще не на телефоні — телефон без зв'язку з 08:57» while it never
 *  reached a phone that has since gone quiet (a heartbeat comes every 30 s, so two silent minutes mean no signal). */
const QUIET_MIN = 2;
const UNSEEN_MIN = 120;
function unseenLine(w: World, q: Request, now: Instant): string | null {
  if (!isOpen(q, now) || shown(q.seen_at, now) !== null) return null;
  if (shown(q.delivered_at, now) === null) {
    const last = shown(w.devices.find((d) => d.id === q.device_id)?.last_contact_at ?? null, now);
    if (last === null) return 'ще не на телефоні';
    return gte(minutesBetween(last, now), QUIET_MIN) ? `ще не на телефоні — телефон без зв'язку з ${fmtTime(last)}` : null;
  }
  const waited = minutesBetween(q.created_at, now);
  return gte(waited, UNSEEN_MIN) ? `не побачив ${intDiv(waited, 60)} год` : null;
}
function requestOf(w: World, q: Request, now: Instant): RequestView {
  const page = q.page_key === null ? null : w.pages.find((p) => p.key === q.page_key) ?? null;
  return { id: q.id, type: q.type, target_label: page !== null ? pageTarget(w, page) : q.type === 'CALL_ME' ? 'Подзвонити диспетчеру' : 'Фото',
    reasons: [...q.reasons], by: userShort(w, q.created_by), unseen_line: unseenLine(w, q, now),
    states: { sent: q.created_at, delivered: shown(q.delivered_at, now), seen: shown(q.seen_at, now),
      done: shown(q.done_at, now), cancelled: shown(q.cancelled_at, now) } };
}
/** One retake (or call) request as the office tracks it: target, reasons, who sent it, its four states. */
export function requestView(w: World, requestId: string, now: Instant): RequestView | null {
  const q = w.requests.find((x) => x.id === requestId);
  return q === undefined ? null : requestOf(w, q, now);
}

function correctionOf(w: World, c: Correction): CorrectionView {
  return { id: c.id, record_key: c.record_key, field: c.field, old: c.old, new: c.new, reason: c.reason,
    driver_wording: DC.correctionWording[c.reason], by: userShort(w, c.by), at: c.at, needs_ack: c.needs_ack,
    ack: c.ack === null ? null : { ...c.ack } };
}
/** One correction: the struck old value, the new one, and the words the driver will read (§4.2 C-05, D-02). */
export function correctionView(w: World, correctionId: string): CorrectionView | null {
  const c = w.corrections.find((x) => x.id === correctionId);
  return c === undefined ? null : correctionOf(w, c);
}

/* ── the paper-mirror (§4.2 C-04) ───────────────────────────────────────── */

const PRINTED: readonly (readonly [TtnField, string, boolean])[] = [['no', 'ТТН №', true], ['date', 'Дата', true],
  ['shipper', 'Відправник', false], ['consignee', 'Одержувач', false], ['cargo', 'Вантаж', false],
  ['mass', 'Маса, т', true], ['compartments', 'Відсіки', false], ['seals', 'Пломби', false]];
const REVERSE_LOADING: readonly (readonly [TtnField, string])[] = [['arrival', 'Прибуття'], ['departure', 'Вибуття'],
  ['gross', 'Маса брутто, т']];
const REVERSE_DROP: readonly (readonly [TtnField, string])[] = [['drop_arrival', 'Прибуття'], ['drop_departure', 'Вибуття']];
/** The time fields of the reverse side, and the row a DROP stop writes them to. */
export const TIME_FIELDS: readonly TtnField[] = ['arrival', 'departure', 'drop_arrival', 'drop_departure'];
export function reverseField(kind: 'LOADING' | 'DROP', field: TtnField): TtnField {
  if (kind !== 'DROP') return field;
  return field === 'arrival' ? 'drop_arrival' : field === 'departure' ? 'drop_departure' : field;
}
const NOT_WAITING = 'не простій за Правилами (п.8.25), лише за договором';
const BLANK_REVERSE = 'У ТТН часу немає — рахується за записом водія, без відмітки';

/** What the stop is for, as the paper-mirror shows it; null for a stop that carries no ТТН (base, refuel, other). */
export function reviewKind(s: PlannedStop): 'LOADING' | 'DROP' | null {
  const kind = s.kind === 'UNPLANNED' ? s.unplanned_kind : s.kind;
  return kind === 'LOADING' || kind === 'DROP' ? kind : null;
}
/** The ТТН of a stop in the order the paper-mirror switches between them: `doc_index` is the 1-based position here. */
export function stopDocs(w: World, stop: PlannedStop, kind: 'LOADING' | 'DROP'): TtnDoc[] {
  return w.ttnDocs.filter((d) => (kind === 'LOADING' ? d.loading_stop_id : d.drop_stop_id) === stop.id)
    .sort((a, b) => cmpNum(a.doc_index, b.doc_index) || byCodepoint(a.no, b.no));
}

function fieldValue(d: TtnDoc, f: TtnField, now: Instant): TtnFieldValue | null {
  const v = d.fields[f];
  return v !== null && atOrBefore(v.at, now) ? v : null;
}
function sourceLine(w: World, v: TtnFieldValue | null): string | null {
  if (v === null) return null;
  const who = `${userShort(w, v.by)} ${fmtTime(v.at)}`;
  switch (v.source) {
    case 'OCR': return `OCR · підтвердила ${who}`;
    case 'OFFICE_TYPED': return `з фото · ввела ${who}`;
    case 'PLAN': return 'за планом';
  }
}
function fieldView(w: World, d: TtnDoc, f: TtnField, label: string, required: boolean, now: Instant): TtnFieldView {
  const v = fieldValue(d, f, now);
  return { field: f, label, value: v?.value ?? null, source: v?.source ?? null, source_line: sourceLine(w, v),
    ocr: d.ocr[f] ?? null, required };
}
/** «Прибуття за ТТН 07:48 · водій на місці з 06:10 → до відмітки 1 год 38 хв · …»: the ТТН mark against the driver's
 *  own arrival, once the office typed it; with «На звороті не заповнено», the driver's record stands alone. */
function derivedLine(d: TtnDoc, kind: 'LOADING' | 'DROP', f: StopFacts, now: Instant): TtnDocView['derived'] {
  if (d.blank_reverse) return { tone: 'hold', text: BLANK_REVERSE };
  const mark = fieldValue(d, kind === 'DROP' ? 'drop_arrival' : 'arrival', now)?.value ?? null;
  if (mark === null || f.arrived_at === null || !/^\d{2}:\d{2}$/.test(mark)) return null;
  const at = markAt(businessDate(f.arrived_at), mark);
  if (at === null) return null;
  return { tone: 'plain', text: `Прибуття за ТТН ${mark} · водій на місці з ${fmtTime(f.arrived_at)} → до відмітки `
    + `${fmtDur(Math.max(0, minutesBetween(f.arrived_at, at)))} · ${NOT_WAITING}` };
}
/** The handwritten mark as an instant on the stop's date; null for a wall time the clock skips (the spring-forward
 *  hour), which no derived line can honestly be computed from. */
function markAt(date: BusinessDate, hm: string): Instant | null {
  try {
    return kyiv(`${date} ${hm}`);
  } catch {
    return null;
  }
}
function docView(w: World, d: TtnDoc, i: number, n: number, kind: 'LOADING' | 'DROP', f: StopFacts, now: Instant): TtnDocView {
  const drop = w.plannedStops.find((s) => s.id === d.drop_stop_id) ?? null;
  const place = drop === null ? null : w.places.find((p) => p.id === drop.place_id) ?? null;
  const printed = PRINTED.map(([field, label, required]) => fieldView(w, d, field, label, required, now));
  return { id: d.id, doc_index: i, no: d.no,
    switch_label: `ТТН ${i} з ${n} · ${d.no}${place === null ? '' : ` → ${place.label}`}`,
    match_line: place === null || place.edrpou === null ? 'Вивантаження за ЄДРПОУ одержувача в плані не знайдено'
      : `Зіставлено з вивантаженням за ЄДРПОУ одержувача: ${place.short} (${place.edrpou})`,
    printed, reverse: (kind === 'DROP' ? REVERSE_DROP : REVERSE_LOADING).map(([field, label]) => fieldView(w, d, field, label, false, now)),
    blank_reverse: d.blank_reverse, printed_confirmed: printed.filter((p) => p.required && p.value !== null).length,
    printed_required: printed.filter((p) => p.required).length, derived: derivedLine(d, kind, f, now) };
}

const SIDE: Partial<Record<ArtefactKind, string>> = { TTN_FRONT: 'лицьовий бік', TTN_BACK: 'зворотний бік', TTN_SIGNED: 'з підписом' };
const OTHER: Partial<Record<ArtefactKind, string>> = { WEIGH_TICKET: 'Талон з ваг', ACT: 'Акт' };
const PAGE_ORDER: readonly ArtefactKind[] = ['TTN_FRONT', 'TTN_BACK', 'TTN_SIGNED', 'WEIGH_TICKET', 'ACT'];
const caption = (artefact: ArtefactKind, docIndex: number, n: number): string => {
  const side = SIDE[artefact];
  return side === undefined ? OTHER[artefact] ?? 'Фото' : `ТТН ${docIndex} з ${Math.max(n, docIndex)} · ${side}`;
};
/** The same page as a request names it — a COMMA, «ТТН 2 з 2, зворотний бік» (§4.2 C-06, and `pageTarget` for the
 *  driver's own card). The heading above uses a middot; a page cannot turn one into the other, so both are data. */
const targetLabel = (artefact: ArtefactKind, docIndex: number, n: number): string => {
  const side = SIDE[artefact];
  return side === undefined ? OTHER[artefact] ?? 'Фото' : `ТТН ${docIndex} з ${Math.max(n, docIndex)}, ${side}`;
};
/** «знято в застосунку 08:39 · 0,7 МБ» · «на стоянці 09:02» · «після виїзду 15:16» · «з галереї, файл від 12.09». */
function provenance(p: Page, day: BusinessDate): string {
  const at = fmtTime(p.captured_at);
  const how = p.deferred === 'AT_PARKING' ? `на стоянці ${at}` : p.deferred === 'AFTER_EXIT' ? `після виїзду ${at}`
    : businessDate(p.captured_at) !== day ? `з галереї, файл від ${fmtDayMonth(p.captured_at)}` : `знято в застосунку ${at}`;
  return `${how} · ${fmtBytes(p.bytes)}`;
}
/** A page the completion names but the phone has not passed on yet: the dashed slot «Фото ще в телефоні». Loading pages
 *  are taken front, back per ТТН; unloading pages are the signed ТТН in turn. */
function missingPages(f: StopFacts, w: World, n: number, now: Instant): PageView[] {
  const done = w.records.find((r) => r.key === f.completion_key) ?? null;
  if (done === null || (done.type !== 'LOADED' && done.type !== 'UNLOADED')) return [];
  const have = new Set(f.pages.filter((p) => p.received_at !== null && atOrBefore(p.received_at, now)).map((p) => p.key));
  return done.payload.pages.flatMap((key, i): PageView[] => {
    if (have.has(key)) return [];
    const loading = done.type === 'LOADED';
    const artefact: ArtefactKind = loading ? (i % 2 === 0 ? 'TTN_FRONT' : 'TTN_BACK') : 'TTN_SIGNED';
    const docIndex = loading ? intDiv(i, 2) + 1 : i + 1;
    return [{ key, record_key: done.key, artefact, doc_index: docIndex, page_no: loading ? (i % 2) + 1 : 1,
      caption: caption(artefact, docIndex, n), target_label: targetLabel(artefact, docIndex, n),
      provenance: 'ще в телефоні', received: false, drawn_variant: null, image: null,
      superseded_by: null, supersedes: null, request: null }];
  });
}
function pageViews(w: World, f: StopFacts, n: number, day: BusinessDate, now: Instant): PageView[] {
  const rank = (a: ArtefactKind): number => PAGE_ORDER.indexOf(a);
  const pages = f.pages.filter((p) => PAGE_ORDER.includes(p.artefact) && p.received_at !== null && atOrBefore(p.received_at, now))
    .sort((a, b) => cmpNum(a.doc_index, b.doc_index) || cmpNum(rank(a.artefact), rank(b.artefact)) || cmpNum(a.page_no, b.page_no)
      || cmpInstant(a.captured_at, b.captured_at) || byCodepoint(a.key, b.key));
  const newest = (key: string): Request | null => w.requests.filter((q) => q.page_key === key && atOrBefore(q.created_at, now))
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).at(-1) ?? null;
  const seen = pages.map((p): PageView => {
    const q = newest(p.key);
    const next = p.superseded_by === null ? null : pages.find((x) => x.key === p.superseded_by) ?? null;
    return { key: p.key, record_key: p.record_key, artefact: p.artefact, doc_index: p.doc_index, page_no: p.page_no,
      caption: caption(p.artefact, p.doc_index, n), target_label: targetLabel(p.artefact, p.doc_index, n),
      provenance: provenance(p, day), received: true,
      drawn_variant: p.drawn?.variant ?? null, image: p.image, superseded_by: next?.key ?? null,
      supersedes: pages.find((x) => x.superseded_by === p.key)?.key ?? null, request: q === null ? null : requestOf(w, q, now) };
  });
  return [...seen, ...missingPages(f, w, n, now)];
}

/** One stop as the paper-mirror shows it: the header lines, each ТТН with its printed and handwritten fields beside the
 *  pages in the same order, the requests on those pages, and whether the stop and its day are accepted. `null` for an
 *  unknown stop, one with no live record, or one that carries no ТТН. */
export function stopReviewView(w: World, stopId: string, now: Instant): StopReview | null {
  const stop = w.plannedStops.find((s) => s.id === stopId) ?? null;
  const kind = stop === null ? null : reviewKind(stop);
  const f = stop === null ? null : stopFacts(w, stop.id, now);
  if (stop === null || kind === null || f === null) return null;
  const records = liveRecords(w).filter((r) => r.stop_id === stop.id && atOrBefore(r.received_at, now));
  if (stop.kind === 'UNPLANNED' && records.length === 0) return null;
  const truck = w.trucks.find((t) => t.id === f.truck_id) ?? null;
  const trip = w.trips.find((t) => t.id === stop.trip_id) ?? null;
  const driver = w.drivers.find((d) => d.id === (records[0]?.driver_id ?? trip?.driver_id)) ?? null;
  const day = f.truck_day_id === null ? null : w.truckDays.find((d) => d.id === f.truck_day_id) ?? null;
  const date = day?.date ?? trip?.date ?? businessDate(f.arrived_at ?? now);

  const docs = stopDocs(w, stop, kind);
  const loaded = records.find((r) => r.type === 'LOADED');
  const n = Math.max(docs.length, loaded?.type === 'LOADED' ? loaded.payload.ttn_count : 0);
  const pages = pageViews(w, f, n, date, now);
  const ttnPages = new Set(pages.filter((p) => p.received && SIDE[p.artefact] !== undefined)
    .map((p) => `${p.artefact}:${p.doc_index}:${p.page_no}`)).size;
  const completion = records.find((r) => r.key === f.completion_key) ?? null;
  const onSite = f.arrived_at === null ? null
    : f.completed_at === null ? `на місці з ${fmtTime(f.arrived_at)}` : `на місці ${fmtTime(f.arrived_at)}–${fmtTime(f.completed_at)}`;
  const line = [driver?.short_name ?? null, onSite, completion === null ? null : `записано ${fmtTime(completion.committed_at)}`,
    n === 0 ? null : `${n} ТТН, ${ttnPages} стор.`].filter((x) => x !== null).join(' · ');

  const keys = new Set(records.map((r) => r.key));
  const requests = w.requests.filter((q) => atOrBefore(q.created_at, now) && (q.stop_id === stop.id || keys.has(q.record_key)))
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).map((q) => requestOf(w, q, now));
  const accepted = f.accepted_at === null ? null : { by: userShort(w, stop.accepted_by), at: f.accepted_at };
  return {
    stop: { id: stop.id, kind, title: `${f.place.town} · ${kind === 'LOADING' ? 'завантаження' : 'вивантаження'} · `
      + `${truck?.plate ?? '—'} · ${fmtDayMonth(date)}`, line },
    truck: { plate: truck?.plate ?? '—' }, driver: { short: driver?.short_name ?? '—', phone: driver?.phone ?? null },
    docs: docs.map((d, i) => docView(w, d, i + 1, docs.length, kind, f, now)), pages, requests,
    status: accepted === null ? 'REVIEW' : 'ACCEPTED', accepted,
    day_status: f.truck_day_id === null ? 'OPEN' : truckDayStatus(w, f.truck_day_id), truck_day_id: f.truck_day_id ?? '',
  };
}
