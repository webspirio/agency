// mocks/driver-report/src/app/outbox.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001'); });
import { server } from '../api/server';
import { demo } from '../domain/clock';
import { lte } from '../domain/num';
import { backoffMs, enqueue, PHOTO_LATENCY_MS, RECORD_LATENCY_MS, receiptState, startOutbox, syncState, undo } from './outbox';
import { buildPages, buildRecord } from './records';

const D = 'device-000001';
const truck = () => server.world().trucks.find((t) => t.plate === 'АР 1234 ВС')!;
function shiftStart() {
  const seq = server.mintSeq(D);
  return enqueue(D, { record: buildRecord({ deviceId: D, seq, occurredAt: demo('05:20'), committedAt: demo('05:21') }, 'SHIFT_START',
    { truck_id: truck().id, trailer_id: truck().trailer_id, plan_match: true, odometer: null, inline: null }), pages: [], receipt: { title: 'Зміну почато 05:20', next: null } });
}
function loadedWithFour() {
  const seq = server.mintSeq(D);
  const key = `${D}:${seq}`;
  const stop = server.world().plannedStops.find((p) => p.plan_key === '3312-1')!;
  const pages = buildPages(key, [1, 2, 3, 4].map((n) => ({ artefact: n % 2 ? 'TTN_FRONT' : 'TTN_BACK', doc_index: lte(n, 2) ? 1 : 2, page_no: n % 2 ? 1 : 2,
    captured_at: demo('08:39'), source: 'DRAWN', bytes: 700000, quality: 'OK', quality_reasons: [], deferred: null, drawn: { variant: 'v', value: null, sim_read: null }, image: null } as const)));
  return enqueue(D, { record: buildRecord({ deviceId: D, seq, occurredAt: demo('08:40'), committedAt: demo('08:41'), stopId: stop.id, placeId: stop.place_id },
    'LOADED', { ttn_count: 2, pages: pages.map((p) => p.key), no_doc_reason: null, deferred: null }), pages, receipt: { title: 'Завантажено 08:40 · 2 ТТН, 4 стор.', next: null } });
}
const entry = (key: string) => server.phone(D).outbox.find((e) => e.key === key)!;

beforeEach(() => { vi.useFakeTimers(); server.reset(); server.clock.set(demo('05:21')); });
afterEach(() => { vi.useRealTimers(); });

describe('the outbox (§7.7, §3.3 D-02 receipt, §8.6 #1)', () => {
  it('walks a record LOCAL → ACKED → PHOTOS → DONE and words the receipt at each step', async () => {
    const stop = startOutbox(D);
    shiftStart();
    await vi.advanceTimersByTimeAsync(RECORD_LATENCY_MS + 10);
    server.clock.set(demo('08:41'));
    const e = loadedWithFour();
    expect(receiptState(entry(e.key), false, demo('08:41')).text).toBe('Збережено в телефоні · №0418');
    await vi.advanceTimersByTimeAsync(RECORD_LATENCY_MS + 10);
    expect(receiptState(entry(e.key), false, demo('08:41'))).toMatchObject({ text: 'В офісі ✓ 08:41', photo_hold: 'фото 4 з 4 ще в телефоні', acknowledged: false });
    await vi.advanceTimersByTimeAsync(PHOTO_LATENCY_MS);
    expect(receiptState(entry(e.key), false, demo('08:41')).photo_hold).toBe('фото 3 з 4 ще в телефоні');
    server.clock.set(demo('08:42'));
    await vi.advanceTimersByTimeAsync(PHOTO_LATENCY_MS + PHOTO_LATENCY_MS + PHOTO_LATENCY_MS + 10);
    expect(receiptState(entry(e.key), false, demo('08:42'))).toMatchObject({ text: 'В офісі ✓ 08:42', photo_hold: null, acknowledged: true });
    stop();
  });
  it('holds everything offline and replays in seq order once online (beat 7)', async () => {
    const stop = startOutbox(D);
    server.setToggle('offline', true);
    const a = shiftStart();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(receiptState(entry(a.key), true, demo('05:21')).text).toBe('Збережено в телефоні · №0417 · надішлеться сам');
    expect(server.world().records.filter((r) => r.device_id === D && r.occurred_at === demo('05:20'))).toHaveLength(0);
    server.setToggle('offline', false);
    await vi.advanceTimersByTimeAsync(RECORD_LATENCY_MS + 10);
    expect(entry(a.key).state).toBe('DONE');
    stop();
  });
  it('undoes a LOCAL record by removing it', () => {
    server.setToggle('offline', true);
    const a = shiftStart();
    undo(D, a.key);
    expect(server.phone(D).outbox).toHaveLength(0);
  });
  it('backs off 2, 4, 8, 16, 30, 30 seconds', () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffMs)).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
  });
  it('words the sync strip', () => {
    const e = shiftStart();
    expect(syncState([entry(e.key)], true, demo('08:57')).text).toBe("1 запис чекає інтернету · останній зв'язок 08:57");
    expect(syncState([], false, demo('08:42')).text).toBe("Все в офісі · останній зв'язок 08:42");
  });
});
