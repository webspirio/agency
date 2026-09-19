// mocks/driver-report/src/domain/exceptions.ts
/** Exceptions are derived, resolutions are stored (§7.3, §4.2 C-02, C-03, 02 UC-O03). Every item is a code's predicate
 *  evaluated over what the server knew at `now` — the records it had received, the pages it had received, the
 *  telemetry whose moment had passed — and it lasts exactly as long as that predicate holds and no `RESOLVE` /
 *  `ACCEPT_AS_IS` Resolution names it. Nothing here is stored except by the office: an item closes by itself when a
 *  photo arrives, a stop is accepted, a day is confirmed or CAN shows motion, because the predicate stops holding.
 *
 *  Resolutions are read as stored: a Resolution exists only once the office made it, so it is never time-gated.
 *  Corrections and requests carry their own moment and are read up to `now`, as derive.ts reads them.
 *
 *  Scope: `PILOT` is the trucks with `pilot: true`, `FLEET` every truck. The fleet example's items (`exampleItems`) join
 *  only in `FLEET` and only once they happened; there, the pilot's own «Звірте з фото» gives way to the fleet's.
 *
 *  No `*`, `/` or relational operator: whole minutes and counts go through num.ts. */
import { byCodepoint } from '@agency/mock';
import { fmtKm, fmtTime, NBSP, pluralN } from '../app/format';
import { OC } from '../copy/office';
import { addMinutes, atOrBefore, businessDate, cmpInstant, daysBetween, isBefore, kyiv, minutesBetween } from './clock';
import { liveRecords, stopFacts, truckDayIdFor, truckDayStatus, visibleTelemetry, type StopFacts } from './derive';
import type { Counts, ExceptionEvidence, ExceptionItem } from './dto';
import { gte, intDiv } from './num';
import { RESOLVE_REASONS, type BusinessDate, type DriverRecord, type ExceptionCode, type FlagCode, type Instant,
  type Odometer, type OdometerSource, type Page, type PlannedStop, type RecordOf, type Resolution, type ResolveReason,
  type Scope, type Tone, type Truck, type World } from './types';

type Lane = ExceptionItem['lane'];
type Group = ExceptionItem['group'];
type Primary = ExceptionItem['primary_action'];

/** Lane, group, tone and primary action of every code (§4.2 C-02, C-03; §6.6 office tones). */
const SHAPE: Record<ExceptionCode, { lane: Lane; group: Group; tone: Tone; primary: Primary }> = {
  NO_TTN_AT_DEPARTURE: { lane: 'NOW', group: null, tone: 'reject', primary: 'CALL' },
  ACCIDENT: { lane: 'NOW', group: null, tone: 'reject', primary: 'CALL' },
  SEAL_PROBLEM: { lane: 'NOW', group: null, tone: 'reject', primary: 'CALL' },
  BREAKDOWN_CANT_DRIVE: { lane: 'NOW', group: null, tone: 'hold', primary: 'CALL' },
  DISCREPANCY: { lane: 'NOW', group: null, tone: 'hold', primary: 'CALL' },
  NOT_ACCEPTED: { lane: 'NOW', group: null, tone: 'hold', primary: 'CALL' },
  NOT_LOADED: { lane: 'NOW', group: null, tone: 'hold', primary: 'CALL' },
  LOADED_NOT_RECORDED: { lane: 'NOW', group: null, tone: 'hold', primary: 'CALL' },
  CALL_ME: { lane: 'NOW', group: null, tone: 'hold', primary: 'CALL' },
  SHIFT_NOT_STARTED: { lane: 'NOW', group: null, tone: 'hold', primary: 'CALL' },
  NO_SIGNED_TTN: { lane: 'REVIEW', group: 'MONEY', tone: 'hold', primary: 'CALL' },
  STOP_REVIEW: { lane: 'REVIEW', group: 'MONEY', tone: 'hold', primary: 'CHECK' },
  TTN_NO_MASS: { lane: 'REVIEW', group: 'MONEY', tone: 'hold', primary: 'RESOLVE' },
  ODOMETER_TYPED: { lane: 'REVIEW', group: 'ODOMETER', tone: 'hold', primary: 'FIX' },
  ODOMETER_BACKWARDS: { lane: 'REVIEW', group: 'ODOMETER', tone: 'hold', primary: 'FIX' },
  ODOMETER_JUMP: { lane: 'REVIEW', group: 'ODOMETER', tone: 'hold', primary: 'FIX' },
  ODOMETER_STALE: { lane: 'REVIEW', group: 'ODOMETER', tone: 'hold', primary: 'FIX' },
  ODOMETER_UNREAD: { lane: 'REVIEW', group: 'ODOMETER', tone: 'hold', primary: 'FIX' },
  ODOMETER_OFF_PLAN: { lane: 'REVIEW', group: 'ODOMETER', tone: 'hold', primary: 'FIX' },
  SAMPLE_CHECK: { lane: 'REVIEW', group: 'ODOMETER', tone: 'hold', primary: 'SAMPLE' },
  IMAGE_QUALITY_LOW: { lane: 'REVIEW', group: 'OTHER', tone: 'hold', primary: 'RETAKE' },
  PAYMENT_METHOD_PENDING: { lane: 'REVIEW', group: 'OTHER', tone: 'hold', primary: 'RESOLVE' },
  PLACE_UNKNOWN: { lane: 'REVIEW', group: 'OTHER', tone: 'hold', primary: 'RESOLVE' },
  LATE_RECORD_ON_CONFIRMED_DAY: { lane: 'REVIEW', group: 'OTHER', tone: 'hold', primary: 'OPEN_DAY' },
  PLAN_MISMATCH_TRUCK: { lane: 'REVIEW', group: 'OTHER', tone: 'hold', primary: 'RESOLVE' },
  PLAN_MISMATCH_TRAILER: { lane: 'REVIEW', group: 'OTHER', tone: 'hold', primary: 'RESOLVE' },
};

