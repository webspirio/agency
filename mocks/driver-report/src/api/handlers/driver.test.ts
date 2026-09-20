// mocks/driver-report/src/api/handlers/driver.test.ts
import { describe, expect, it } from 'vitest';
import { DomainError } from '@agency/mock';
import { demo } from '../../domain/clock';
import { stopFacts } from '../../domain/derive';
import { ctxFor, HRYHORII_ACTOR, OLEH_ACTOR, PAVLO_ACTOR, replayDriver, REVOKED_ACTOR, submit, testServer } from '../../test/drive';
import type { ChangedEvent } from '../server';
import { driverHandlers } from './driver';

const plan = (s: ReturnType<typeof testServer>) => s.world();
const truckId = (s: ReturnType<typeof testServer>, plate: string) => plan(s).trucks.find((t) => t.plate === plate)!.id;
const trailerId = (s: ReturnType<typeof testServer>, plate: string) => plan(s).trailers.find((t) => t.plate === plate)!.id;
const odo = (value: number) => ({ value, source: 'DASH_PHOTO', basis: 'PLANNED_KM', expected: value, read: value, choice: 'CONFIRMED', page_key: null });
const refusal = (fn: () => unknown): { status: number; code: string | undefined } => {
  try { fn(); } catch (e) { if (e instanceof DomainError) return { status: e.status, code: e.code }; throw e; }
  return { status: 0, code: 'RESOLVED' };
};
function bindCode(s: ReturnType<typeof testServer>, code: string, expires: string) {
  const driver = plan(s).drivers.find((d) => d.tab_no === '0457')!;
  s.stores.bindCodes.create({ code, driver_id: driver.id, created_by: 'user-000001', created_at: demo('05:15'),
    expires_at: demo(expires), opened_at: null, used_at: null, device_id: null });
}

describe('binding (§3.3 D-01, UC-D01)', () => {
  it('previews a live code without binding, then binds on «Так, це я»', () => {
    const s = testServer('05:15');
    bindCode(s, '483920', '05:30');
    const h = driverHandlers(s);
    expect(h.getBindPreview(ctxFor(s, HRYHORII_ACTOR, { params: { code: '483920' } }))).toEqual({
      status: 'VALID', driver_name: 'Григорій Савенко', initials: 'ГС', truck_plate: 'АР 7390 ЕВ', truck_model: 'Scania R420' });
    expect(s.world().devices.find((d) => d.id === 'device-000003')!.driver_id).toBeNull();
    const b = h.confirmBinding(ctxFor(s, HRYHORII_ACTOR, { params: { code: '483920' }, body: {} }));
    expect([b.device_id, b.driver_name, b.bound_at]).toEqual(['device-000003', 'Григорій Савенко', demo('05:15')]);
  });
  it('refuses an expired, used or unknown code with BIND_CODE_EXPIRED 410 — and says so in the preview as data', () => {
    const s = testServer('05:31');
    bindCode(s, '483920', '05:30');
    const h = driverHandlers(s);
    expect(h.getBindPreview(ctxFor(s, HRYHORII_ACTOR, { params: { code: '483920' } })).status).toBe('EXPIRED');
    expect(h.getBindPreview(ctxFor(s, HRYHORII_ACTOR, { params: { code: '000000' } })).status).toBe('UNKNOWN');
    expect(refusal(() => h.confirmBinding(ctxFor(s, HRYHORII_ACTOR, { params: { code: '483920' }, body: {} })))).toEqual({ status: 410, code: 'BIND_CODE_EXPIRED' });
  });
});

