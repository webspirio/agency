// mocks/driver-report/src/stage/log.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=demo'); });
import { call } from '../api/contract';
import { server } from '../api/server';
import { buildRecord } from '../app/records';
import { demo } from '../domain/clock';
import { PAVLO } from '../domain/script';
import { transportAs } from '../test/harness';
import { readLog, recoverFromLog, startLog, STAGE_LOG_KEY } from './log';
import { rebuild } from './runner';

describe('a reload returns to the same beat, clock, toggles and live records (§5.8, §8.4 #9)', () => {
  it('logs actions, not rows, and replays them', async () => {
    await rebuild(7);
    const stop = startLog();
    server.setToggle('offline', true);
    server.setToggle('offline', false);
    const seq = server.mintSeq(PAVLO);
    await call(transportAs({ id: PAVLO, role: 'driver' }, ['driver']), 'submitRecord', { params: {}, body: buildRecord({ deviceId: PAVLO, seq,
      occurredAt: demo('08:57'), committedAt: demo('08:57') }, 'CALL_ME', {}) });
    stop();
    const log = readLog()!;
    expect([log.beat, log.writes.length, log.writes[0]!.op]).toEqual([7, 1, 'submitRecord']);
    expect(sessionStorage.getItem(STAGE_LOG_KEY)).not.toContain('"records"');
    await rebuild(0);
    expect(await recoverFromLog()).toBe(true);
    expect([server.ui.beat, server.world().records.filter((r) => r.type === 'CALL_ME' && r.device_id === PAVLO).length]).toEqual([7, 1]);
    expect(Math.abs(Date.parse(server.clock.nowIso()) - Date.parse(log.clockAnchor))).toBeLessThan(2000);
  });
});