/** «Закрилось само сьогодні» of the fleet example: what the other 97 trucks closed by themselves, rendered «приклад».
 *  With beat 10's 9 accepted pilot stops and 1 retake done, the fleet footer reads 23 (C-02). */
const FLEET_CLOSED_EXAMPLE = 13;
/** 02 UC-O03: `SHIFT_NOT_STARTED` only 60 min after the planned start; `NO_SIGNED_TTN` 2 h after the unloading. */
const SHIFT_GRACE_MIN = 60;
const SIGNED_GRACE_MIN = 120;
/** §7.3: the day's odometer sample opens at 16:00; it holds at least two readings (§4.2 C-03). */
const SAMPLE_FROM = '16:00';
const SAMPLE_MIN = 2;
/** §7.3 originals: a ТТН whose paper is not in the office 3 days after its date. */
const ORIGINAL_DAYS = 3;

/** The order in which one record's odometer flags name its item (§7.3 exceptions table). */
const ODOMETER_ORDER: readonly FlagCode[] = ['ODOMETER_TYPED', 'ODOMETER_BACKWARDS', 'ODOMETER_JUMP', 'ODOMETER_OFF_PLAN',
  'ODOMETER_STALE', 'ODOMETER_UNREAD'];
const MOMENT: Partial<Record<DriverRecord['type'], string>> = { SHIFT_START: 'початок зміни', ARRIVED: 'прибуття',
  REFUEL: 'заправка', SHIFT_END: 'кінець зміни', DOCS_ADDED: 'фото після виїзду' };
/** How the reading was taken, in the office's neutral wording (02 X8). */
const SOURCE_WORDS: Record<OdometerSource, string> = { CAN: 'CAN', DASH_PHOTO: 'з фото щитка',
  PLAN_CONFIRMED: 'підтверджено за планом', DRIVER_TYPED: 'введено вручну', UNREAD: 'фото не прочитано',
  OFFICE_EDIT: 'виправлено офісом', OFFICE_CALC: 'розраховано офісом', OFFICE_FROM_CALL: 'зі слів водія' };
/** A photo's quality reasons as the capture review names them (§3.3 D-06), lower-case inside a title. */
const QUALITY_WORDS: Record<string, string> = { GLARE: 'відблиск', BLUR: 'розмито', DARK: 'темно', CLOSER: 'здалеку',
  CROPPED: 'обрізано' };
const TTN_KINDS: readonly Page['artefact'][] = ['TTN_FRONT', 'TTN_BACK', 'TTN_SIGNED'];
const NO_TTN_TITLE = `Завантажено без ТТН · штраф 17${NBSP}000 грн`;
const FIELDS_FORMS = ['поле зміниться', 'поля зміняться', 'полів зміниться'] as const;

/* ── what the server knew at `now` ─────────────────────────────────────── */

type Raw = { item: ExceptionItem; truck_id: string | null };
type Ctx = { w: World; scope: Scope; now: Instant; today: BusinessDate; records: DriverRecord[];
  facts: (stopId: string | null) => StopFacts | null };

const inScope = (w: World, scope: Scope, truckId: string | null): boolean =>
  scope === 'FLEET' || (truckId !== null && (w.trucks.find((t) => t.id === truckId)?.pilot ?? false));
const received = (p: Page, now: Instant): boolean => p.received_at !== null && atOrBefore(p.received_at, now);
const kindOf = (s: PlannedStop): string | null => (s.kind === 'UNPLANNED' ? s.unplanned_kind : s.kind);
const odometerOf = (r: DriverRecord): Odometer | null => {
  switch (r.type) {
    case 'SHIFT_START': case 'SHIFT_END': case 'ARRIVED': case 'REFUEL': case 'DOCS_ADDED': return r.payload.odometer;
    default: return null;
  }
};
const byOpened = (a: Raw, b: Raw): number => cmpInstant(a.item.opened_at, b.item.opened_at) || byCodepoint(a.item.id, b.item.id);

function context(w: World, scope: Scope, now: Instant): Ctx {
  const records = liveRecords(w).filter((r) => atOrBefore(r.received_at, now) && inScope(w, scope, r.truck_id));
  const memo = new Map<string, StopFacts | null>();
  const facts = (stopId: string | null): StopFacts | null => {
    if (stopId === null) return null;
    if (!memo.has(stopId)) memo.set(stopId, stopFacts(w, stopId, now));
    return memo.get(stopId) ?? null;
  };
  return { w, scope, now, today: businessDate(now), records, facts };
}

