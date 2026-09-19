// mocks/driver-report/src/api/handlers/office.ts
/** Operations 10–17 of §7.4: the console's summary, the fleet board, the two lanes and what the office does to an
 *  item, the paper-mirror of a stop, a retake request and a correction. Thin: every answer is built by
 *  `src/domain/views/office.ts` and the derivations; a handler reads `s.stores` / `s.world()` at call time (the stage's
 *  reset replaces them), uses `c.now` and never the wall clock, stores what the office did, writes the audit line,
 *  bumps the truck-day's `version` on a data change (§7.3) and tells the other panes through `s.wrote`.
 *
 *  Refusals (§7.5) are literal per operation — `fail('getStopReview', 'STOP_NOT_FOUND', …)` and
 *  `fail('reviewStop', 'STOP_NOT_FOUND', …)` are two call sites, never one helper — or a rule's refusal from
 *  `src/domain/refusals.ts` passed through that operation's own `fail('<op>', r.code, r.message, r.ctx)`.
 *
 *  Every `by` / `created_by` / `accepted_by` stores the office user's STORE id (`user-000001`), never the actor id.
 *
 *  No return-type annotation on `officeHandlers`: an annotation widens the map and blinds the exactness sink in
 *  routes.ts. */
import { asInstant, byCodepoint, pageQuery, type HandlerCtxOf, type Instant, type Paginated } from '@agency/mock';
import { fmtKm, fmtTime } from '../../app/format';
import { OC } from '../../copy/office';
import { atOrBefore, businessDate, cmpInstant } from '../../domain/clock';
import { liveRecords, truckDayIdFor, truckDayStatus } from '../../domain/derive';
import { itemById, openItems, resolvedToday } from '../../domain/exceptions';
import { lt, toInt } from '../../domain/num';
import { badOdometer, badTime, dayConfirmed } from '../../domain/refusals';
import { RETAKE_REASONS, type DriverRecord, type Odometer, type OfficeUser, type RetakeReason, type Scope, type TtnField,
  type TtnFieldValue, type World } from '../../domain/types';
import { pageTarget } from '../../domain/views/driver';
import { correctionView, fleetRows, openRequestOn, requestState, requestView, reverseField, reviewKind, stopDocs,
  stopReviewView, summaryView, TIME_FIELDS } from '../../domain/views/office';
import { fail, type Api } from '../contract';
import { SAYS_CORRECTION, SAYS_EXCEPTION, SAYS_REQUEST, SAYS_STOP_REVIEW } from '../says';
import type { Server } from '../server';

/* ── the wire's query ───────────────────────────────────────────────────── */

const one = (q: Record<string, string | string[]>, key: string): string | null => {
  const v = q[key];
  return typeof v === 'string' && v !== '' ? v : null;
};
const scopeOf = (q: Record<string, string | string[]>): Scope => (one(q, 'scope') === 'FLEET' ? 'FLEET' : 'PILOT');
/** A page of rows by the wire's `page` / `limit` (limit capped at 100), chunked rather than multiplied. */
function paged<T>(rows: readonly T[], query: Record<string, string | string[]>): Paginated<T> {
  const { page, limit } = pageQuery(query);
  let start = 0;
  for (let p = 1; p !== page && lt(start, rows.length); p += 1) start += limit;
  return { data: rows.slice(start, start + limit), total: rows.length, page, limit };
}

/* ── who is acting ──────────────────────────────────────────────────────── */

/** The console's actor is `'user-' + login` (§7.8). An actor the office does not know — the scaffold's placeholder
 *  before the profile is wired — acts as the office's operator rather than taking the whole console down with a 500. */
function officeUser(w: World, actorId: string): OfficeUser {
  const u = w.officeUsers.find((x) => `user-${x.login}` === actorId) ?? w.officeUsers.find((x) => x.role === 'OPERATOR')
    ?? w.officeUsers[0];
  if (u === undefined) throw new Error('office: the seed has no office user');
  return u;
}

/* ── what a record says ─────────────────────────────────────────────────── */

const odometerOf = (r: DriverRecord): Odometer | null => {
  switch (r.type) {
    case 'SHIFT_START': case 'SHIFT_END': case 'ARRIVED': case 'REFUEL': case 'DOCS_ADDED': return r.payload.odometer;
    default: return null;
  }
};
/** The live record with this key the server had received by `now`: a voided or unknown one is no target (§7.5). */
const liveRecord = (w: World, key: string, now: Instant): DriverRecord | null =>
  liveRecords(w).find((r) => r.key === key && atOrBefore(r.received_at, now)) ?? null;
