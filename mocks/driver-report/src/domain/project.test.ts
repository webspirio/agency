// mocks/driver-report/src/domain/project.test.ts
import { describe, expect, it } from 'vitest';
import { demo } from './clock';
import { project } from './project';
import type { AutoEventView, DriverToday, PlannedStopView, RecordIn, RecordView } from './dto';

const stop = (p: Partial<PlannedStopView> & Pick<PlannedStopView, 'stop_id' | 'seq' | 'kind' | 'label' | 'short'>): PlannedStopView => ({
  plan_key: `3312-${p.seq}`, place_id: `place-${p.seq}`, town: '', ttn_expected: 0, ttn_nos: [], drop_index: null, drop_count: null,
  compartments: null, mass_t: null, planned_km: null, no_photos: false, weigh_ticket: false, accepted_at: null, ...p });
const STOPS = [
  stop({ stop_id: 's1', seq: 1, kind: 'LOADING', label: 'Дніпро-Корм', short: 'Дніпро-Корм, Вільнянськ', town: 'Вільнянськ', ttn_expected: 2, ttn_nos: ['004517', '004518'], mass_t: '24.400', planned_km: 36 }),
  stop({ stop_id: 's2', seq: 2, kind: 'DROP', label: 'Злагода', short: 'Злагода, Синельникове', drop_index: 1, drop_count: 2, compartments: '1–3', ttn_nos: ['004517'], mass_t: '12.000', planned_km: 52 }),
  stop({ stop_id: 's3', seq: 3, kind: 'DROP', label: 'Лан', short: 'Лан, Балабине', drop_index: 2, drop_count: 2, compartments: '4–6', ttn_nos: ['004518'], mass_t: '12.400', planned_km: 116, no_photos: true }),
  stop({ stop_id: 's4', seq: 4, kind: 'BASE', label: 'База', short: 'База', planned_km: 23 }),
];
function today(p: Partial<DriverToday> = {}): DriverToday {
  return {
    server_time: demo('05:14'), device: { id: 'device-000001', bound: true, revoked: false },
    driver: { id: 'driver-000001', name: 'Павло Ватаманюк', short_name: 'Ватаманюк П.' },
    truck: { id: 'truck-000001', plate: 'АР 1234 ВС', model: 'Scania R450', telematics: 'REGIS', has_can: false, speed_kmh: null, gnss: 'OK', can_km: null },
    trailer: { id: 'trailer-000001', plate: 'АР 7781 ХР', body_label: 'пневмобочка, 6 відсіків', compartments: 6 },
    plan: { trip_no: 'Р-26-3312', caption: 'Вільнянськ → Синельникове → Балабине', mass_label: '24,4 т', imported_label: 'план з BAS 20.09 17:40', stops: STOPS },
    shift: null, records: [], auto_events: [],
    odometer_ref: { value: 412355, at: '2026-09-20T14:48:00.000Z' as never, source: 'DASH_PHOTO', basis: 'LAST_AT_BASE', place_short: 'База', kind: 'SHIFT_END_AT_BASE' },
    requests: [], requests_done_today: [], corrections_to_ack: [], paper: { owed: [], receipts: [] },
    on_call: { name: 'Ірина Коваленко', role_label: 'диспетчер', until: '20:00', phone: '+380 67 214 55 08' },
    last_contact_at: null, first_time: { examples_seen: [], office_sees_read: true, first_arrival: false }, day: null, ...p,
  };
}
const shiftOpen = { id: 'shift-1', started_at: demo('05:20'), ended_at: null, attested_at: null, truck_plate: 'АР 1234 ВС', trailer_plate: 'АР 7781 ХР', start_odometer: 412355, end_odometer: null };
const rv = (type: RecordView['type'], at: string, stop_id: string | null, payload: unknown, seq = 1): RecordView => ({
  key: `device-000001:${seq}`, seq, type, occurred_at: demo(at), committed_at: demo(at), received_at: demo(at), stop_id, place_id: null,
  payload: payload as never, photos_expected: 0, photos_received: 0, accepted_at: null, voided: false, late: false });