/** One derived item: lane, group, tone and primary from the code; meta, age, phone and the retake line from the rows. */
function mk(c: Ctx, p: { code: ExceptionCode; ref: string; title: string; opened_at: Instant; truck_id: string;
  driver_id: string | null; place_id: string | null; truck_day_id: string | null; stop_id?: string | null;
  record_key?: string | null; page_key?: string | null; evidence?: ExceptionEvidence | null }): Raw {
  const shape = SHAPE[p.code];
  const truck = c.w.trucks.find((t) => t.id === p.truck_id) ?? null;
  const driver = c.w.drivers.find((d) => d.id === p.driver_id) ?? null;
  const town = c.w.places.find((x) => x.id === p.place_id)?.town ?? null;
  const target = { stop_id: p.stop_id ?? null, record_key: p.record_key ?? null, page_key: p.page_key ?? null };
  return { truck_id: p.truck_id, item: { id: `${p.code}:${p.ref}`, code: p.code, lane: shape.lane, group: shape.group,
    tone: shape.tone, title: p.title, meta: [truck?.plate ?? null, driver?.short_name ?? null, town].filter((x) => x !== null).join(' · '),
    opened_at: p.opened_at, age_min: Math.max(0, minutesBetween(p.opened_at, c.now)), evidence: p.evidence ?? null,
    primary_action: shape.primary, taken_by: null, resolved: null,
    truck_day_id: p.truck_day_id, truck_plate: truck?.plate ?? '', target, request_line: requestLine(c, target),
    phone: driver?.phone ?? null, example: false } };
}
/** «запит надіслано 08:43» while the item's stop (or record) has an open retake request. */
function requestLine(c: Ctx, target: ExceptionItem['target']): string | null {
  if (target.stop_id === null && target.record_key === null) return null;
  const open = c.w.requests.filter((q) => q.type === 'RETAKE_PHOTO' && atOrBefore(q.created_at, c.now)
    && (q.done_at === null || isBefore(c.now, q.done_at)) && (q.cancelled_at === null || isBefore(c.now, q.cancelled_at))
    && (target.stop_id !== null ? q.stop_id === target.stop_id : q.record_key === target.record_key))
    .sort((a, b) => cmpInstant(a.created_at, b.created_at) || byCodepoint(a.id, b.id)).at(-1);
  return open === undefined ? null : `запит надіслано ${fmtTime(open.created_at)}`;
}
const dayOf = (c: Ctx, r: DriverRecord): string | null =>
  r.truck_day_id ?? truckDayIdFor(c.w, r.truck_id, businessDate(r.occurred_at));
/** A record's item, placed at its stop when it has one. */
function fromRecord(c: Ctx, r: DriverRecord, code: ExceptionCode, title: string, extra: { ref?: string; opened_at?: Instant;
  page_key?: string | null; evidence?: ExceptionEvidence | null } = {}): Raw {
  const f = c.facts(r.stop_id);
  return mk(c, { code, ref: extra.ref ?? r.key, title, opened_at: extra.opened_at ?? r.occurred_at, truck_id: r.truck_id,
    driver_id: r.driver_id, place_id: f?.place.id ?? r.place_id ?? (r.type === 'SHIFT_END' ? r.payload.place_id : null),
    truck_day_id: f?.truck_day_id ?? dayOf(c, r), stop_id: r.stop_id, record_key: r.key, page_key: extra.page_key ?? null,
    evidence: extra.evidence ?? null });
}

/* ── the predicates (§7.3 exceptions table) ─────────────────────────────── */

const ttnSlots = (pages: Page[], now: Instant, kinds: readonly Page['artefact'][] = TTN_KINDS): number =>
  new Set(pages.filter((p) => kinds.includes(p.artefact) && received(p, now)).map((p) => `${p.artefact}:${p.doc_index}:${p.page_no}`)).size;
/** How many ТТН a stop carries: the loading's own count, else the plan's, else the documents photographed. */
function ttnCount(f: StopFacts, c: Ctx): number {
  const loaded = c.records.find((r): r is RecordOf<'LOADED'> => r.key === f.completion_key && r.type === 'LOADED');
  if (loaded !== undefined) return Math.max(loaded.payload.ttn_count, 1);
  if (f.stop.ttn_nos.length !== 0) return f.stop.ttn_nos.length;
  return Math.max(new Set(f.pages.filter((p) => TTN_KINDS.includes(p.artefact)).map((p) => p.doc_index)).size, 1);
}
const dayConfirmed = (c: Ctx, dayId: string | null): boolean => dayId !== null && truckDayStatus(c.w, dayId) === 'CONFIRMED';

