// mocks/driver-report/src/api/handlers/driver.ts
/** Operations 1–7 of §7.4: binding, the driver's today, the places near him, and the three writes the phone's outbox
 *  makes (records, photos, heartbeats). Thin: every rule lives in `src/domain/views/driver.ts` and the derivations; a
 *  handler reads `s.stores` / `s.world()` at call time (the stage's reset replaces them), uses `c.now` and never the
 *  wall clock, stores what the domain returns, and tells the other panes through `s.wrote`.
 *
 *  The driver meets exactly two refusals (§7.5): BIND_CODE_EXPIRED and DEVICE_REVOKED. A driver's write is never refused
 *  for what it says — an odd value lands with a flag. Each refusal is its operation's own literal `fail(...)`.
 *
 *  No return-type annotation on `driverHandlers`: an annotation widens the map and blinds the exactness sink in
 *  routes.ts. */
import { asInstant, pageQuery, type HandlerCtxOf, type Instant, type Paginated } from '@agency/mock';
import { atOrBefore, businessDate } from '../../domain/clock';
import { newTtnDocs, truckDayIdFor } from '../../domain/derive';
import { lt } from '../../domain/num';
import type { DriverRecord, FlagCode, Payloads, PlannedStop } from '../../domain/types';
import { bindPreviewView, bindStatus, codeAt, currentTrip, displayName, driverToast, nearbyPlaceOptions, recordFlags,
  refuelCompletedBy, shiftForRecord, stopNamed, todayTruckId, todayView, tripsOf } from '../../domain/views/driver';
import { fail, type Api } from '../contract';
import { SAYS_BIND, SAYS_DRIVER_WRITE } from '../says';
import type { Server } from '../server';

/** A timestamp off the wire, or `fallback` when the phone sent something that is not one: a driver's write is never
 *  refused for its content (§7.5). */
function instantOr(raw: string, fallback: Instant): Instant {
  try {
    return asInstant(raw);
  } catch {
    return fallback;
  }
}
/** A page of rows by the wire's `page` / `limit` (limit capped at 100), chunked rather than multiplied. */
function paged<T>(rows: readonly T[], query: Record<string, string | string[]>): Paginated<T> {
  const { page, limit } = pageQuery(query);
  let start = 0;
  for (let p = 1; p !== page && lt(start, rows.length); p += 1) start += limit;
  return { data: rows.slice(start, start + limit), total: rows.length, page, limit };
}

