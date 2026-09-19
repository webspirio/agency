// mocks/driver-report/src/api/handlers/office.test.ts
import { describe, expect, it } from 'vitest';
import { DomainError } from '@agency/mock';
import { demo } from '../../domain/clock';
import { ctxFor, NATALIA_ACTOR, submit, testServer } from '../../test/drive';
import { officeHandlers } from './office';

type S = ReturnType<typeof testServer>;
const id = (s: S, kind: 'truck' | 'trailer', plate: string) =>
  (kind === 'truck' ? s.world().trucks : s.world().trailers).find((t) => t.plate === plate)!.id;
const odo = (value: number, basis = 'PLANNED_KM') => ({ value, source: 'DASH_PHOTO', basis, expected: value, read: value, choice: 'CONFIRMED', page_key: null });
const refusal = (fn: () => unknown) => {
  try { fn(); } catch (e) { if (e instanceof DomainError) return { status: e.status, code: e.code, ctx: e.ctx }; throw e; }
  return { status: 0, code: 'RESOLVED', ctx: undefined };
};
/** Павло to 08:41: shift, arrival, loading with four ТТН pages. */
function loaded(s: S) {
  submit(s, 'device-000001', 'SHIFT_START', '05:20', { truck_id: id(s, 'truck', 'АР 1234 ВС'), trailer_id: id(s, 'trailer', 'АР 7781 ХР'), plan_match: true, odometer: odo(412355, 'LAST_AT_BASE'), inline: null }, { committed: '05:21' });
  submit(s, 'device-000001', 'ARRIVED', '06:10', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: odo(412391), unplanned_kind: null, new_place: false }, { plan_key: '3312-1' });
  return submit(s, 'device-000001', 'LOADED', '08:40', { ttn_count: 2, pages: [], no_doc_reason: null, deferred: null }, { plan_key: '3312-1', committed: '08:41', pages: [
    { artefact: 'TTN_FRONT', doc_index: 1, page_no: 1, variant: 'ttn-004517-front' }, { artefact: 'TTN_BACK', doc_index: 1, page_no: 2, variant: 'ttn-004517-back' },
    { artefact: 'TTN_FRONT', doc_index: 2, page_no: 1, variant: 'ttn-004518-front' }, { artefact: 'TTN_BACK', doc_index: 2, page_no: 2, variant: 'ttn-004518-back:soft' }] });
}
const stopId = (s: S, key: string) => s.world().plannedStops.find((p) => p.plan_key === key)!.id;

describe('office summary and board (§4.1, §4.2 C-01)', () => {
  it('counts the pilot at 05:14 and names the user', () => {
    const s = testServer('05:14');
    const sum = officeHandlers(s).getOfficeSummary(ctxFor(s, NATALIA_ACTOR, { query: { scope: 'PILOT' } }));
    expect([sum.counts, sum.user.name, sum.user.role_label, sum.caption]).toEqual([{ now: 0, review: 0, days_to_confirm: 0, originals: 1, bas_ready: 0 },
      'Наталія Шевчук', 'оператор', 'Пілот: 3 машини · нижче — як це виглядатиме на всіх 100']);
  });
  it('lists the three pilot trucks at 05:14 with their states and sources', () => {
    const s = testServer('05:14');
    const rows = officeHandlers(s).listFleet(ctxFor(s, NATALIA_ACTOR, { query: { scope: 'PILOT', limit: '100' } })).data;
    expect(rows.map((r) => [r.plate, r.driver, r.state, r.odometer.value, r.odometer.source, r.badge])).toEqual([
      ['АР 1234 ВС', 'Ватаманюк П.', 'Не на зміні · план з 05:30', 412355, 'PHOTO', 'REGIS'],
      ['АР 7390 ЕВ', 'Савенко Г.', 'Не на зміні · телефон не підключено', 356118, 'OFFICE', 'REGIS'],
      ['АР 9012 МК', 'Кравчук О.', 'На базі · план з 07:30', 241476, 'CAN', 'RUPTELA'],
    ]);
  });
  it('lists 100 trucks in the fleet scope, needs-action first', () => {
    const s = testServer('16:05');
    const page = officeHandlers(s).listFleet(ctxFor(s, NATALIA_ACTOR, { query: { scope: 'FLEET', limit: '100' } }));
    expect([page.total, page.data[0]!.rank]).toEqual([100, 1]);
  });
});