function recordItems(c: Ctx): Raw[] {
  const out: Raw[] = [];
  const recs = c.records;
  for (const r of recs) {
    switch (r.type) {
      case 'LOADED': {
        if (r.payload.no_doc_reason !== 'SHIPPER_REFUSED') break;
        const f = c.facts(r.stop_id);
        const pages = f?.pages ?? c.w.pages.filter((p) => p.record_key === r.key);
        if (ttnSlots(pages, c.now, ['TTN_FRONT', 'TTN_BACK']) !== 0) break;   // a ТТН photo arrived
        out.push(fromRecord(c, r, 'NO_TTN_AT_DEPARTURE', NO_TTN_TITLE, { ref: r.stop_id ?? r.key }));
        break;
      }
      case 'ROAD_STOP': {
        if (r.payload.reason === 'ACCIDENT') out.push(fromRecord(c, r, 'ACCIDENT', 'ДТП'));
        if (r.payload.reason !== 'BREAKDOWN' || r.payload.can_drive !== false) break;
        const ended = recs.some((e) => e.type === 'ROAD_STOP_END' && e.payload.road_stop_key === r.key);
        const truck = c.w.trucks.find((t) => t.id === r.truck_id);
        const moved = truck?.telematics === 'RUPTELA'
          && visibleTelemetry(c.w, r.truck_id, c.now).some((t) => t.kind === 'MOTION' && isBefore(r.occurred_at, t.at));
        if (!ended && !moved) out.push(fromRecord(c, r, 'BREAKDOWN_CANT_DRIVE', 'Поломка — не можу їхати'));
        break;
      }
      case 'STOP_PROBLEM': {
        const f = c.facts(r.stop_id);
        const ref = r.stop_id ?? r.key;
        const kind = r.payload.kind;
        if (kind === 'SEAL') out.push(fromRecord(c, r, 'SEAL_PROBLEM', 'Проблема з пломбою — вантаж не приймати', { ref }));
        if (kind === 'DISCREPANCY') out.push(fromRecord(c, r, 'DISCREPANCY', 'Нестача · акт складається', { ref }));
        if (kind === 'NOT_ACCEPTED' && (f === null || f.completed_at === null)) {
          const label = f?.place.label ?? c.w.places.find((p) => p.id === r.place_id)?.label ?? '';
          out.push(fromRecord(c, r, 'NOT_ACCEPTED', `Не приймають · ${label}`, { ref }));
        }
        const loadedHere = recs.some((x) => x.type === 'LOADED' && x.stop_id !== null && x.stop_id === r.stop_id);
        if (kind === 'NOT_LOADED' && !loadedHere) out.push(fromRecord(c, r, 'NOT_LOADED', 'Не завантажили', { ref }));
        break;
      }
      case 'CALL_ME':
        out.push(fromRecord(c, r, 'CALL_ME', 'Подзвоніть мені'));
        break;
      case 'REQUEST_REPLY':
        if (r.payload.reply === 'CALL_ME') out.push(fromRecord(c, r, 'CALL_ME', 'Подзвоніть мені'));
        break;
      case 'UNLOADED': {
        if (!gte(minutesBetween(r.occurred_at, c.now), SIGNED_GRACE_MIN)) break;
        const f = c.facts(r.stop_id);
        const pages = f?.pages ?? c.w.pages.filter((p) => p.record_key === r.key);
        const docsAdded = recs.some((x) => x.type === 'DOCS_ADDED' && (x.stop_id === null ? false : x.stop_id === r.stop_id));
        if (docsAdded || ttnSlots(pages, c.now, ['TTN_SIGNED']) !== 0) break;
        const hours = intDiv(minutesBetween(r.occurred_at, c.now), 60);
        out.push(fromRecord(c, r, 'NO_SIGNED_TTN', `Підписаної ТТН немає ${hours} год · рахунок не виставити`,
          { ref: r.stop_id ?? r.key, opened_at: addMinutes(r.occurred_at, SIGNED_GRACE_MIN) }));
        break;
      }
      case 'ARRIVED': {
        if (!r.payload.new_place) break;
        const place = c.w.places.find((p) => p.id === r.place_id) ?? null;
        const near = place === null || place.near_code === null ? null : c.w.places.find((p) => p.code === place.near_code) ?? null;
        const km = place?.near_km ?? null;
        const tail = near === null || km === null ? '' : ` · ${km} км від «${near.label}»`;
        out.push(fromRecord(c, r, 'PLACE_UNKNOWN', `Нове місце ${fmtTime(r.occurred_at)}${tail}`));
        break;
      }
      case 'SHIFT_START':
        if (!r.payload.plan_match) out.push(planMismatch(c, r));
        break;
      default:
        break;
    }
    const odo = odometerItem(c, r);
    if (odo !== null && !corrected(c, r.key)) out.push(odo);
    if (r.flags.includes('LATE_RECORD_ON_CONFIRMED_DAY') && !reconfirmedAfter(c, r)) {
      // The fields a late record moves on the confirmed waybill: its time, its reading, its documents.
      const n = 1 + ((odometerOf(r)?.value ?? null) === null ? 0 : 1) + (c.w.pages.some((p) => p.record_key === r.key) ? 1 : 0);
      out.push(fromRecord(c, r, 'LATE_RECORD_ON_CONFIRMED_DAY', `Запис надійшов після підтвердження · ${pluralN(n, FIELDS_FORMS)}`));
    }
  }
  return out;
}

/** «Ватаманюк на АР 6618 ЕС · за планом АР 1234 ВС» (§4.2 C-03): the truck when it differs, else the trailer. */
function planMismatch(c: Ctx, r: RecordOf<'SHIFT_START'>): Raw {
  const trip = c.w.trips.filter((t) => t.driver_id === r.driver_id && t.date === businessDate(r.occurred_at))
    .sort((a, b) => byCodepoint(a.no, b.no))[0] ?? null;
  const plate = (id: string | null | undefined, rows: readonly { id: string; plate: string }[]): string =>
    rows.find((x) => x.id === id)?.plate ?? '—';
  const truckDiffers = trip === null ? !r.flags.includes('PLAN_MISMATCH_TRAILER') : trip.truck_id !== r.payload.truck_id;
  const who = c.w.drivers.find((d) => d.id === r.driver_id)?.short_name.split(' ')[0] ?? '';
  const [code, actual, planned] = truckDiffers
    ? ['PLAN_MISMATCH_TRUCK', plate(r.payload.truck_id, c.w.trucks), plate(trip?.truck_id, c.w.trucks)] as const
    : ['PLAN_MISMATCH_TRAILER', plate(r.payload.trailer_id, c.w.trailers), plate(trip?.trailer_id, c.w.trailers)] as const;
  return fromRecord(c, r, code, `${who} на ${actual} · за планом ${planned}`);
}

