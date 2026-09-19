// mocks/driver-report/src/domain/derive.test.ts
import { describe, expect, it } from 'vitest';
import { demo } from './clock';
import { boardState, dayTotals, legsOfDay, stopFacts, stopsOfDay, truckDayIdFor, visibleTelemetry, docCounts } from './derive';
import { mkPage, mkRecord, openDay, seededWorld, stopOf, truckOf, withRows } from './fixtures';
import type { DriverRecord, Odometer, RecordType, World } from './types';

const PAVLO = 'device-000001';
const odo = (value: number, basis: Odometer['basis'] = 'PLANNED_KM'): Odometer =>
  ({ value, source: 'DASH_PHOTO', basis, expected: value, read: value, choice: 'CONFIRMED', page_key: null });

function pavloDay(upTo: 'loaded' | 'full' | 'no-docs'): { w: World; dayId: string } {
  const base = seededWorld();
  const { w, day, shift } = openDay(base, { device: PAVLO, plate: 'АР 1234 ВС', at: '05:20' });
  const t = truckOf(w, 'АР 1234 ВС');
  const r = (type: RecordType, at: string, plan_key: string | null, payload: unknown, place_code?: string): DriverRecord =>
    mkRecord(w, { type, device: PAVLO, at, plan_key, place_code, payload: payload as never, shift });
  const recs = [
    r('SHIFT_START', '05:20', null, { truck_id: t.id, trailer_id: t.trailer_id, plan_match: true, odometer: odo(412355, 'LAST_AT_BASE'), inline: null } as never),
    r('ARRIVED', '06:10', '3312-1', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: odo(412391), unplanned_kind: null, new_place: false } as never),
  ];
  const loaded = r('LOADED', '08:40', '3312-1', { ttn_count: 2, pages: [], no_doc_reason: null, deferred: null } as never);
  recs.push(loaded);
  const pages = [1, 2, 3, 4].map((n) => mkPage(w, { record: loaded, artefact: n % 2 ? 'TTN_FRONT' : 'TTN_BACK', n, variant: 'v', at: '08:39' }));
  if (upTo !== 'loaded') {
    recs.push(
      r('REFUEL', '08:57', null, { station: 'ОККО Н-08', receipt_no: '58213', rro_no: '3000211458', sum_uah: '22800.00', card_mask: '****4417', full_tank: true, odometer: odo(412398), deferred: false } as never, 'OKKO'),
      r('ARRIVED', '10:05', '3312-2', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: odo(412450), unplanned_kind: null, new_place: false } as never),
      r('UNLOADED', '11:50', '3312-2', { drop_index: 1, pages: [], deferred: null, no_doc_reason: null } as never),
      r('ARRIVED', '13:45', '3312-3', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: null, unplanned_kind: null, new_place: false } as never),
      r('UNLOADED', '15:08', '3312-3', { drop_index: 2, pages: [], deferred: 'AFTER_EXIT', no_doc_reason: null } as never),
    );
    if (upTo === 'full') {
      recs.push(r('DOCS_ADDED', '15:17', '3312-3', { pages: [], odometer: { ...odo(412566), source: 'PLAN_CONFIRMED', read: 412866, choice: 'DIGIT_EXPECTED' }, deferred: 'AFTER_EXIT' } as never));
    }
    recs.push(r('SHIFT_END', '16:02', null, { odometer: odo(412589), place_id: null } as never));
  }
  return { w: withRows(w, { records: recs, pages }), dayId: day.id };
}

describe('stops (§7.3)', () => {
  it('opens at the arrival and completes at the loading, final on-site time 2 год 30 хв', () => {
    const { w } = pavloDay('loaded');
    const s = stopFacts(w, stopOf(w, '3312-1').id, demo('09:00'))!;
    expect([s.arrived_at, s.completed_at, s.on_site_min, s.arrival]).toEqual([demo('06:10'), demo('08:40'), 150, 'DRIVER']);
    expect(s.departure).toEqual({ kind: 'RECORD', at: demo('08:40') });
    expect(s.segments).toEqual([{ chip: 'QUEUE', from: demo('06:10') }]);
  });
  it('marks a departure unknown when the photos came after the truck moved', () => {
    const { w } = pavloDay('full');
    expect(stopFacts(w, stopOf(w, '3312-3').id, demo('16:05'))!.departure).toEqual({ kind: 'UNKNOWN', at: null });
  });
  it('opens an R+C stop from the Ruptela IN, only once the clock passes it', () => {
    const w = seededWorld();
    const olegStop = stopOf(w, '3313-1').id;
    expect(stopFacts(w, olegStop, demo('08:00'))!.arrived_at).toBeNull();
    const s = stopFacts(w, olegStop, demo('09:00'))!;
    expect([s.arrival, s.arrived_at]).toEqual(['RUPTELA', demo('08:05')]);
    expect(s.departure).toEqual({ kind: 'RUPTELA', at: demo('08:55') });
    expect(visibleTelemetry(w, truckOf(w, 'АР 9012 МК').id, demo('07:25')).map((t) => t.kind)).toEqual(['CARD_IN']);
  });
});