/** The value the office holds now: the newest correction of that field, else what the driver sent. */
function currentValue(w: World, r: DriverRecord, field: 'odometer' | 'occurred_at', now: Instant): string {
  const last = w.corrections.filter((x) => x.record_key === r.key && x.field === field && atOrBefore(x.at, now))
    .sort((a, b) => cmpInstant(a.at, b.at) || byCodepoint(a.id, b.id)).at(-1);
  if (last !== undefined) return last.new;
  if (field === 'occurred_at') return fmtTime(r.occurred_at);
  const value = odometerOf(r)?.value ?? null;
  return value === null ? '—' : String(value);
}
/** The driver confirmed this value himself (typed it, kept it, or answered the check), so the correction asks for his
 *  «Згоден / Не згоден» (§4.2 C-05, D-02). A CAN reading or an unread photo he never saw asks nothing. */
function driverConfirmed(r: DriverRecord, field: 'odometer' | 'occurred_at'): boolean {
  if (field === 'occurred_at') return true;
  const odo = odometerOf(r);
  return odo !== null && odo.value !== null && odo.choice !== 'AUTO' && odo.choice !== 'UNREAD';
}
const hhmm = (digits: string): string => `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;

/** The audit words of a typed field: «Ввела час прибуття 07:48 · ТТН 004517». */
const FIELD_WORDS: Record<TtnField, string> = { no: 'номер ТТН', date: 'дату', shipper: 'відправника', consignee: 'одержувача',
  cargo: 'вантаж', mass: 'масу', compartments: 'відсіки', seals: 'пломби', arrival: 'час прибуття', departure: 'час вибуття',
  gross: 'масу брутто', drop_arrival: 'час прибуття', drop_departure: 'час вибуття' };
const PRINTED_FIELDS: readonly TtnField[] = ['no', 'date', 'shipper', 'consignee', 'cargo', 'mass', 'compartments', 'seals'];

export function officeHandlers(s: Server) {
  /** A change to a truck-day's data moves its version (§7.3), which is what a confirm on a stale view trips over. */
  const bump = (dayId: string | null): void => {
    const day = dayId === null ? undefined : s.stores.truckDays.get(dayId);
    if (day !== undefined) s.stores.truckDays.update(day.id, { version: day.version + 1 });
  };
  const audit = (u: OfficeUser, now: Instant, action: string, target: string, detail: string, dayId: string | null): void => {
    s.stores.audit.create({ at: now, actor_id: u.id, role: u.role, action, target, detail, truck_day_id: dayId });
  };

  return {
    /** The header, the sidebar counts and the three tiles of «Парк зараз» (§4.1, §4.2 C-01). */
    getOfficeSummary: (c: HandlerCtxOf<Api, 'getOfficeSummary'>) => {
      const w = s.world();
      return summaryView(w, officeUser(w, c.actor.id).id, scopeOf(c.query), asInstant(c.now));
    },

    /** The board: needs-action first; «Потребують дії» keeps ranks 1–4. */
    listFleet: (c: HandlerCtxOf<Api, 'listFleet'>) => {
      const filter = one(c.query, 'filter') === 'NEEDS_ACTION' ? 'NEEDS_ACTION' : 'ALL';
      return paged(fleetRows(s.world(), scopeOf(c.query), filter, asInstant(c.now)), c.query);
    },

    /** One lane: the open items oldest first, then what closed today — muted, so «З'ясувала Н. Шевчук 10:14» and
     *  «~~318 405~~ → 381 405» survive the refetch. `total` counts both. */
    listExceptions: (c: HandlerCtxOf<Api, 'listExceptions'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const scope = scopeOf(c.query);
      const lane = one(c.query, 'lane') === 'REVIEW' ? 'REVIEW' : 'NOW';
      const open = openItems(w, scope, now, lane);
      const ids = new Set(open.map((i) => i.id));
      return paged([...open, ...resolvedToday(w, scope, now, lane).filter((i) => !ids.has(i.id))], c.query);
    },

    /** «Взяти в роботу» · «З'ясовано» · «Прийняти як є»: a Resolution on an item still open. One that closed meanwhile —
     *  by itself, or by someone else — is refused (§7.5), and the list refetches. */
    updateException: (c: HandlerCtxOf<Api, 'updateException'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const item = itemById(w, c.params.id, now);
      if (item === null || item.resolved !== null) {
        fail('updateException', 'EXCEPTION_NOT_FOUND', SAYS_EXCEPTION.EXCEPTION_NOT_FOUND, { id: c.params.id });
      }
      const u = officeUser(w, c.actor.id);
      const res = s.stores.resolutions.create({ item_id: item.id, code: item.code, action: c.body.action,
        reason: c.body.reason ?? null, by: u.id, at: now });
      s.wrote('updateException', c, { truck_day_id: item.truck_day_id, result_id: res.id, highlight: false });
      const after = itemById(s.world(), item.id, now);
      if (after === null) throw new Error(`updateException: item «${item.id}» vanished while being stored`);
      return after;
    },

    /** The paper-mirror of one stop (§4.2 C-04). */
    getStopReview: (c: HandlerCtxOf<Api, 'getStopReview'>) => {
      const view = stopReviewView(s.world(), c.params.id, asInstant(c.now));
      if (view === null) fail('getStopReview', 'STOP_NOT_FOUND', SAYS_STOP_REVIEW.STOP_NOT_FOUND, { id: c.params.id });
      return view;
    },

    /** «Прийняти друковані» · a handwritten time typed beside the photo · «На звороті не заповнено» · «Прийняти
     *  зупинку». Each is one audit line, one version, one highlight. */
    reviewStop: (c: HandlerCtxOf<Api, 'reviewStop'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const view = stopReviewView(w, c.params.id, now);
      const stop = w.plannedStops.find((p) => p.id === c.params.id);
      const kind = stop === undefined ? null : reviewKind(stop);
      if (view === null || stop === undefined || kind === null) {
        fail('reviewStop', 'STOP_NOT_FOUND', SAYS_STOP_REVIEW.STOP_NOT_FOUND, { id: c.params.id });
      }
      const locked = dayConfirmed({ status: view.day_status });
      if (locked !== null) fail('reviewStop', locked.code, locked.message, locked.ctx);
      const u = officeUser(w, c.actor.id);
      const body = c.body;
      const dayId = view.truck_day_id === '' ? null : view.truck_day_id;
      const town = w.places.find((p) => p.id === stop.place_id)?.town ?? '';

      if (body.action === 'ACCEPT_STOP') {
        if (stop.accepted_at !== null && atOrBefore(stop.accepted_at, now)) return view;   // a second click stamps nothing
        s.stores.plannedStops.update(stop.id, { accepted_at: now, accepted_by: u.id });
        // An office acceptance satisfies the retake requests still open on the stop's pages (§7.3 «Requests»).
        const keys = new Set(view.pages.map((p) => p.record_key));
        for (const q of w.requests) {
          if ((q.stop_id === stop.id || keys.has(q.record_key)) && q.done_at === null && q.cancelled_at === null) {
            s.stores.requests.update(q.id, { done_at: now });
          }
        }
        audit(u, now, 'ACCEPT_STOP', stop.id, `Прийняла зупинку ${town}`, dayId);
      } else {
        const index = body.doc_index ?? 1;
        const doc = stopDocs(w, stop, kind)[index - 1];
        if (doc === undefined) {
          fail('reviewStop', 'VALUE_INVALID', 'Такої ТТН на цій зупинці немає.', { doc_index: index });
        }
        if (body.action === 'ACCEPT_PRINTED') {
          const fields = { ...doc.fields };
          for (const f of PRINTED_FIELDS) {
            const ocr = doc.ocr[f];
            if (ocr !== null && fields[f]?.source !== 'OFFICE_TYPED') fields[f] = { value: ocr, source: 'OCR', by: u.id, at: now };
          }
          s.stores.ttnDocs.update(doc.id, { fields });
          audit(u, now, 'ACCEPT_PRINTED', doc.no, `Прийняла друковані поля ТТН ${doc.no}`, dayId);
        } else if (body.action === 'MARK_BLANK_REVERSE') {
          s.stores.ttnDocs.update(doc.id, { blank_reverse: !doc.blank_reverse });
          audit(u, now, 'MARK_BLANK_REVERSE', doc.no, doc.blank_reverse
            ? `Зняла позначку «На звороті не заповнено» · ТТН ${doc.no}` : `На звороті не заповнено · ТТН ${doc.no}`, dayId);
        } else {
          const asked = body.field;
          if (asked === undefined) fail('reviewStop', 'VALUE_INVALID', SAYS_STOP_REVIEW.VALUE_INVALID, { field: null });
          const field = reverseField(kind, asked);
          const raw = (body.value ?? '').trim();
          let value: TtnFieldValue | null;
          if (TIME_FIELDS.includes(field)) {
            const bad = badTime(raw);
            if (bad !== null) fail('reviewStop', bad.code, bad.message, bad.ctx);
            value = { value: hhmm(raw), source: 'OFFICE_TYPED', by: u.id, at: now };
          } else {
            value = raw === '' ? null : { value: raw, source: 'OFFICE_TYPED', by: u.id, at: now };
          }
          s.stores.ttnDocs.update(doc.id, { fields: { ...doc.fields, [field]: value } });
          audit(u, now, 'SET_FIELD', doc.no, value === null ? `Очистила ${FIELD_WORDS[field]} · ТТН ${doc.no}`
            : `Ввела ${FIELD_WORDS[field]} ${value.value} · ТТН ${doc.no}`, dayId);
        }
      }
      bump(dayId);
      s.wrote('reviewStop', c, { truck_day_id: dayId, result_id: stop.id, highlight: true });
      const after = stopReviewView(s.world(), stop.id, now);
      if (after === null) throw new Error(`reviewStop: stop «${stop.id}» vanished while being reviewed`);
      return after;
    },

    /** «Попросити перезняти» (§4.2 C-06): one open request per record; a second is refused with who asked, when, and
     *  how far it got — the envelope's ctx fills «Уже запитано: Н. Шевчук 08:43 · побачив 08:43». */
    createRequest: (c: HandlerCtxOf<Api, 'createRequest'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const body = c.body;
      const record = liveRecord(w, body.record_key, now);
      const page = body.page_key === undefined ? null
        : w.pages.find((p) => p.key === body.page_key && p.received_at !== null && atOrBefore(p.received_at, now)) ?? null;
      if (record === null || (body.page_key !== undefined && page === null)) {
        fail('createRequest', 'TARGET_NOT_FOUND', SAYS_REQUEST.TARGET_NOT_FOUND, { record_key: body.record_key });
      }
      const open = openRequestOn(w, record.key, now);
      if (open !== null) {
        const by = w.officeUsers.find((x) => x.id === open.created_by)?.short_name ?? open.created_by;
        fail('createRequest', 'REQUEST_ALREADY_OPEN', SAYS_REQUEST.REQUEST_ALREADY_OPEN,
          { by, at: open.created_at, state: requestState(open, now) });
      }
      const u = officeUser(w, c.actor.id);
      const reasons = body.reasons.filter((r): r is RetakeReason => (RETAKE_REASONS as readonly string[]).includes(r));
      const q = s.stores.requests.create({ type: body.type, record_key: record.key, page_key: page?.key ?? null,
        stop_id: record.stop_id, device_id: record.device_id, reasons, created_by: u.id, created_at: now, delivered_at: null,
        seen_at: null, done_at: null, cancelled_at: null, reply: null });
      const dayId = record.truck_day_id ?? truckDayIdFor(w, record.truck_id, businessDate(record.occurred_at));
      audit(u, now, 'CREATE_REQUEST', record.key,
        page === null ? 'Попросила подзвонити' : `Попросила перезняти ${pageTarget(w, page)}`, dayId);
      s.wrote('createRequest', c, { truck_day_id: dayId, result_id: q.id, highlight: true });
      const view = requestView(s.world(), q.id, now);
      if (view === null) throw new Error(`createRequest: request «${q.id}» vanished while being stored`);
      return view;
    },

    /** «Виправити» (§4.2 C-05): the driver's value stays, struck; the office's replaces it with a reason. A confirmed
     *  day is refused, and so is a value that is not one (an odometer of 1–7 digits, a time of four). */
    createCorrection: (c: HandlerCtxOf<Api, 'createCorrection'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const body = c.body;
      const record = liveRecord(w, body.record_key, now);
      if (record === null) {
        fail('createCorrection', 'TARGET_NOT_FOUND', SAYS_CORRECTION.TARGET_NOT_FOUND, { record_key: body.record_key });
      }
      const dayId = record.truck_day_id ?? truckDayIdFor(w, record.truck_id, businessDate(record.occurred_at));
      const locked = dayConfirmed({ status: dayId === null ? 'OPEN' : truckDayStatus(w, dayId) });
      if (locked !== null) fail('createCorrection', locked.code, locked.message, locked.ctx);
      const bad = body.field === 'odometer' ? badOdometer(body.value) : badTime(body.value);
      if (bad !== null) fail('createCorrection', bad.code, bad.message, bad.ctx);

      const u = officeUser(w, c.actor.id);
      const old = currentValue(w, record, body.field, now);
      const next = body.field === 'odometer' ? String(toInt(body.value)) : hhmm(body.value);
      const x = s.stores.corrections.create({ record_key: record.key, field: body.field, old, new: next, reason: body.reason,
        note: body.note ?? null, by: u.id, role: u.role, at: now, needs_ack: driverConfirmed(record, body.field), ack: null });
      // A correction of the record satisfies a request still open on it (§7.3 «Requests»).
      const open = openRequestOn(w, record.key, now);
      if (open !== null) s.stores.requests.update(open.id, { done_at: now });
      const shown = (v: string): string => (body.field === 'odometer' && /^\d+$/.test(v) ? fmtKm(toInt(v)) : v);
      audit(u, now, 'CREATE_CORRECTION', record.key, `Виправила ${body.field === 'odometer' ? 'одометр' : 'час'} `
        + `${shown(old)} → ${shown(next)} · ${OC.correctionReasons[body.reason].toLowerCase()}`, dayId);
      bump(dayId);
      s.wrote('createCorrection', c, { truck_day_id: dayId, result_id: x.id, highlight: true });
      const view = correctionView(s.world(), x.id);
      if (view === null) throw new Error(`createCorrection: correction «${x.id}» vanished while being stored`);
      return view;
    },
  };
}