/** An odometer correction the office had made by `now` closes the record's odometer item. */
const correctionsOf = (c: Ctx, recordKey: string) =>
  c.w.corrections.filter((x) => x.record_key === recordKey && x.field === 'odometer' && atOrBefore(x.at, c.now))
    .sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id));
const corrected = (c: Ctx, recordKey: string): boolean => correctionsOf(c, recordKey).length !== 0;
/** The day was confirmed again after the late record arrived: its figures already carry it. */
function reconfirmedAfter(c: Ctx, r: DriverRecord): boolean {
  const day = c.w.truckDays.find((d) => d.id === dayOf(c, r));
  return day?.status === 'CONFIRMED' && day.confirmed_at !== null && isBefore(r.received_at, day.confirmed_at);
}

/** One item per record with an odometer flag, named by the first of TYPED, BACKWARDS, JUMP, OFF_PLAN, STALE, UNREAD;
 *  «Одометр: початок зміни 05:40» with the value line «318 405 · введено вручну · очікували ~381 402 · водій залишив
 *  як є». Corrections are the caller's to apply. */
function odometerItem(c: Ctx, r: DriverRecord): Raw | null {
  const flag = ODOMETER_ORDER.find((f) => r.flags.includes(f));
  if (flag === undefined) return null;
  const odo = odometerOf(r);
  const text = odo === null ? '—' : [fmtKm(odo.value), SOURCE_WORDS[odo.source],
    odo.expected === null ? null : `очікували ~${fmtKm(odo.expected)}`,
    odo.choice === 'KEPT_AS_IS' ? 'водій залишив як є' : null].filter((x) => x !== null).join(' · ');
  return fromRecord(c, r, flag as ExceptionCode, `Одометр: ${MOMENT[r.type] ?? 'запис'} ${fmtTime(r.occurred_at)}`,
    { page_key: odo?.page_key ?? null, evidence: { kind: 'line', text } });
}

/** «ТТН 2 з 2, зворотний — відблиск · водій залишив так»: a low page nobody replaced and nobody accepted. */
function qualityItems(c: Ctx): Raw[] {
  const byKey = new Map(c.records.map((r) => [r.key, r]));
  const out: Raw[] = [];
  for (const p of c.w.pages) {
    const r = byKey.get(p.record_key);
    if (p.quality !== 'LOW' || r === undefined || !received(p, c.now)) continue;
    const next = p.superseded_by === null ? undefined : c.w.pages.find((x) => x.key === p.superseded_by);
    if (next !== undefined && received(next, c.now)) continue;
    const f = c.facts(r.stop_id);
    if (f !== null && (f.accepted_at !== null || dayConfirmed(c, f.truck_day_id))) continue;
    const reasons = p.quality_reasons.map((x) => QUALITY_WORDS[x] ?? x.toLowerCase()).join(', ') || 'нечітко видно';
    out.push(fromRecord(c, r, 'IMAGE_QUALITY_LOW', `${pageLabel(c, p, r, f)} — ${reasons} · водій залишив так`,
      { ref: p.key, page_key: p.key, evidence: p.drawn === null ? null : { kind: 'thumb', variant: p.drawn.variant } }));
  }
  return out;
}
function pageLabel(c: Ctx, p: Page, r: DriverRecord, f: StopFacts | null): string {
  const n = r.type === 'LOADED' ? Math.max(r.payload.ttn_count, p.doc_index) : Math.max(f === null ? 0 : ttnCount(f, c), p.doc_index);
  switch (p.artefact) {
    case 'TTN_FRONT': return `ТТН ${p.doc_index} з ${n}, лицьовий`;
    case 'TTN_BACK': return `ТТН ${p.doc_index} з ${n}, зворотний`;
    case 'TTN_SIGNED': return `ТТН ${p.doc_index} з ${n}, з підписом`;
    case 'RECEIPT': return 'Чек';
    case 'CLUSTER': return 'Фото щитка';
    case 'WEIGH_TICKET': return 'Талон з ваг';
    case 'ACT': return 'Акт';
  }
}

/** Stop-level items: STOP_REVIEW for a stop with ТТН pages the office has not accepted, and on R+C LOADED_NOT_RECORDED
 *  for a loading the truck left (Ruptela OUT) while its driver was on shift, with nothing recorded. */
