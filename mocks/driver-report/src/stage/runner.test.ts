// mocks/driver-report/src/stage/runner.test.ts
import { describe, expect, it } from 'vitest';
import { api, call } from '../api/contract';
import { server } from '../api/server';
import { buildPages, buildRecord } from '../app/records';
import { demo } from '../domain/clock';
import { BEATS, HRYHORII, NATALIA, OLEH, PAVLO, REVOKED_DEVICE, SCRIPT } from '../domain/script';
import { transportAs } from '../test/harness';
import { checkpointsAfter, consoleHash, ensureBooted, rebuild, replayWrites, rewindTo, watchLiveTwins } from './runner';

const counts = async (scope: 'PILOT' | 'FLEET') => {
  const s = await call(transportAs(NATALIA, ['dispatcher']), 'getOfficeSummary', { params: {}, body: undefined, qry: { scope } });
  return [s.counts.now, s.counts.review, s.counts.days_to_confirm, s.counts.originals, s.counts.bas_ready];
};

describe('rewind and live twins (§5.8, §8.6 #20, #25)', () => {
  it('retires the retake done live in beat 5, so «Перемотати до… 11:50» leaves one PHOTO_REPLACE', async () => {
    await rebuild(5);
    const stop = watchLiveTwins();
    const office = transportAs(NATALIA, ['dispatcher']);
    const phone = transportAs({ id: PAVLO, role: 'driver' }, ['driver']);
    const loadedKey = server.scriptRefs['S-10']!;
    const req = await call(office, 'createRequest', { params: {}, body: { type: 'RETAKE_PHOTO', record_key: loadedKey, page_key: `${loadedKey}:p4`, reasons: ['BLUR'] } });
    server.clock.set(demo('08:43'));
    const seen = server.mintSeq(PAVLO);
    await call(phone, 'submitRecord', { params: {}, body: buildRecord({ deviceId: PAVLO, seq: seen, occurredAt: demo('08:43'), committedAt: demo('08:43') }, 'REQUEST_SEEN', { request_id: req.id }) });
    server.clock.set(demo('08:44'));
    const seq = server.mintSeq(PAVLO);
    const key = `${PAVLO}:${seq}`;
    const [page] = buildPages(key, [{ artefact: 'TTN_BACK', doc_index: 2, page_no: 2, captured_at: demo('08:44'), source: 'DRAWN', bytes: 700000,
      quality: 'OK', quality_reasons: [], deferred: null, drawn: { variant: 'ttn-004518-back', value: null, sim_read: null }, image: null }]);
    await call(phone, 'submitRecord', { params: {}, body: buildRecord({ deviceId: PAVLO, seq, occurredAt: demo('08:44'), committedAt: demo('08:44'),
      stopId: server.world().plannedStops.find((p) => p.plan_key === '3312-1')!.id }, 'PHOTO_REPLACE', { request_id: req.id, page_key: page!.key, supersedes: `${loadedKey}:p4` }) });
    await call(phone, 'uploadPhoto', { params: {}, body: page! });
    await rewindTo(demo('11:50'));
    expect(server.world().records.filter((r) => r.type === 'PHOTO_REPLACE')).toHaveLength(1);
    expect(server.world().requests).toHaveLength(1);
    stop();
  }, 20_000);
  it('rewinds 05:14 → 16:02 onto beat 9’s counts and raises nothing the script does not contain', async () => {
    await rebuild(0);
    await rewindTo(demo('16:02'));
    expect(await counts('PILOT')).toEqual([...BEATS[9]!.counts]);
  }, 20_000);
  it('never moves backwards and lists only later checkpoints', async () => {
    await rebuild(8);
    await rewindTo(demo('06:10'));
    expect(server.clock.nowIso()).toBe(demo('11:50'));
    expect(checkpointsAfter(demo('11:50')).map((c) => c.label)).toEqual(['тривога', 'кінець тривоги', 'база', 'офіс, кінець дня']);
  }, 20_000);
  it('replays only operations the contract declares', () => {
    for (const e of SCRIPT) if (e.step.kind === 'op') expect([e.id, e.step.op in api]).toEqual([e.id, true]);
  });
  it('yields the same ids for the same beat, in under a second', async () => {
    await rebuild(11);
    const first = JSON.stringify(server.world());
    const t0 = performance.now();
    await rebuild(11);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(JSON.stringify(server.world())).toBe(first);
  }, 20_000);
});

/* Added by W0-20 beyond the plan's cases: the heartbeats, the beat's console route, the boot and the log replay are
 * behaviour the cases above never observe (the sidebar counts do not read a phone's last contact). */
describe('heartbeats, console routes, boot and replay (§5.6, §5.8, §7.7)', () => {
  const contact = (id: string) => server.world().devices.find((d) => d.id === id)!;
  it('has every bound phone report in at the beat’s clock with nothing unsent; a revoked phone stays silent', async () => {
    await rebuild(9);
    const heard = server.world().devices.filter((d) => d.driver_id !== null && d.revoked_at === null);
    expect(heard.map((d) => [d.id, d.last_contact_at, d.unsent_at_contact])).toEqual(heard.map((d) => [d.id, BEATS[9]!.clock, 0]));
    expect(heard.map((d) => d.id)).toEqual(expect.arrayContaining([PAVLO, OLEH, HRYHORII, 'device-000004']));
    expect(contact(REVOKED_DEVICE).last_contact_at).not.toBe(BEATS[9]!.clock);
  }, 20_000);
  it('keeps the three stage phones silent in a rewind while «Офлайн» is on', async () => {
    await rebuild(8);
    server.setToggle('offline', true);
    await rewindTo(demo('12:30'));
    expect([contact(PAVLO).last_contact_at, contact('device-000004').last_contact_at]).toEqual([demo('11:50'), demo('12:30')]);
  }, 20_000);
  it('resolves each beat’s console route against the world', async () => {
    await rebuild(0);
    const w = server.world();
    const truck = w.trucks.find((t) => t.plate === 'АР 1234 ВС')!;
    const friday = w.truckDays.find((d) => d.truck_id === truck.id && d.date === '2026-09-18')!;
    const savenko = w.drivers.find((d) => d.tab_no === '0457')!;
    expect([consoleHash(BEATS[0]!), consoleHash(BEATS[1]!), consoleHash(BEATS[5]!)])
      .toEqual([`#/day/${friday.id}`, `#/drivers?open=${savenko.id}`, '#/inbox/review']);
  }, 20_000);
  it('boots once per realm, and never over a server that already sits at a beat', async () => {
    server.reset();
    const [a, b] = [ensureBooted(4), ensureBooted(6)];
    await Promise.all([a, b]);
    expect(server.ui.beat).toBe(4);
    const done = [...server.done];
    await ensureBooted(9);
    expect([server.ui.beat, server.done]).toEqual([4, done]);
  }, 20_000);
  it('replays logged writes through the route table and moves the phone’s seq past each replayed record', async () => {
    await rebuild(2);
    const seq = server.world().devices.find((d) => d.id === PAVLO)!.next_seq + 5;
    const record = buildRecord({ deviceId: PAVLO, seq, occurredAt: demo('05:21'), committedAt: demo('05:21') }, 'CALL_ME', {});
    await replayWrites([{ op: 'submitRecord', actor: { id: PAVLO, role: 'driver' }, at: demo('05:21'), params: {}, body: record }]);
    expect(server.world().records.find((r) => r.key === record.key)?.received_at).toBe(demo('05:21'));
    expect(server.mintSeq(PAVLO)).toBe(seq + 1);
  }, 20_000);
});
