// mocks/driver-report/src/api/handlers/truckdays.test.ts
import { describe, expect, it } from 'vitest';
import { DomainError } from '@agency/mock';
import { demo } from '../../domain/clock';
import { ctxFor, NATALIA_ACTOR, OLEH_ACTOR, PAVLO_ACTOR, replayDriver, submit, testServer } from '../../test/drive';
import { fillSays, SAYS_TRUCK_DAY } from '../says';
import { officeHandlers } from './office';
import { truckDayHandlers } from './truckdays';

type S = ReturnType<typeof testServer>;
const id = (s: S, kind: 'truck' | 'trailer', plate: string) =>
  (kind === 'truck' ? s.world().trucks : s.world().trailers).find((t) => t.plate === plate)!.id;
const odo = (value: number, basis = 'PLANNED_KM') => ({ value, source: 'DASH_PHOTO', basis, expected: value, read: value, choice: 'CONFIRMED', page_key: null });
const refusal = (fn: () => unknown) => {
  try { fn(); } catch (e) { if (e instanceof DomainError) return { status: e.status, code: e.code, ctx: e.ctx }; throw e; }
  return { status: 0, code: 'RESOLVED', ctx: undefined };
};
function loaded(s: S) {
  submit(s, 'device-000001', 'SHIFT_START', '05:20', { truck_id: id(s, 'truck', 'АР 1234 ВС'), trailer_id: id(s, 'trailer', 'АР 7781 ХР'), plan_match: true, odometer: odo(412355, 'LAST_AT_BASE'), inline: null }, { committed: '05:21' });
  submit(s, 'device-000001', 'ARRIVED', '06:10', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: odo(412391), unplanned_kind: null, new_place: false }, { plan_key: '3312-1' });
}

describe('truck-day (§4.2 C-07 … C-09)', () => {
  it('shows Friday 18.09 as ПЛ-000398 (beat 0)', () => {
    const s = testServer('05:14');
    const day = s.world().truckDays.find((d) => d.waybill_no === 'ПЛ-000398')!;
    const v = truckDayHandlers(s).getTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: day.id } }));
    expect([v.day.waybill_no, v.summary.odometer.value, v.summary.odometer.lines[0]]).toEqual(['ПЛ-000398', '411\u00A0413 → 411\u00A0625', '212 км · з вантажем 98']);
  });
  it('confirms once per version, stamps the next number, and refuses a stale version', () => {
    const s = testServer();
    loaded(s);
    const day = s.world().truckDays.find((d) => d.date === '2026-09-21' && !d.example && d.truck_id === id(s, 'truck', 'АР 1234 ВС'))!;
    const h = truckDayHandlers(s);
    const first = h.confirmTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: day.id }, body: { version: day.version } }));
    const second = h.confirmTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: day.id }, body: { version: day.version } }));
    expect([first.day.waybill_no, second.day.waybill_no]).toEqual(['ПЛ-000411', 'ПЛ-000411']);
    expect(refusal(() => h.confirmTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: day.id }, body: { version: day.version - 1 } }))).code).toBe('DAY_CHANGED');
    expect(refusal(() => h.getTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: 'day-999999' } }))).code).toBe('TRUCK_DAY_NOT_FOUND');
  });
});

describe('Павло’s 21.09 as a waybill (§4.2 C-08, from his own records)', () => {
  it('derives the odometer cell, four legs and the RG fuel cell with no «0 л»', () => {
    const s = testServer();
    replayDriver(s, 'device-000001', '16:03');
    const day = s.world().truckDays.find((d) => d.date === '2026-09-21' && !d.example && d.truck_id === id(s, 'truck', 'АР 1234 ВС'))!;
    s.clock.set(demo('16:05'));
    const v = truckDayHandlers(s).getTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: day.id } }));
    expect([v.summary.odometer.value, v.summary.odometer.lines[0]]).toEqual(['412\u00A0355 → 412\u00A0589', '234 км · з вантажем 175 · порожній 59 · 2\u00A0878 т·км']);
    expect(v.legs.map((l) => l.km)).toEqual([36, 59, 116, 23]);
    expect(v.summary.fuel.value).toBe('31,8 л/100');
    expect(JSON.stringify(v)).not.toMatch(/(^|[^\d,])0 л/);
  });
});

describe('Олег’s 21.09 as a waybill (§4.2 C-08 R+C, from Ruptela)', () => {
  it('reads the day’s CAN fuel off the card-out and sets it against the norm, simulated', () => {
    const s = testServer();
    replayDriver(s, OLEH_ACTOR.id, '16:03');
    const day = s.world().truckDays.find((d) => d.date === '2026-09-21' && !d.example && d.truck_id === id(s, 'truck', 'АР 9012 МК'))!;
    s.clock.set(demo('16:05'));
    const fuel = truckDayHandlers(s).getTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: day.id } })).summary.fuel;
    expect([fuel.value, fuel.lines, fuel.simulated]).toEqual(['86,2 л', ['факт (CAN) · норма 85,4 л · +0,8 л (+0,9 %)'], true]);
  });
});

/** The audit convention office.ts writes and truckday.ts reads (integrator, W0-16 × W0-24): `actor_id` the office user's
 *  store id, `at` the instant, `action` a code, `detail` the sentence. DAY_CHANGED names the newest row that moved the
 *  day's version — a retake request moves none, so it is never the answer. */
describe('DAY_CHANGED names the change the office missed (§7.3, §7.5)', () => {
  it('is the typed ТТН time, not the retake request asked after it', () => {
    const s = testServer();
    replayDriver(s, PAVLO_ACTOR.id, '08:41');
    const day = s.world().truckDays.find((d) => d.date === '2026-09-21' && !d.example && d.truck_id === id(s, 'truck', 'АР 1234 ВС'))!;
    const seen = s.stores.truckDays.get(day.id)!.version;
    const stop = s.world().plannedStops.find((p) => p.plan_key === '3312-1')!.id;
    const rec = s.world().records.filter((r) => r.device_id === PAVLO_ACTOR.id && r.type === 'LOADED').at(-1)!;   // 21.09, not the 18.09 history
    const office = officeHandlers(s);
    s.clock.set(demo('08:43'));
    office.reviewStop(ctxFor(s, NATALIA_ACTOR, { params: { id: stop }, body: { action: 'SET_FIELD', doc_index: 1, field: 'arrival', value: '0748' } }));
    s.clock.set(demo('08:44'));
    office.createRequest(ctxFor(s, NATALIA_ACTOR, { body: { type: 'RETAKE_PHOTO', record_key: rec.key, page_key: `${rec.key}:p4`, reasons: ['BLUR'] } }));
    const err = refusal(() => truckDayHandlers(s).confirmTruckDay(ctxFor(s, NATALIA_ACTOR, { params: { id: day.id }, body: { version: seen } })));
    expect(err).toMatchObject({ status: 409, code: 'DAY_CHANGED', ctx: { by: 'Н. Шевчук', at: demo('08:43'), change: 'ввела час прибуття 07:48 · ТТН 004517' } });
    expect(fillSays(SAYS_TRUCK_DAY.DAY_CHANGED, err))
      .toBe('День змінено: Н. Шевчук 08:43 — ввела час прибуття 07:48 · ТТН 004517. Перегляньте й підтвердіть ще раз.');
  });
});