function stopItems(c: Ctx): Raw[] {
  const trucks = new Map(c.w.trucks.map((t): [string, Truck] => [t.id, t]));
  const trips = new Map(c.w.trips.map((t) => [t.id, t]));
  const ids = new Set(c.records.flatMap((r) => (r.stop_id === null ? [] : [r.stop_id])));
  for (const s of c.w.plannedStops) {
    const truckId = trips.get(s.trip_id)?.truck_id ?? null;
    if (truckId !== null && trucks.get(truckId)?.telematics === 'RUPTELA' && kindOf(s) === 'LOADING') ids.add(s.id);
  }
  const out: Raw[] = [];
  for (const id of [...ids].sort(byCodepoint)) {
    const f = c.facts(id);
    if (f === null || !inScope(c.w, c.scope, f.truck_id)) continue;
    const kind = kindOf(f.stop);
    const pages = f.pages.filter((p) => TTN_KINDS.includes(p.artefact) && received(p, c.now));
    if (pages.length !== 0 && f.accepted_at === null && !dayConfirmed(c, f.truck_day_id)) {
      const first = c.records.filter((r) => pages.some((p) => p.record_key === r.key))
        .sort((a, b) => cmpInstant(a.occurred_at, b.occurred_at))[0];
      const word = kind === 'LOADING' ? 'завантаження' : kind === 'DROP' ? 'вивантаження' : 'зупинка';
      out.push(mk(c, { code: 'STOP_REVIEW', ref: id, opened_at: first?.occurred_at ?? f.completed_at ?? c.now,
        title: `${f.place.town} · ${word} · ${ttnCount(f, c)} ТТН, ${ttnSlots(pages, c.now)} стор. · поля не підтверджено`,
        truck_id: f.truck_id, driver_id: driverAt(c, f), place_id: f.place.id, truck_day_id: f.truck_day_id, stop_id: id,
        record_key: f.completion_key }));
    }
    const out_at = f.departure?.kind === 'RUPTELA' ? f.departure.at : null;
    if (kind === 'LOADING' && f.completion_key === null && out_at !== null && onShift(c, f.truck_id, out_at)) {
      out.push(mk(c, { code: 'LOADED_NOT_RECORDED', ref: id, opened_at: out_at,
        title: `Виїхав з «${f.place.label}» ${fmtTime(out_at)} · завантаження не записано`, truck_id: f.truck_id,
        driver_id: driverAt(c, f), place_id: f.place.id, truck_day_id: f.truck_day_id, stop_id: id, record_key: null }));
    }
  }
  return out;
}
function driverAt(c: Ctx, f: StopFacts): string | null {
  return c.records.find((r) => r.stop_id === f.stop.id)?.driver_id
    ?? c.w.trips.find((t) => t.id === f.stop.trip_id)?.driver_id ?? null;
}
const onShift = (c: Ctx, truckId: string, at: Instant): boolean => c.w.shifts.some((s) => s.truck_id === truckId
  && atOrBefore(s.started_at, at) && (s.ended_at === null || atOrBefore(at, s.ended_at)));

/** «Стоїть на базі, зміни немає»: 60 min after the planned start, a bound phone and no shift today — and only where the
 *  truck is KNOWN to stand at base: Ruptela places it there and it has not moved today. On Регіс motion is unknown, so
 *  nothing is raised (02 UC-O01, 04 EC-113: no calls are manufactured). */
function notStartedItems(c: Ctx): Raw[] {
  const out: Raw[] = [];
  const trips = c.w.trips.filter((t) => t.date === c.today && t.planned_start !== null && inScope(c.w, c.scope, t.truck_id)
    && gte(minutesBetween(t.planned_start, c.now), SHIFT_GRACE_MIN)).sort((a, b) => byCodepoint(a.no, b.no));
  const seen = new Set<string>();
  for (const t of trips) {
    if (seen.has(t.truck_id)) continue;
    seen.add(t.truck_id);
    const bound = c.w.devices.some((d) => d.driver_id === t.driver_id && d.bound_at !== null && atOrBefore(d.bound_at, c.now)
      && (d.revoked_at === null || isBefore(c.now, d.revoked_at)));
    const started = c.w.shifts.some((s) => s.truck_id === t.truck_id && businessDate(s.started_at) === c.today
      && atOrBefore(s.started_at, c.now));
    if (!bound || started || !standsAtBase(c, t.truck_id)) continue;
    const base = c.w.places.find((p) => p.kind === 'BASE')?.id ?? null;
    out.push(mk(c, { code: 'SHIFT_NOT_STARTED', ref: t.id, title: 'Стоїть на базі, зміни немає',
      opened_at: addMinutes(t.planned_start ?? c.now, SHIFT_GRACE_MIN), truck_id: t.truck_id, driver_id: t.driver_id,
      place_id: base, truck_day_id: null }));
  }
  return out;
}
function standsAtBase(c: Ctx, truckId: string): boolean {
  if (c.w.trucks.find((t) => t.id === truckId)?.telematics !== 'RUPTELA') return false;
  const tel = visibleTelemetry(c.w, truckId, c.now);
  if (tel.some((t) => (t.kind === 'OUT' || t.kind === 'MOTION') && businessDate(t.at) === c.today)) return false;
  const isBase = (id: string | null): boolean => c.w.places.find((p) => p.id === id)?.kind === 'BASE';
  const lastTel = tel.filter((t) => t.place_id !== null).at(-1) ?? null;
  const lastRec = liveRecords(c.w).filter((r) => r.truck_id === truckId && atOrBefore(r.received_at, c.now)
    && (r.place_id ?? (r.type === 'SHIFT_END' ? r.payload.place_id : null)) !== null).at(-1) ?? null;
  if (lastTel !== null && (lastRec === null || !isBefore(lastTel.at, lastRec.occurred_at))) return isBase(lastTel.place_id);
  return lastRec !== null && isBase(lastRec.place_id ?? (lastRec.type === 'SHIFT_END' ? lastRec.payload.place_id : null));
}

/** «Звірте з фото: k з n сьогодні» — from 16:00, the day's photographed readings (source ФОТО or ПЛАН ✓, not the
 *  zero-km start at base); the sample holds every ПЛАН ✓ reading and at least two, never more than there are. */