describe('today (§7.4 DriverToday, §3.2 inputs)', () => {
  it('gives Павло the raw facts of 05:14', () => {
    const s = testServer('05:14');
    const t = driverHandlers(s).getToday(ctxFor(s, PAVLO_ACTOR));
    expect(t.plan).toMatchObject({ trip_no: 'Р-26-3312', caption: 'Вільнянськ → Синельникове → Балабине', mass_label: '24,4 т', imported_label: 'план з BAS 20.09 17:40' });
    expect(t.odometer_ref).toMatchObject({ value: 412355, at: '2026-09-20T14:48:00.000Z', basis: 'LAST_AT_BASE', kind: 'SHIFT_END_AT_BASE' });
    expect([t.shift, t.device.bound, t.on_call.name, t.on_call.until, t.truck?.plate]).toEqual([null, true, 'Ірина Коваленко', '20:00', 'АР 1234 ВС']);
  });
  it('names the night man with the hour he answers until, and the dispatcher without one (§3.3 D-02 mode D)', () => {
    // The call button renders «Подзвонити — <name>, <role_label>» and takes no `until` slot (I-15), and OnCallView
    // carries no role CODE — so the hour can only be composed here, where the rota slot and the role are both known.
    const day = testServer('05:14');
    expect(driverHandlers(day).getToday(ctxFor(day, PAVLO_ACTOR)).on_call)
      .toMatchObject({ name: 'Ірина Коваленко', role_label: 'диспетчер', until: '20:00' });
    const night = testServer('20:30');
    expect(driverHandlers(night).getToday(ctxFor(night, PAVLO_ACTOR)).on_call)
      .toMatchObject({ name: 'Дмитро Савчук', role_label: 'черговий до 06:00', until: '06:00' });
  });
  it('names every place in the case the sentence needs it, and keeps a shift start a shift start', () => {
    // Three facts the phone cannot recover once they are dropped, each of which a page was inventing instead: the
    // genitive of the place the reference reading was taken at («+23 км від «Лану»», §3.3 D-09), the locative of a
    // stop's town («Завантаження у Вільнянську не записано», §3.3 D-04) and the genitive of the stop itself.
    const s = testServer('05:14');
    const before = driverHandlers(s).getToday(ctxFor(s, PAVLO_ACTOR));
    expect(before.odometer_ref).toMatchObject({ place_short: 'База', place_gen: 'Бази', kind: 'SHIFT_END_AT_BASE' });
    expect(before.plan?.stops.map((x) => [x.short, x.label_gen, x.town_loc])).toEqual([
      ['Дніпро-Корм, Вільнянськ', 'Дніпро-Корму', 'Вільнянську'],
      ['Злагода, Синельникове', 'Злагоди', 'Синельниковому'],
      ['Лан, Балабине', 'Лану', 'Балабиному'],
      ['База', 'Бази', 'Запоріжжі'],
    ]);
    // `lastTrustedOf` tells a SHIFT_START from any other point — that is what words «+36 км від виїзду» — and the
    // view flattened it to POINT, so two pages rebuilt the distinction from `shift.started_at` themselves.
    replayDriver(s, PAVLO_ACTOR.id, '05:25');
    s.clock.set(demo('05:30'));
    expect(driverHandlers(s).getToday(ctxFor(s, PAVLO_ACTOR)).odometer_ref)
      .toMatchObject({ value: 412355, kind: 'SHIFT_START', basis: 'PLANNED_KM' });
  });
  it('gives Григорій the mechanic’s reading', () => {
    const s = testServer('05:14');
    const d = s.stores.devices.get('device-000003')!;
    s.stores.devices.update(d.id, { driver_id: s.world().drivers.find((x) => x.tab_no === '0457')!.id, bound_at: demo('05:15') });
    expect(driverHandlers(s).getToday(ctxFor(s, HRYHORII_ACTOR)).odometer_ref).toMatchObject({ value: 356118, kind: 'MECHANIC' });
  });
  it('gives Олег Ruptela’s events with the litres he poured, never the day’s CAN fuel the office compares to the norm', () => {
    const s = testServer();
    replayDriver(s, OLEH_ACTOR.id, '16:03');
    s.clock.set(demo('16:05'));
    const events = driverHandlers(s).getToday(ctxFor(s, OLEH_ACTOR)).auto_events;
    expect(events.map((e) => [e.kind, e.litres]).filter(([, l]) => l !== null)).toEqual([['REFUEL', '196.00']]);
    expect(events.find((e) => e.kind === 'CARD_OUT')).toMatchObject({ at: demo('15:06'), litres: null });
  });
});

