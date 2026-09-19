// mocks/driver-report/src/domain/clock.test.ts
import { describe, expect, it } from 'vitest';
import { addDays, addMinutes, businessDate, daysBetween, demo, isBefore, kyiv, kyivParts, minutesBetween } from './clock';

describe('clock (§5.8, §7.1)', () => {
  it('converts Kyiv wall time to UTC once', () => {
    expect(kyiv('2026-09-21 05:20')).toBe('2026-09-21T02:20:00.000Z');
    expect(demo('08:57')).toBe('2026-09-21T05:57:00.000Z');
    expect(kyiv('2026-09-20 17:48')).toBe('2026-09-20T14:48:00.000Z');
    expect(kyiv('2026-09-21 05:15:30')).toBe('2026-09-21T02:15:30.000Z');
  });
  it('is DST-correct around 25.10.2026 and refuses a wall time that never happened', () => {
    expect(kyiv('2026-10-25 02:59')).toBe('2026-10-24T23:59:00.000Z');
    expect(kyiv('2026-10-25 03:30')).toBe('2026-10-25T00:30:00.000Z');
    expect(kyiv('2026-10-25 04:00')).toBe('2026-10-25T02:00:00.000Z');
    expect(() => kyiv('2026-03-29 03:30')).toThrow();
  });
  it('names the Kyiv business date of an instant', () => {
    expect(businessDate('2026-09-20T21:30:00.000Z' as never)).toBe('2026-09-21');
    expect(businessDate('2026-09-21T20:59:00.000Z' as never)).toBe('2026-09-21');
  });
  it('counts whole minutes, truncated toward zero', () => {
    expect(minutesBetween(demo('05:20'), demo('16:02'))).toBe(642);
    expect(minutesBetween(demo('06:10'), demo('07:48'))).toBe(98);
    expect(minutesBetween(demo('06:10'), '2026-09-21T03:10:59.000Z' as never)).toBe(0);
    expect(minutesBetween(demo('07:48'), demo('06:10'))).toBe(-98);
  });
  it('adds minutes and days and compares instants', () => {
    expect(addMinutes(demo('05:15'), 15)).toBe(demo('05:30'));
    expect(addDays('2026-09-21' as never, -3)).toBe('2026-09-18');
    expect(daysBetween('2026-09-17' as never, '2026-09-21' as never)).toBe(4);
    expect(isBefore(demo('05:14'), demo('05:15'))).toBe(true);
    expect(kyivParts(demo('16:02'))).toMatchObject({ h: 16, mi: 2, wd: 1 });
  });
  it('never reads the process time zone', () => {
    const before = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Europe/Warsaw']) {
        process.env.TZ = tz;
        expect(kyiv('2026-09-21 05:20')).toBe('2026-09-21T02:20:00.000Z');
        expect(businessDate('2026-09-20T21:30:00.000Z' as never)).toBe('2026-09-21');
      }
    } finally {
      process.env.TZ = before;
    }
  });
});