function sampleItem(c: Ctx): Raw | null {
  const from = kyiv(`${c.today} ${SAMPLE_FROM}`);
  if (isBefore(c.now, from)) return null;
  const readings = c.records.flatMap((r) => {
    const odo = odometerOf(r);
    if (odo === null || businessDate(r.occurred_at) !== c.today || corrected(c, r.key)) return [];
    return (odo.source === 'DASH_PHOTO' || odo.source === 'PLAN_CONFIRMED') && odo.basis !== 'LAST_AT_BASE' ? [odo] : [];
  });
  const n = readings.length;
  if (n === 0) return null;
  const k = Math.min(Math.max(SAMPLE_MIN, readings.filter((o) => o.source === 'PLAN_CONFIRMED').length), n);
  return { truck_id: null, item: { id: `SAMPLE_CHECK:sample:${c.today}`, code: 'SAMPLE_CHECK', lane: 'REVIEW',
    group: 'ODOMETER', tone: 'hold', title: `Звірте з фото: ${k} з ${n} сьогодні`,
    meta: 'Пілот · показання одометра з фото за сьогодні', opened_at: from, age_min: Math.max(0, minutesBetween(from, c.now)),
    evidence: null, primary_action: 'SAMPLE', taken_by: null, resolved: null, truck_day_id: null, truck_plate: '',
    target: { stop_id: null, record_key: null, page_key: null }, request_line: null, phone: null, example: false } };
}

/** The fleet example's items (§7.6), as they stand once they happened. The fleet's sample names no truck's fault: the
 *  row hangs on a truck only because a row needs one, so the item carries no plate and no day, like the pilot's. */
function exampleItems(c: Ctx): Raw[] {
  return c.w.exampleItems.filter((x) => atOrBefore(x.opened_at, c.now)).map((x): Raw => {
    const sample = x.code === 'SAMPLE_CHECK';
    return { truck_id: x.truck_id, item: {
      id: `${x.code}:ex:${x.id}`, code: x.code, lane: x.lane, group: x.group, tone: x.tone, title: x.title, meta: x.meta,
      opened_at: x.opened_at, age_min: Math.max(0, minutesBetween(x.opened_at, c.now)),
      evidence: x.evidence === null ? null : { kind: 'line', text: x.evidence }, primary_action: SHAPE[x.code].primary,
      taken_by: null, resolved: null, truck_day_id: sample ? null : truckDayIdFor(c.w, x.truck_id, c.today),
      truck_plate: sample ? '' : c.w.trucks.find((t) => t.id === x.truck_id)?.plate ?? '',
      target: { stop_id: null, record_key: x.target_record_key, page_key: null }, request_line: null, phone: x.phone,
      example: true } };
  });
}

/** Every item whose predicate holds at `now` in `scope`, resolutions not yet applied, oldest first. */
function rawItems(w: World, scope: Scope, now: Instant): Raw[] {
  const c = context(w, scope, now);
  const derived = [...recordItems(c), ...qualityItems(c), ...stopItems(c), ...notStartedItems(c)];
  const out = new Map<string, Raw>();
  for (const r of derived) if (!out.has(r.item.id)) out.set(r.item.id, r);
  if (scope === 'PILOT') {
    const sample = sampleItem(c);
    if (sample !== null) out.set(sample.item.id, sample);
  } else {
    for (const r of exampleItems(c)) out.set(r.item.id, r);
  }
  return [...out.values()].sort(byOpened);
}

/* ── resolutions ────────────────────────────────────────────────────────── */

const byAt = (a: Resolution, b: Resolution): number => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id);
const closing = (w: World, id: string): Resolution | null =>
  w.resolutions.filter((x) => x.item_id === id && (x.action === 'RESOLVE' || x.action === 'ACCEPT_AS_IS')).sort(byAt).at(-1) ?? null;
const user = (w: World, id: string) => w.officeUsers.find((u) => u.id === id) ?? null;
const reasonWord = (reason: string | null): string =>
  reason === null ? '' : (RESOLVE_REASONS as readonly string[]).includes(reason) ? OC.resolveReasons[reason as ResolveReason] : reason;

/** The item with «в роботі: НШ» from the newest TAKE and, once closed, «З'ясувала Н. Шевчук 10:14». */
function decorate(w: World, item: ExceptionItem): ExceptionItem {
  const take = w.resolutions.filter((x) => x.item_id === item.id && x.action === 'TAKE').sort(byAt).at(-1) ?? null;
  const done = closing(w, item.id);
  return { ...item, taken_by: take === null ? null : user(w, take.by)?.initials ?? take.by,
    resolved: done === null ? null
      : { by: user(w, done.by)?.short_name ?? done.by, at: done.at, reason: reasonWord(done.reason), correction: null } };
}

/* ── the public face (I-12) ─────────────────────────────────────────────── */

/** The open items of `scope` at `now`, oldest first; one lane when `lane` is given. */
export function openItems(w: World, scope: Scope, now: Instant, lane?: 'NOW' | 'REVIEW'): ExceptionItem[] {
  return rawItems(w, scope, now).map((r) => decorate(w, r.item))
    .filter((i) => i.resolved === null && (lane === undefined || i.lane === lane));
}

/** One item by id, open or closed today, in any scope — what `updateException` returns after storing a Resolution. */
export function itemById(w: World, id: string, now: Instant): ExceptionItem | null {
  for (const scope of ['FLEET', 'PILOT'] as const) {
    const hit = rawItems(w, scope, now).find((r) => r.item.id === id);
    if (hit !== undefined) return decorate(w, hit.item);
  }
  for (const scope of ['FLEET', 'PILOT'] as const) {
    for (const lane of ['NOW', 'REVIEW'] as const) {
      const hit = resolvedToday(w, scope, now, lane).find((i) => i.id === id);
      if (hit !== undefined) return hit;
    }
  }
  return null;
}

