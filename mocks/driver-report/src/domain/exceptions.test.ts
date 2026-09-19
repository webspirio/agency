// mocks/driver-report/src/domain/exceptions.test.ts
import { describe, expect, it } from 'vitest';
import { demo } from './clock';
import { closedToday, counts, itemById, openItems, resolvedToday } from './exceptions';
import { mkPage, mkRecord, openDay, seededWorld, withRows } from './fixtures';
import type { Resolution, World } from './types';

const PAVLO = 'device-000001';
const NB = ' ';
function loadedWorld(extra: { noDoc?: boolean } = {}): World {
  const { w, shift } = openDay(seededWorld(), { device: PAVLO, plate: 'АР 1234 ВС', at: '05:20' });
  const arrived = mkRecord(w, { type: 'ARRIVED', device: PAVLO, at: '06:10', plan_key: '3312-1', shift,
    payload: { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: null, unplanned_kind: null, new_place: false } });
  const loaded = mkRecord(w, { type: 'LOADED', device: PAVLO, at: '08:40', plan_key: '3312-1', shift,
    payload: { ttn_count: 2, pages: [], no_doc_reason: extra.noDoc ? 'SHIPPER_REFUSED' : null, deferred: null } });
  const pages = extra.noDoc ? [] : [1, 2, 3, 4].map((n) => mkPage(w, { record: loaded, artefact: n % 2 ? 'TTN_FRONT' : 'TTN_BACK', n, variant: 'v', at: '08:39' }));
  return withRows(w, { records: [arrived, loaded], pages });
}
const resolve = (item_id: string, action: Resolution['action']): Resolution =>
  ({ id: `res-${item_id}`, item_id, code: 'STOP_REVIEW', action, reason: 'NOT_A_PROBLEM', by: 'user-000001', at: demo('10:14') });

describe('exceptions (§7.3, §4.2 C-02, C-03)', () => {
  it('counts nothing but Олег’s overdue original in the pilot at 05:14', () => {
    expect(counts(seededWorld(), 'PILOT', demo('05:14'))).toEqual({ now: 0, review: 0, days_to_confirm: 0, originals: 1, bas_ready: 0 });
  });
  it('holds a loading with ТТН pages and unconfirmed fields in «Перевірка» (STOP_REVIEW)', () => {
    const items = openItems(loadedWorld(), 'PILOT', demo('08:42'), 'REVIEW');
    expect(items.map((i) => [i.code, i.group, i.tone, i.title, i.primary_action, i.meta])).toEqual([[
      'STOP_REVIEW', 'MONEY', 'hold', 'Вільнянськ · завантаження · 2 ТТН, 4 стор. · поля не підтверджено', 'CHECK',
      'АР 1234 ВС · Ватаманюк П. · Вільнянськ']]);
  });
  it('closes STOP_REVIEW by itself once the stop is accepted', () => {
    const w = loadedWorld();
    const accepted = { ...w, plannedStops: w.plannedStops.map((s) => (s.plan_key === '3312-1' ? { ...s, accepted_at: demo('10:09'), accepted_by: 'user-000001' } : s)) };
    expect(openItems(accepted, 'PILOT', demo('10:10'), 'REVIEW')).toEqual([]);
  });
  it('raises «Завантажено без ТТН» in «Зараз», in brick', () => {
    const [item] = openItems(loadedWorld({ noDoc: true }), 'PILOT', demo('08:45'), 'NOW');
    expect(item).toMatchObject({ code: 'NO_TTN_AT_DEPARTURE', tone: 'reject', primary_action: 'CALL', title: `Завантажено без ТТН · штраф 17${NB}000 грн`, age_min: 5 });
  });
  it('closes an item on RESOLVE and marks who took it on TAKE', () => {
    const w = loadedWorld();
    const id = openItems(w, 'PILOT', demo('08:42'), 'REVIEW')[0]!.id;
    expect(itemById(withRows(w, { resolutions: [resolve(id, 'TAKE')] }), id, demo('08:43'))?.taken_by).toBe('НШ');
    expect(openItems(withRows(w, { resolutions: [resolve(id, 'RESOLVE')] }), 'PILOT', demo('08:43'), 'REVIEW')).toEqual([]);
    expect(resolvedToday(withRows(w, { resolutions: [resolve(id, 'RESOLVE')] }), 'PILOT', demo('10:15'), 'REVIEW').map((i) => i.resolved))
      .toEqual([{ by: 'Н. Шевчук', at: demo('10:14'), reason: 'Не є проблемою', correction: null }]);
  });
  it('shows Ярошенко’s typed odometer as one item with its evidence line', () => {
    const items = openItems(seededWorld(), 'FLEET', demo('16:05'), 'REVIEW').filter((i) => i.group === 'ODOMETER' && i.code !== 'SAMPLE_CHECK');
    expect(items.map((i) => [i.code, i.title, i.evidence])).toEqual([['ODOMETER_TYPED', 'Одометр: початок зміни 05:40',
      { kind: 'line', text: `318${NB}405 · введено вручну · очікували ~381${NB}402 · водій залишив як є` }]]);
  });
  it('joins the example items in the fleet scope, only once they happened', () => {
    const w = seededWorld();
    expect(openItems(w, 'FLEET', demo('15:21'), 'NOW').map((i) => i.code)).toEqual(['BREAKDOWN_CANT_DRIVE']);
    expect(openItems(w, 'FLEET', demo('16:05'), 'NOW')).toHaveLength(3);
    expect(openItems(w, 'PILOT', demo('16:05'), 'NOW')).toHaveLength(0);
  });
  it('counts the raw fleet at 16:05: 3 now, 11 review, 6 ready, 4 originals, 56 not exported', () => {
    expect(counts(seededWorld(), 'FLEET', demo('16:05'))).toEqual({ now: 3, review: 11, days_to_confirm: 6, originals: 4, bas_ready: 56 });
  });
  it('reports the self-closed count of the day', () => {
    expect(closedToday(seededWorld(), 'PILOT', demo('16:05'))).toBe(0);
    expect(closedToday(seededWorld(), 'FLEET', demo('16:05'))).toBe(13);
  });
});