describe('paper-mirror review (§4.2 C-04)', () => {
  it('accepts the printed fields and derives the arrival reading from a typed time', () => {
    const s = testServer();
    loaded(s);
    s.clock.set(demo('08:43'));
    const h = officeHandlers(s);
    const sid = stopId(s, '3312-1');
    h.reviewStop(ctxFor(s, NATALIA_ACTOR, { params: { id: sid }, body: { action: 'ACCEPT_PRINTED', doc_index: 1 } }));
    const r = h.reviewStop(ctxFor(s, NATALIA_ACTOR, { params: { id: sid }, body: { action: 'SET_FIELD', doc_index: 1, field: 'arrival', value: '0748' } }));
    expect(r.docs[0]!.printed.find((f) => f.field === 'no')).toMatchObject({ value: '004517', source: 'OCR', source_line: 'OCR · підтвердила Н. Шевчук 08:43' });
    expect(r.docs[0]!.derived).toEqual({ tone: 'plain', text: 'Прибуття за ТТН 07:48 · водій на місці з 06:10 → до відмітки 1 год 38 хв · не простій за Правилами (п.8.25), лише за договором' });
    expect(r.stop.title).toBe('Вільнянськ · завантаження · АР 1234 ВС · 21.09');
  });
  it('refuses a bad time, an unknown stop and a confirmed day', () => {
    const s = testServer();
    loaded(s);
    const h = officeHandlers(s);
    const sid = stopId(s, '3312-1');
    expect(refusal(() => h.reviewStop(ctxFor(s, NATALIA_ACTOR, { params: { id: sid }, body: { action: 'SET_FIELD', doc_index: 1, field: 'arrival', value: '748' } }))).code).toBe('VALUE_INVALID');
    expect(refusal(() => h.getStopReview(ctxFor(s, NATALIA_ACTOR, { params: { id: 'stop-999999' } }))).code).toBe('STOP_NOT_FOUND');
  });
});

describe('requests and corrections (§4.2 C-05, C-06)', () => {
  it('creates a retake request and refuses a second with who, when and state', () => {
    const s = testServer();
    const { key } = loaded(s);
    s.clock.set(demo('08:43'));
    const h = officeHandlers(s);
    const body = { type: 'RETAKE_PHOTO', record_key: key, page_key: `${key}:p4`, reasons: ['BLUR'] };
    expect(h.createRequest(ctxFor(s, NATALIA_ACTOR, { body })).target_label).toBe('ТТН 2 з 2, зворотний бік');
    expect(refusal(() => h.createRequest(ctxFor(s, NATALIA_ACTOR, { body })))).toMatchObject({ status: 409, code: 'REQUEST_ALREADY_OPEN', ctx: { by: 'Н. Шевчук', at: demo('08:43'), state: 'надіслано' } });
    expect(refusal(() => h.createRequest(ctxFor(s, NATALIA_ACTOR, { body: { ...body, record_key: 'device-000001:1' } }))).code).toBe('TARGET_NOT_FOUND');
  });
  it('corrects Ярошенко’s typed odometer and tells the driver in his words', () => {
    const s = testServer('16:05');
    const rec = s.world().records.find((r) => r.device_id === 'device-000006' && r.type === 'SHIFT_START')!;
    const c = officeHandlers(s).createCorrection(ctxFor(s, NATALIA_ACTOR, { body: { record_key: rec.key, field: 'odometer', value: '381405', reason: 'TYPO' } }));
    expect([c.old, c.new, c.driver_wording]).toEqual(['318405', '381405', 'число виправлено за фото щитка']);
    expect(refusal(() => officeHandlers(s).createCorrection(ctxFor(s, NATALIA_ACTOR, { body: { record_key: rec.key, field: 'odometer', value: '38 1405', reason: 'TYPO' } }))).code).toBe('VALUE_INVALID');
  });
});

describe('lanes keep what was closed today (§4.2 C-02, C-05)', () => {
  it('lists Ярошенко’s item after its correction, struck, and still counts it out', () => {
    const s = testServer('16:05');
    const h = officeHandlers(s);
    const rec = s.world().records.find((r) => r.device_id === 'device-000006' && r.type === 'SHIFT_START')!;
    h.createCorrection(ctxFor(s, NATALIA_ACTOR, { body: { record_key: rec.key, field: 'odometer', value: '381405', reason: 'TYPO' } }));
    const items = h.listExceptions(ctxFor(s, NATALIA_ACTOR, { query: { lane: 'REVIEW', scope: 'FLEET', limit: '100' } })).data;
    expect(items.find((i) => i.code === 'ODOMETER_TYPED')!.resolved).toMatchObject({ by: 'Н. Шевчук', reason: 'одруківка',
      correction: { old: '318405', new: '381405' } });
    expect(h.getOfficeSummary(ctxFor(s, NATALIA_ACTOR, { query: { scope: 'FLEET' } })).counts.review).toBe(10);
  });
});