const arrived = rv('ARRIVED', '06:10', 's1', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: null, unplanned_kind: null, new_place: false }, 418);
const loaded = rv('LOADED', '08:40', 's1', { ttn_count: 2, pages: [], no_doc_reason: null, deferred: null }, 419);

describe('home decides the one next action (§3.2)', () => {
  it('sends an unbound phone to #/bind and shows a revoked one the hold card', () => {
    expect(project(today({ device: { id: 'd', bound: false, revoked: false } }), [], demo('05:14')).mode).toBe('UNBOUND');
    expect(project(today({ device: { id: 'd', bound: true, revoked: true } }), [], demo('05:14')).mode).toBe('REVOKED');
  });
  it('mode A before the shift: «Почати зміну»', () => {
    const p = project(today(), [], demo('05:14'));
    expect([p.mode, p.primary?.verb, p.primary?.target.kind, p.quiet]).toEqual(['A', 'Почати зміну', 'shift-start', null]);
  });
  it('mode B on the road: «Я на місці» / the next stop', () => {
    const p = project(today({ shift: shiftOpen }), [], demo('05:40'));
    expect([p.mode, p.primary?.verb, p.primary?.place, p.quiet?.verb]).toEqual(['B', 'Я на місці', 'Дніпро-Корм, Вільнянськ', 'Я в іншому місці']);
  });
  it('mode C at a loading: «Завантажено — фото ТТН», timer from the arrival', () => {
    const p = project(today({ shift: shiftOpen, records: [arrived] }), [], demo('07:48'));
    expect([p.mode, p.primary?.verb, p.openStop?.arrived_at, p.openStop?.segment?.chip]).toEqual(['C', 'Завантажено — фото ТТН', demo('06:10'), 'QUEUE']);
  });
  it('mode D for a road stop outside a stop: «Закінчилось»', () => {
    const road = rv('ROAD_STOP', '12:30', null, { reason: 'ALERT', can_drive: null }, 425);
    const p = project(today({ shift: shiftOpen, records: [arrived, loaded, road] }), [], demo('12:40'));
    expect([p.mode, p.primary?.verb, p.openRoadStop?.reason]).toEqual(['D', 'Закінчилось', 'ALERT']);
  });
  it('an alert inside an open stop is a segment, not mode D (EC-58)', () => {
    const seg = rv('SEGMENT', '07:00', 's1', { chip: 'ALERT' }, 420);
    const p = project(today({ shift: shiftOpen, records: [arrived, seg] }), [], demo('07:10'));
    expect([p.mode, p.openStop?.alert?.since]).toEqual(['C', demo('07:00')]);
  });
  it('B′ when every planned stop is done, B″ without a plan', () => {
    const done = ['s1', 's2', 's3', 's4'].flatMap((id, i) => [
      rv('ARRIVED', '10:00', id, { order: 'PLANNED', claimed_at: null, chip: null, odometer: null, unplanned_kind: null, new_place: false }, 500 + i),
      rv('STOP_LEFT', '10:30', id, {}, 510 + i)]);
    expect(project(today({ shift: shiftOpen, records: done }), [], demo('15:00')).primary?.verb).toBe('Закінчити зміну');
    const b2 = project(today({ shift: shiftOpen, plan: null }), [], demo('06:00'));
    expect([b2.mode, b2.primary?.verb, b2.primary?.place, b2.quiet?.verb]).toEqual(['B2', 'Я на місці', 'Оберу місце', 'Закінчити зміну']);
  });
  it('mode E after the shift: no accent, «Почати нову зміну»', () => {
    const ended = { ...shiftOpen, ended_at: demo('16:02') };
    const p = project(today({ shift: ended }), [], demo('16:05'));
    expect([p.mode, p.primary, p.quiet?.verb]).toEqual(['E', null, 'Почати нову зміну']);
  });
  it('waits for instructions after «Не приймають» (D-11)', () => {
    const problem = rv('STOP_PROBLEM', '07:30', 's1', { kind: 'NOT_ACCEPTED', reason: null }, 421);
    const p = project(today({ shift: shiftOpen, records: [arrived, problem] }), [], demo('07:40'));
    expect([p.mode, p.openStop?.segment]).toEqual(['C', { chip: 'WAIT_ORDERS', since: demo('07:30') }]);
  });
  it('projects an unsent record from the outbox (offline)', () => {
    const pending: RecordIn = { key: 'device-000001:417', seq: 417, type: 'SHIFT_START', occurred_at: demo('05:20'), committed_at: demo('05:21'),
      app_clock_at: demo('05:21'), gps: 'OK', payload: { truck_id: 'truck-000001', trailer_id: 'trailer-000001', plan_match: true, odometer: null, inline: null } };
    expect(project(today(), [pending], demo('05:22')).mode).toBe('B');
  });
});