export function driverHandlers(s: Server) {
  const phone = (id: string) => {
    const device = s.stores.devices.get(id);
    if (device === undefined) throw new Error(`driver: no phone «${id}»`);
    return device;
  };

  return {
    /** «Це ви?» binds nothing; the first look at a live code marks it opened (C-16 checklist step 1). */
    getBindPreview: (c: HandlerCtxOf<Api, 'getBindPreview'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const view = bindPreviewView(w, c.params.code, now);
      const code = codeAt(w, c.params.code, now);
      if (view.status === 'VALID' && code !== null && code.opened_at === null) {
        s.stores.bindCodes.update(code.id, { opened_at: now });
        s.wrote('getBindPreview', c, { truck_day_id: null, result_id: code.id, highlight: true });
      }
      return view;
    },

    /** «Так, це я»: the phone takes the code's driver; the code is spent. */
    confirmBinding: (c: HandlerCtxOf<Api, 'confirmBinding'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const code = codeAt(w, c.params.code, now);
      const driver = code === null ? undefined : w.drivers.find((d) => d.id === code.driver_id);
      if (code === null || driver === undefined || bindStatus(code, now) !== 'VALID') {
        fail('confirmBinding', 'BIND_CODE_EXPIRED', SAYS_BIND.BIND_CODE_EXPIRED);
      }
      const device = phone(c.actor.id);
      s.stores.devices.update(device.id, { driver_id: driver.id, bound_at: now, bound_by: code.created_by, revoked_at: null });
      s.stores.bindCodes.update(code.id, { used_at: now, device_id: device.id, opened_at: code.opened_at ?? now });
      s.wrote('confirmBinding', c, { truck_day_id: null, result_id: device.id, highlight: true });
      return { device_id: device.id, driver_id: driver.id, driver_name: displayName(driver), bound_at: now };
    },

    /** The raw facts of the phone's day. A request this answer carries for the first time is delivered now (§7.3). */
    getToday: (c: HandlerCtxOf<Api, 'getToday'>) => {
      const now = asInstant(c.now);
      const w = s.world();
      const truckId = todayTruckId(w, c.actor.id, now);
      const view = todayView(w, c.actor.id, now, {
        speed_kmh: truckId === null ? null : s.toggles.speed[truckId] ?? null,
        gps_lost: truckId === null ? false : s.toggles.gpsLost[truckId] ?? false,
      });
      const fresh = view.requests.filter((q) => s.stores.requests.get(q.id)?.delivered_at === null);
      for (const q of fresh) s.stores.requests.update(q.id, { delivered_at: now });
      if (fresh.length !== 0) s.wrote('getToday', c, { truck_day_id: null, result_id: fresh[0]?.id ?? null, highlight: false });
      return view;
    },

    /** «Де ви?»: the planned stops still ahead and the library's places near the one he is not at (D-12). */
    listNearbyPlaces: (c: HandlerCtxOf<Api, 'listNearbyPlaces'>) => {
      const raw = c.query['stop_id'];
      const stopId = typeof raw === 'string' && raw !== '' ? raw : null;
      return paged(nearbyPlaceOptions(s.world(), c.actor.id, stopId, asInstant(c.now)), c.query);
    },

    /** One record from the phone's outbox. Answered with the record's own key («В офісі ✓» needs exactly that, EC-139);
     *  a key already held answers with that record and changes nothing (EC-137). */
    submitRecord: (c: HandlerCtxOf<Api, 'submitRecord'>) => {
      const now = asInstant(c.now);
      const body = c.body;
      const device = phone(c.actor.id);
      const committed = instantOr(body.committed_at, now);
      if (device.revoked_at !== null && atOrBefore(device.revoked_at, committed)) {
        fail('submitRecord', 'DEVICE_REVOKED', SAYS_DRIVER_WRITE.DEVICE_REVOKED);
      }
      const held = s.world().records.find((r) => r.key === body.key);
      if (held !== undefined) return { key: held.key, id: held.id, received_at: held.received_at, duplicate: true };
      if (device.driver_id === null) throw new Error(`submitRecord: phone «${device.id}» is not bound to a driver`);
      const driverId = device.driver_id;
      const occurred = instantOr(body.occurred_at, now);
      const w0 = s.world();
      const driver = w0.drivers.find((d) => d.id === driverId);

      // The shift and the truck-day the record belongs to. A shift start opens both; the day is truck × the Kyiv date of
      // the start, so a record after midnight keeps the shift's day (EC-147).
      let shiftId: string | null;
      let truckId: string;
      let dayId: string | null;
      if (body.type === 'SHIFT_START') {
        const p = body.payload;
        const planned = tripsOf(w0, driverId, businessDate(occurred))[0] ?? null;
        truckId = w0.trucks.some((t) => t.id === p.truck_id) ? p.truck_id : planned?.truck_id ?? driver?.truck_id ?? p.truck_id;
        const trailerId = w0.trailers.some((t) => t.id === p.trailer_id) ? p.trailer_id
          : planned?.trailer_id ?? w0.trucks.find((t) => t.id === truckId)?.trailer_id ?? p.trailer_id;
        dayId = truckDayIdFor(w0, truckId, businessDate(occurred)) ?? s.stores.truckDays.create({ truck_id: truckId,
          driver_id: driverId, date: businessDate(occurred), version: 1, status: 'OPEN', waybill_no: null, confirmed_by: null,
          confirmed_at: null, confirm_reason: null, printed_at: null, signed_at: null, exported: null, example: false,
          figures: null }).id;
        shiftId = s.stores.shifts.create({ driver_id: driverId, device_id: device.id, truck_id: truckId, trailer_id: trailerId,
          truck_day_id: dayId, started_at: occurred, ended_at: null, attested_at: null, closed_by: null, start_key: body.key }).id;
      } else {
        const shift = shiftForRecord(w0, device.id, occurred);
        truckId = shift?.truck_id ?? tripsOf(w0, driverId, businessDate(occurred))[0]?.truck_id ?? driver?.truck_id ?? '';
        dayId = shift?.truck_day_id ?? truckDayIdFor(w0, truckId, businessDate(occurred));
        shiftId = shift?.id ?? null;
      }

      // The stop: the one it names (or the stop an unplanned arrival was filed under, named by the arrival's key); an
      // arrival at a place the plan does not have gets a stop of its own on the phone's trip, so its completion can
      // name it (D-12).
      let stop: PlannedStop | null = stopNamed(w0, body.stop_id);
      if (stop === null && body.type === 'ARRIVED' && body.payload.order === 'UNPLANNED') {
        const trips = tripsOf(w0, driverId, businessDate(occurred));
        const trip = currentTrip(w0, trips, w0.records.filter((r) => r.driver_id === driverId));
        const last = w0.plannedStops.filter((x) => x.trip_id === (trip?.id ?? '')).reduce((m, x) => Math.max(m, x.seq), 0);
        stop = s.stores.plannedStops.create({ plan_key: `u-${body.key}`, trip_id: trip?.id ?? '', seq: last + 1,
          place_id: body.place_id ?? '', kind: 'UNPLANNED', ttn_expected: 0, ttn_nos: [], drop_index: null, drop_count: null,
          compartments: null, cargo: null, mass_t: null, unplanned_kind: body.payload.unplanned_kind ?? 'OTHER',
          accepted_at: null, accepted_by: null });
      }
      const w = s.world();
      const base = { key: body.key, seq: body.seq, device_id: device.id, driver_id: driverId, truck_id: truckId,
        shift_id: shiftId, truck_day_id: dayId, occurred_at: occurred, committed_at: committed,
        app_clock_at: instantOr(body.app_clock_at, committed), received_at: now, stop_id: stop?.id ?? null,
        place_id: body.place_id ?? (stop === null || stop.place_id === '' ? null : stop.place_id), gps: body.gps,
        flags: [] as FlagCode[], voided_by: null, late: false };
      // Later photos with no stop complete the phone's put-off refuel (D7), and happened where it did.
      const later = body.type === 'DOCS_ADDED' && stop === null
        ? refuelCompletedBy(w, { ...base, id: '', type: 'DOCS_ADDED', payload: body.payload }) : null;
      const place_id = base.place_id ?? later?.place_id ?? null;

      // Flags, never a refusal (§7.3, §7.5). The record is not in `w` yet, so every check compares it with what came before.
      const flags = recordFlags(w, { ...base, id: '', place_id, type: body.type, payload: body.payload } as DriverRecord, now);
      const rec = s.stores.records.create({ ...base, place_id, flags, late: flags.includes('LATE_RECORD_ON_CONFIRMED_DAY'),
        type: body.type, payload: body.payload } as Omit<DriverRecord, 'id'>);

      applySideEffects(s, rec, now);
      if (dayId !== null) {
        const day = s.stores.truckDays.get(dayId);
        if (day !== undefined) s.stores.truckDays.update(dayId, { version: day.version + 1 });
      }
      s.stores.devices.update(device.id, { last_contact_at: now });
      s.wrote('submitRecord', c, { truck_day_id: dayId, result_id: rec.id, highlight: true, toast: driverToast(s.world(), rec) });
      return { key: rec.key, id: rec.id, received_at: now, duplicate: false };
    },

    /** One page of a record. A key already held is answered as it was. The pages of a later-photos record that completes
     *  a refuel are filed under that refuel (D7). */
    uploadPhoto: (c: HandlerCtxOf<Api, 'uploadPhoto'>) => {
      const now = asInstant(c.now);
      const body = c.body;
      const device = phone(c.actor.id);
      const w = s.world();
      const record = w.records.find((r) => r.key === body.record_key) ?? null;
      const captured = instantOr(body.captured_at, now);
      if (device.revoked_at !== null && atOrBefore(device.revoked_at, record?.committed_at ?? captured)) {
        fail('uploadPhoto', 'DEVICE_REVOKED', SAYS_DRIVER_WRITE.DEVICE_REVOKED);
      }
      const held = w.pages.find((p) => p.key === body.key);
      if (held !== undefined) return { page_key: held.key, received_at: held.received_at ?? now };
      const owner = record !== null && record.type === 'DOCS_ADDED' && record.stop_id === null ? refuelCompletedBy(w, record) : null;
      const page = s.stores.pages.create({ key: body.key, record_key: owner?.key ?? body.record_key, artefact: body.artefact,
        doc_index: body.doc_index, page_no: body.page_no, captured_at: captured, source: body.source, bytes: body.bytes,
        quality: body.quality, quality_reasons: [...body.quality_reasons], deferred: body.deferred ?? null,
        drawn: body.drawn_variant === undefined ? null
          : { variant: body.drawn_variant, value: body.drawn_value ?? null, sim_read: body.drawn_sim_read ?? null },
        image: body.image ?? null, received_at: now, superseded_by: null });
      s.stores.devices.update(device.id, { last_contact_at: now });
      s.wrote('uploadPhoto', c, { truck_day_id: record?.truck_day_id ?? null, result_id: page.id, highlight: false, toast: null });
      return { page_key: page.key, received_at: now };
    },

    /** The phone is alive: the last contact and how many records it still held then (§4.2 C-01 «Зв'язок»). */
    sendHeartbeat: (c: HandlerCtxOf<Api, 'sendHeartbeat'>) => {
      const now = asInstant(c.now);
      const device = phone(c.actor.id);
      s.stores.devices.update(device.id, { last_contact_at: now, unsent_at_contact: c.body.unsent });
      s.wrote('sendHeartbeat', c, { truck_day_id: null, highlight: false });
      return { server_time: now, revoked: device.revoked_at !== null && atOrBefore(device.revoked_at, now) };
    },
  };
}

