// mocks/driver-report/src/stage/beats.test.ts
import { describe, expect, it } from 'vitest';
import { call } from '../api/contract';
import { server } from '../api/server';
import { BEATS, NATALIA } from '../domain/script';
import { transportAs } from '../test/harness';
import { rebuild } from './runner';

describe('«Такт n» lands on the clock, phone, scope and counts of §5.6 (§8.6 #25)', () => {
  it.each(BEATS.map((b) => [b.n, b] as const))('beat %i', async (_n, beat) => {
    await rebuild(beat.n);
    const sum = await call(transportAs(NATALIA, ['dispatcher']), 'getOfficeSummary', { params: {}, body: undefined, qry: { scope: beat.scope } });
    expect([sum.counts.now, sum.counts.review, sum.counts.days_to_confirm, sum.counts.originals, sum.counts.bas_ready]).toEqual(beat.counts);
    expect([server.clock.nowIso(), server.ui.phone, server.ui.scope, server.ui.beat]).toEqual([beat.clock, beat.phone, beat.scope, beat.n]);
    expect(Object.values(server.toggles.speed)).toEqual([]);
  }, 20_000);
});