describe('the TripRail card (§3.3 D-02, §6.1 move 1)', () => {
  it('draws the day as a road after the loading', () => {
    const p = project(today({ shift: shiftOpen, records: [arrived, loaded] }), [], demo('08:50'));
    expect(p.trip.header).toBe('Рейс Р-26-3312 · 24,4 т');
    expect(p.trip.stops.map((s) => [s.state, s.time, s.place, s.detail, s.hold])).toEqual([
      ['done', '06:10–08:40', 'Дніпро-Корм, Вільнянськ', 'Завантаження · 2 ТТН · 24,4 т', null],
      ['current', '+52 км', 'Злагода, Синельникове', 'Вивантаження 1 з 2 · відсіки 1–3 · ТТН 004517 · 12,000 т', null],
      ['future', '+116 км', 'Лан, Балабине', 'Вивантаження 2 з 2 · відсіки 4–6 · ТТН 004518 · 12,400 т', 'Фото на території заборонені'],
      ['future', '+23 км', 'База', 'Повернення на базу', null],
    ]);
    expect(p.trip.stops[0]!.departure).toEqual({ text: 'виїзд — не раніше 08:40 (запис)', simulated: false });
  });
  it('marks refuels and road stops between done stops', () => {
    const refuel = rv('REFUEL', '08:57', null, { station: 'ОККО Н-08', receipt_no: '58213', rro_no: null, sum_uah: '22800.00', card_mask: '****4417', full_tank: true, odometer: null, deferred: false }, 422);
    const road = rv('ROAD_STOP', '12:30', null, { reason: 'ALERT', can_drive: null }, 425);
    const end = rv('ROAD_STOP_END', '12:48', null, { road_stop_key: 'device-000001:425', at: demo('12:48'), closed_by: 'DRIVER' }, 426);
    const p = project(today({ shift: shiftOpen, records: [arrived, loaded, refuel, road, end] }), [], demo('13:00'));
    expect(p.trip.markers.map((m) => m.text)).toEqual(['08:57 Заправка · ОККО Н-08', '12:30–12:48 Тривога · 18 хв']);
  });
});

/* Beyond the plan's twelve: the rules of W0-09 that no test above exercises (D-11 closing by motion, the three
   departure lines, the done row's office state, undo, the R+C automatic arrival). */
const auto = (kind: AutoEventView['kind'], at: string, stop_id: string | null = null): AutoEventView => ({
  id: `telemetry-${kind}-${at}`, kind, at: demo(at), place_id: null, place_short: null, stop_id, can_km: null, litres: null,
  minutes: null, simulated: true });
const RC = { ...today().truck!, telematics: 'RUPTELA' as const, has_can: true };
const pendingOf = (r: RecordView): RecordIn => ({ key: r.key, seq: r.seq, type: r.type, occurred_at: r.occurred_at,
  committed_at: r.committed_at, app_clock_at: r.committed_at, gps: 'OK', ...(r.stop_id === null ? {} : { stop_id: r.stop_id }),
  payload: r.payload } as RecordIn);