describe('records (§7.4 #5, §7.5, EC-137, EC-142)', () => {
  it('opens the shift and its truck-day, answers with the same key, and is idempotent', () => {
    const s = testServer();
    const payload = { truck_id: truckId(s, 'АР 1234 ВС'), trailer_id: trailerId(s, 'АР 7781 ХР'), plan_match: true, odometer: odo(412355), inline: null };
    const first = submit(s, 'device-000001', 'SHIFT_START', '05:20', payload, { committed: '05:21' });
    expect(first.seq).toBe(417);
    const again = driverHandlers(s).submitRecord(ctxFor(s, PAVLO_ACTOR, { body: { key: first.key, seq: 417, type: 'SHIFT_START',
      occurred_at: demo('05:20'), committed_at: demo('05:21'), app_clock_at: demo('05:21'), gps: 'OK', payload } }));
    expect([again.key, again.id, again.duplicate]).toEqual([first.key, first.id, true]);
    expect(s.world().shifts.filter((x) => x.device_id === 'device-000001' && x.ended_at === null)).toHaveLength(1);
    expect(s.world().truckDays.filter((d) => d.date === '2026-09-21' && d.truck_id === truckId(s, 'АР 1234 ВС'))).toHaveLength(1);
  });
  it('never refuses content: an odd odometer is stored with its flag', () => {
    const s = testServer();
    const { id } = submit(s, 'device-000001', 'SHIFT_START', '05:20', { truck_id: truckId(s, 'АР 1234 ВС'), trailer_id: trailerId(s, 'АР 7781 ХР'),
      plan_match: false, odometer: { ...odo(41235), source: 'DRIVER_TYPED', choice: 'TYPED' }, inline: null });
    expect(s.stores.records.get(id)!.flags).toEqual(expect.arrayContaining(['ODOMETER_BACKWARDS', 'PLAN_MISMATCH_TRUCK']));
  });
  it('refuses only a revoked device, with DEVICE_REVOKED 403', () => {
    const s = testServer();
    const body = { key: 'device-000009:1', seq: 1, type: 'CALL_ME', occurred_at: demo('05:20'), committed_at: demo('05:20'), app_clock_at: demo('05:20'), gps: 'OK', payload: {} };
    expect(refusal(() => driverHandlers(s).submitRecord(ctxFor(s, REVOKED_ACTOR, { body })))).toEqual({ status: 403, code: 'DEVICE_REVOKED' });
  });
  it('tells the office, with the toast of §5.9', () => {
    const s = testServer();
    const events: ChangedEvent[] = [];
    s.subscribe((e) => { if (e.type === 'changed') events.push(e); });
    submit(s, 'device-000001', 'SHIFT_START', '05:20', { truck_id: truckId(s, 'АР 1234 ВС'), trailer_id: trailerId(s, 'АР 7781 ХР'),
      plan_match: true, odometer: odo(412355), inline: null }, { committed: '05:21', pages: [{ artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: 'cluster:412355' }] });
    const record = events.find((e) => e.op === 'submitRecord')!;
    expect([record.highlight, record.toast]).toEqual([true, { title: 'Павло Ватаманюк · Зміну почато 05:20', line: 'АР 1234 ВС · 412 355 ФОТО' }]);
    expect(events.find((e) => e.op === 'uploadPhoto')!.toast).toBeNull();
  });
  it('marks a request delivered on the first read of today', () => {
    const s = testServer('08:43');
    s.stores.requests.create({ type: 'RETAKE_PHOTO', record_key: 'device-000001:419', page_key: 'device-000001:419:p4', stop_id: null,
      device_id: 'device-000001', reasons: ['BLUR'], created_by: 'user-000001', created_at: demo('08:43'), delivered_at: null, seen_at: null,
      done_at: null, cancelled_at: null, reply: null });
    driverHandlers(s).getToday(ctxFor(s, PAVLO_ACTOR));
    expect(s.world().requests[0]!.delivered_at).toBe(demo('08:43'));
  });
  it('records a heartbeat as the last contact', () => {
    const s = testServer('08:57');
    expect(driverHandlers(s).sendHeartbeat(ctxFor(s, PAVLO_ACTOR, { body: { unsent: 1 } }))).toEqual({ server_time: demo('08:57'), revoked: false });
    expect(s.stores.devices.get('device-000001')!).toMatchObject({ last_contact_at: demo('08:57'), unsent_at_contact: 1 });
  });
  it('files an unplanned arrival under a stop of its own (D-12)', () => {
    const s = testServer();
    submit(s, 'device-000001', 'SHIFT_START', '05:20', { truck_id: truckId(s, 'АР 1234 ВС'), trailer_id: trailerId(s, 'АР 7781 ХР'),
      plan_match: true, odometer: odo(412355), inline: null });
    const { id } = submit(s, 'device-000001', 'ARRIVED', '06:50', { order: 'UNPLANNED', claimed_at: null, chip: 'OTHER', odometer: null,
      unplanned_kind: 'OTHER', new_place: true });
    const stopId = s.stores.records.get(id)!.stop_id;
    expect(s.world().plannedStops.find((p) => p.id === stopId)).toMatchObject({ kind: 'UNPLANNED', unplanned_kind: 'OTHER' });
  });
  it('files a completion that names an unplanned arrival by its KEY under that arrival’s stop (D-12, offline)', () => {
    // While the arrival is still in the phone, the phone can only name its stop by the arrival's record key
    // (project.ts's stand-in stop). The outbox sends in seq order, so the ARRIVED is on the server first.
    const s = testServer();
    submit(s, 'device-000001', 'SHIFT_START', '05:20', { truck_id: truckId(s, 'АР 1234 ВС'), trailer_id: trailerId(s, 'АР 7781 ХР'),
      plan_match: true, odometer: odo(412355), inline: null });
    const arrival = submit(s, 'device-000001', 'ARRIVED', '06:50', { order: 'UNPLANNED', claimed_at: null, chip: 'OTHER',
      odometer: null, unplanned_kind: 'OTHER', new_place: false }, { place_code: 'BERIZKA' });
    const stopId = s.stores.records.get(arrival.id)!.stop_id!;
    s.clock.set(demo('07:05'));
    const seq = s.mintSeq('device-000001');
    const ack = driverHandlers(s).submitRecord(ctxFor<'submitRecord'>(s, PAVLO_ACTOR, { body: { key: `device-000001:${seq}`, seq,
      type: 'STOP_LEFT', occurred_at: demo('07:05'), committed_at: demo('07:05'), app_clock_at: demo('07:05'),
      stop_id: arrival.key, gps: 'OK', payload: {} } }));
    expect(s.stores.records.get(ack.id)!.stop_id).toBe(stopId);
    expect(stopFacts(s.world(), stopId, demo('07:10'))?.completed_at).toBe(demo('07:05'));
  });
});