describe('legs and kilometres (§4.2 C-08 «Ділянки», §8.6 #7)', () => {
  it('derives Павло’s four legs, 234 km, 175 loaded, 2 878 t·km', () => {
    const { w, dayId } = pavloDay('full');
    const legs = legsOfDay(w, dayId, demo('16:05'));
    expect(legs.map((l) => [l.km, l.loaded, l.mass, l.tkm])).toEqual([
      [36, false, null, null], [59, true, '24.400', '1439.6'], [116, true, '12.400', '1438.4'], [23, false, null, null]]);
    expect(dayTotals(legs)).toEqual({ km: 234, loaded: 175, empty: 59, tkm: '2878.0' });
  });
  it('renders a leg with an unknown point as unknown, never 0', () => {
    const { w, dayId } = pavloDay('no-docs');
    const legs = legsOfDay(w, dayId, demo('16:05'));
    expect(legs.map((l) => l.km)).toEqual([36, 59, null, null]);
    expect(dayTotals(legs).km).toBeNull();
  });
  it('finds a truck-day by truck and business date, and nothing for a day without a shift', () => {
    const w = seededWorld();
    const id = truckOf(w, 'АР 1234 ВС').id;
    expect(truckDayIdFor(w, id, '2026-09-20' as never)).not.toBeNull();
    expect(truckDayIdFor(w, id, '2026-09-22' as never)).toBeNull();
  });
});

describe('board state (§4.2 C-01)', () => {
  it('reads the pilot at 05:14', () => {
    const w = seededWorld();
    expect(boardState(w, truckOf(w, 'АР 1234 ВС').id, demo('05:14'))).toMatchObject({ state: 'Не на зміні · план з 05:30', rank: 6 });
    expect(boardState(w, truckOf(w, 'АР 9012 МК').id, demo('05:14'))).toMatchObject({ state: 'На базі · план з 07:30', rank: 6 });
    expect(boardState(w, truckOf(w, 'АР 7390 ЕВ').id, demo('05:14'))).toMatchObject({ state: 'Не на зміні · телефон не підключено' });
    expect(boardState(w, truckOf(w, 'АР 1234 ВС').id, demo('05:14')).line).toMatch(/· позиція — з Регісу, фаза 2$/);
  });
  it('reads a queue, a loaded drive and a finished day', () => {
    const { w } = pavloDay('loaded');
    const id = truckOf(w, 'АР 1234 ВС').id;
    expect(boardState(w, id, demo('07:22'))).toMatchObject({ state: 'У черзі на завантаження', line: 'Черга · 1:12', rank: 5 });
    expect(boardState(w, id, demo('08:54'))).toMatchObject({ state: 'Їде завантажений', line: '0:14 · до Синельникове 52 км' });
    const full = pavloDay('full').w;
    expect(boardState(full, id, demo('16:05')).state).toBe('Не на зміні · закінчив 16:02 · водій не підтвердив');
  });
  it('ranks a stop over two hours above moving trucks', () => {
    const { w } = pavloDay('loaded');
    expect(boardState(w, truckOf(w, 'АР 1234 ВС').id, demo('08:20')).rank).toBe(3);
  });
});

describe('documents (§4.2 C-01 DocDots)', () => {
  it('counts ТТН pages received', () => {
    const { w, dayId } = pavloDay('loaded');
    expect(docCounts(w, dayId, demo('09:00'))).toMatchObject({ ttn: 'full', signed: 'none', receipts: 'none' });
  });
  it('lists the ТТН of the day still owed in paper', () => {
    const { w, dayId } = pavloDay('full');
    expect(stopsOfDay(w, dayId, demo('16:05'))).toHaveLength(4);
    expect(docCounts(w, dayId, demo('16:05')).owed).toEqual(['004517', '004518']);
  });
});