describe('closing, departures and what the office already has (§3.3 D-02, D-11)', () => {
  it('closes an R+C road stop at the first visible motion after it, and reads like a driver-closed one', () => {
    const check = rv('ROAD_STOP', '12:25', null, { reason: 'CHECKPOINT', can_drive: null }, 430);
    const base = { shift: shiftOpen, truck: RC, records: [arrived, loaded, check], auto_events: [auto('MOTION', '13:03')] };
    const before = project(today(base), [], demo('12:40'));
    expect([before.mode, before.openRoadStop?.reason, before.trip.markers.map((m) => m.text)]).toEqual(['D', 'CHECKPOINT', ['Блокпост · з 12:25']]);
    const after = project(today(base), [], demo('13:10'));
    expect([after.mode, after.openRoadStop, after.trip.markers.map((m) => m.text)]).toEqual(['B', null, ['12:25–13:03 Блокпост · 38 хв']]);
  });
  it('draws one departure line, under the last done stop: record, unknown after deferred photos, or Ruptela', () => {
    const arrived2 = rv('ARRIVED', '10:05', 's2', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: null, unplanned_kind: null, new_place: false }, 440);
    const unloaded = rv('UNLOADED', '11:50', 's2', { drop_index: 1, pages: [], deferred: null, no_doc_reason: null }, 441);
    const two = project(today({ shift: shiftOpen, records: [arrived, loaded, arrived2, unloaded] }), [], demo('12:00'));
    expect(two.trip.stops.map((s) => s.departure)).toEqual([null, { text: 'виїзд — не раніше 11:50 (запис)', simulated: false }, null, null]);
    const later = rv('LOADED', '08:40', 's1', { ttn_count: 2, pages: [], no_doc_reason: null, deferred: 'AFTER_EXIT' }, 419);
    expect(project(today({ shift: shiftOpen, records: [arrived, later] }), [], demo('08:50')).trip.stops[0]!.departure)
      .toEqual({ text: 'виїзд — невідомо, за ТТН', simulated: false });
    const rc = project(today({ shift: shiftOpen, truck: RC, records: [arrived, loaded], auto_events: [auto('OUT', '08:55', 's1')] }), [], demo('09:00'));
    expect(rc.trip.stops[0]!.departure).toEqual({ text: 'Виїхав 08:55 · Ruptela', simulated: true });
  });
  it('shows what the office already has on a done row, and nothing while the record is still in the phone', () => {
    const at = (records: RecordView[], pending: RecordIn[] = []) => project(today({ shift: shiftOpen, records }), pending, demo('10:30')).trip.stops[0]!;
    expect(at([arrived, loaded]).status).toEqual({ text: 'В офісі ✓', icon: 'Check', tone: 'plain' });
    expect(at([arrived, { ...loaded, accepted_at: demo('10:09') }]).status).toEqual({ text: 'Прийнято диспетчером', icon: 'CheckCheck', tone: 'plain' });
    expect(at([arrived, { ...loaded, photos_expected: 4, photos_received: 3 }]).status)
      .toEqual({ text: 'В офісі ✓ · фото 1 з 4 ще в телефоні', icon: 'CloudUpload', tone: 'hold' });
    const unsent = at([arrived], [pendingOf(loaded)]);
    expect([unsent.state, unsent.status]).toEqual(['done', null]);
  });
  it('forgets an undone record, whether the office has it or it is still in the phone', () => {
    expect(project(today({ shift: shiftOpen, records: [{ ...arrived, voided: true }] }), [], demo('06:20')).mode).toBe('B');
    const undo = rv('VOID', '06:11', null, { target_key: arrived.key }, 431);
    expect(project(today({ shift: shiftOpen, records: [arrived] }), [pendingOf(undo)], demo('06:20')).mode).toBe('B');
  });
  it('opens an R+C stop on the Ruptela arrival only while the position is trusted', () => {
    const p = project(today({ shift: shiftOpen, truck: RC, auto_events: [auto('IN', '06:12', 's1')] }), [], demo('06:20'));
    expect([p.mode, p.openStop?.auto, p.openStop?.arrived_at, p.primary?.verb]).toEqual(['C', true, demo('06:12'), 'Завантажено — фото ТТН']);
    const suspect = project(today({ shift: shiftOpen, truck: { ...RC, gnss: 'SUSPECT' }, auto_events: [auto('IN', '06:12', 's1')] }), [], demo('06:20'));
    expect(suspect.mode).toBe('B');
  });
  it('a road stop taken while at a stop is that stop’s alert, not mode D and not a marker (D-11, EC-58)', () => {
    const arrived2 = rv('ARRIVED', '10:05', 's2', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: null, unplanned_kind: null, new_place: false }, 440);
    const road = rv('ROAD_STOP', '10:30', null, { reason: 'ALERT', can_drive: null }, 441);
    const p = project(today({ shift: shiftOpen, records: [arrived, loaded, arrived2, road] }), [], demo('10:40'));
    expect([p.mode, p.openStop?.stop.stop_id, p.openStop?.alert, p.openStop?.segment?.chip, p.trip.markers])
      .toEqual(['C', 's2', { since: demo('10:30'), key: road.key }, 'QUEUE', []]);
  });
  it('names the next stop: the first one not done, and the one after the stop he is at', () => {
    expect(project(today({ shift: shiftOpen }), [], demo('05:40')).nextStop?.stop_id).toBe('s1');
    const c = project(today({ shift: shiftOpen, records: [arrived] }), [], demo('07:00'));
    expect([c.nextStop?.stop_id, c.trip.stops.map((s) => s.state)]).toEqual(['s2', ['current', 'future', 'future', 'future']]);
  });
});