/** What a record changes besides itself (§7.3): a shift end closes the shift, an attestation marks it, a loading with
 *  pages opens its ТТН rows, a retake supersedes the old page and completes its request, the request replies and a
 *  correction's answer land on their rows, and an undo marks its target. */
function applySideEffects(s: Server, rec: DriverRecord, now: Instant): void {
  const recordByKey = (key: string) => s.world().records.find((r) => r.key === key);
  switch (rec.type) {
    case 'SHIFT_END':
      if (rec.shift_id !== null) s.stores.shifts.update(rec.shift_id, { ended_at: rec.occurred_at, closed_by: 'DRIVER' });
      break;
    case 'DRIVER_ATTESTED': {
      const shiftId = rec.payload.shift_id ?? rec.shift_id;
      if (shiftId !== null) s.stores.shifts.update(shiftId, { attested_at: rec.occurred_at });
      break;
    }
    case 'LOADED': {
      if (rec.payload.pages.length === 0) break;
      const w = s.world();
      const held = new Set(w.ttnDocs.map((d) => d.no));
      for (const doc of newTtnDocs(w, rec, now)) if (!held.has(doc.no)) s.stores.ttnDocs.create(doc);
      break;
    }
    case 'PHOTO_REPLACE': {
      const p: Payloads['PHOTO_REPLACE'] = rec.payload;
      const w = s.world();
      const old = w.pages.find((x) => x.key === p.supersedes);
      if (old !== undefined) s.stores.pages.update(old.id, { superseded_by: p.page_key });
      const request = (p.request_id === null ? undefined : w.requests.find((q) => q.id === p.request_id))
        ?? w.requests.find((q) => q.device_id === rec.device_id && q.page_key === p.supersedes && q.done_at === null
          && q.cancelled_at === null);
      if (request !== undefined && request.done_at === null) s.stores.requests.update(request.id, { done_at: rec.occurred_at });
      break;
    }
    case 'REQUEST_SEEN': {
      const q = s.stores.requests.get(rec.payload.request_id);
      if (q !== undefined && q.seen_at === null) {
        s.stores.requests.update(q.id, { seen_at: rec.occurred_at, delivered_at: q.delivered_at ?? rec.occurred_at });
      }
      break;
    }
    case 'REQUEST_REPLY':
      if (s.stores.requests.get(rec.payload.request_id) !== undefined) {
        s.stores.requests.update(rec.payload.request_id, { reply: rec.payload.reply });
      }
      break;
    case 'CORRECTION_ACK':
      if (s.stores.corrections.get(rec.payload.correction_id) !== undefined) {
        s.stores.corrections.update(rec.payload.correction_id, { ack: { agree: rec.payload.agree, at: rec.occurred_at } });
      }
      break;
    case 'VOID': {
      const target = recordByKey(rec.payload.target_key);
      if (target !== undefined && target.voided_by === null) s.stores.records.update(target.id, { voided_by: rec.key });
      break;
    }
    default:
      break;
  }
}