/** Sidebar counts (§5.6): open items per lane, READY days, originals overdue ≥ 3 days, CONFIRMED days not yet in BAS. */
export function counts(w: World, scope: Scope, now: Instant): Counts {
  const open = openItems(w, scope, now);
  const today = businessDate(now);
  const days = w.truckDays.filter((d) => inScope(w, scope, d.truck_id));
  const truckOfDoc = (driverId: string, stopId: string | null): string | null => {
    const stop = w.plannedStops.find((s) => s.id === stopId);
    const trip = stop === undefined ? undefined : w.trips.find((t) => t.id === stop.trip_id);
    return trip?.truck_id ?? w.drivers.find((d) => d.id === driverId)?.truck_id ?? null;
  };
  return {
    now: open.filter((i) => i.lane === 'NOW').length,
    review: open.filter((i) => i.lane === 'REVIEW').length,
    days_to_confirm: days.filter((d) => truckDayStatus(w, d.id) === 'READY').length,
    originals: w.ttnDocs.filter((d) => d.original === null && gte(daysBetween(d.date, today), ORIGINAL_DAYS)
      && inScope(w, scope, truckOfDoc(d.driver_id, d.loading_stop_id))).length,
    bas_ready: days.filter((d) => truckDayStatus(w, d.id) === 'CONFIRMED' && d.exported === null).length,
  };
}

/** «Закрилось само сьогодні»: today's accepted stops and done requests in scope (+ the fleet example's 13). */
export function closedToday(w: World, scope: Scope, now: Instant): number {
  const today = businessDate(now);
  const isToday = (at: Instant | null): at is Instant => at !== null && atOrBefore(at, now) && businessDate(at) === today;
  const trips = new Map(w.trips.map((t) => [t.id, t]));
  const stops = w.plannedStops.filter((s) => isToday(s.accepted_at) && inScope(w, scope, trips.get(s.trip_id)?.truck_id ?? null));
  const truckOfRequest = (recordKey: string, deviceId: string): string | null =>
    w.records.find((r) => r.key === recordKey)?.truck_id
      ?? w.drivers.find((d) => d.id === w.devices.find((x) => x.id === deviceId)?.driver_id)?.truck_id ?? null;
  const requests = w.requests.filter((q) => isToday(q.done_at) && inScope(w, scope, truckOfRequest(q.record_key, q.device_id)));
  return stops.length + requests.length + (scope === 'FLEET' ? FLEET_CLOSED_EXAMPLE : 0);
}

/** Items of today closed by a `RESOLVE` / `ACCEPT_AS_IS` Resolution or by a Correction, newest first, each with
 *  `resolved` filled — what `listExceptions` appends after the open items (C-02 «З'ясувала …», C-05 «~~old~~ → new»).
 *  They are never counted. */
export function resolvedToday(w: World, scope: Scope, now: Instant, lane: 'NOW' | 'REVIEW'): ExceptionItem[] {
  const today = businessDate(now);
  const out = new Map<string, ExceptionItem>();
  const put = (item: ExceptionItem): void => {
    const had = out.get(item.id);
    if (had === undefined || (had.resolved !== null && item.resolved !== null && isBefore(had.resolved.at, item.resolved.at))) {
      out.set(item.id, item);
    }
  };

  // Closed by the office: the item as it stands now, or — when its predicate has since stopped holding — as it stood
  // when it was closed.
  const atNow = new Map(rawItems(w, scope, now).map((r) => [r.item.id, r.item]));
  const atThen = new Map<Instant, Map<string, ExceptionItem>>();
  const ids = [...new Set(w.resolutions.map((x) => x.item_id))].sort(byCodepoint);
  for (const id of ids) {
    const done = closing(w, id);
    if (done === null || businessDate(done.at) !== today) continue;
    let item = atNow.get(id);
    if (item === undefined) {
      if (!atThen.has(done.at)) atThen.set(done.at, new Map(rawItems(w, scope, done.at).map((r) => [r.item.id, r.item])));
      item = atThen.get(done.at)?.get(id);
    }
    if (item !== undefined) put(decorate(w, item));
  }

  // Closed by a correction of the record the odometer item named.
  const c = context(w, scope, now);
  for (const x of w.corrections) {
    if (x.field !== 'odometer' || !atOrBefore(x.at, now) || businessDate(x.at) !== today) continue;
    const r = c.records.find((rec) => rec.key === x.record_key);
    const odo = r === undefined ? null : odometerItem(c, r);
    if (odo === null) continue;
    const last = correctionsOf(c, x.record_key).at(-1);
    if (last?.id !== x.id) continue;
    const by = user(w, x.by)?.short_name ?? x.by;
    put({ ...decorate(w, odo.item), resolved: { by, at: x.at, reason: OC.correctionReasons[x.reason].toLowerCase(),
      correction: { old: x.old, new: x.new } } });
  }

  return [...out.values()].filter((i) => i.lane === lane)
    .sort((a, b) => cmpInstant(b.resolved?.at ?? b.opened_at, a.resolved?.at ?? a.opened_at) || byCodepoint(a.id, b.id));
}