/* Integrator, after group C. (1) «приклад» is drawn once, as the card's own ExampleChip (§6.5, §8.6 #16), so the
   projection hands the card the plain source line. (2) A place the plan did not have is named, while its arrival is
   still in the phone, by that arrival's key; a record naming the stop that way must keep naming it once the office has
   filed the arrival under a stop of its own (D-12). */
describe('what the rail card is handed, and a place the plan did not have (integrator, group C)', () => {
  it('hands the card the plan source without «приклад»: the card draws that as its chip', () => {
    expect(project(today({ shift: shiftOpen }), [], demo('05:40')).trip.source).toBe('план з BAS 20.09 17:40');
    expect(project(today({ shift: shiftOpen, plan: null }), [], demo('05:40')).trip.source).toBe('');
  });
  it('completes a place the plan did not have, before and after the office files its arrival (D-12)', () => {
    const payload = { order: 'UNPLANNED', claimed_at: null, chip: 'OTHER', odometer: null, unplanned_kind: 'OTHER', new_place: true };
    const inPhone = rv('ARRIVED', '09:30', null, payload, 450);
    const filed = { ...inPhone, stop_id: 'stop-u1' };
    const left = pendingOf(rv('STOP_LEFT', '09:50', inPhone.key, {}, 451));
    const base = { shift: shiftOpen, records: [arrived, loaded] };
    const open = project(today(base), [pendingOf(inPhone)], demo('09:40'));
    expect([open.mode, open.openStop?.stop.stop_id, open.primary?.target]).toEqual(['C', inPhone.key, { kind: 'leave', stopId: inPhone.key }]);
    const cases = [
      project(today(base), [pendingOf(inPhone), left], demo('09:55')),
      project(today({ ...base, records: [arrived, loaded, filed] }), [left], demo('09:55')),
      project(today({ ...base, records: [arrived, loaded, filed],
        plan: { ...today().plan!, stops: [...STOPS, stop({ stop_id: 'stop-u1', seq: 5, kind: 'UNPLANNED', label: 'Нове місце', short: 'Нове місце' })] } }),
      [left], demo('09:55')),
    ];
    expect(cases.map((p) => [p.mode, p.openStop, p.primary?.place])).toEqual(Array(3).fill(['B', null, 'Злагода, Синельникове']));
  });
  it('keeps a segment named by the arrival key on that stop once the office has filed it', () => {
    const inPhone = rv('ARRIVED', '09:30', null, { order: 'UNPLANNED', claimed_at: null, chip: 'OTHER', odometer: null,
      unplanned_kind: 'OTHER', new_place: true }, 450);
    const seg = pendingOf(rv('SEGMENT', '09:45', inPhone.key, { chip: 'WAIT_DOCS' }, 452));
    const p = project(today({ shift: shiftOpen, records: [arrived, loaded, { ...inPhone, stop_id: 'stop-u1' }] }), [seg], demo('09:50'));
    expect([p.mode, p.openStop?.stop.stop_id, p.openStop?.segment]).toEqual(['C', 'stop-u1', { chip: 'WAIT_DOCS', since: demo('09:45') }]);
  });
});
