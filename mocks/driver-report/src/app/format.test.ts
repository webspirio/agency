// mocks/driver-report/src/app/format.test.ts
import { describe, expect, it } from 'vitest';
import { fmtAgo, fmtBytes, fmtCode, fmtDate, fmtDateTime, fmtDay, fmtDec, fmtDur, fmtKm, fmtMass, fmtPct, fmtRate,
  fmtTime, fmtTimer, fmtWhen, plural, pluralN } from './format';

const NB = ' ';
describe('format (§6.12, §8.6 #3)', () => {
  it('renders Kyiv times from UTC instants', () => {
    expect(fmtTime('2026-09-21T02:20:00.000Z')).toBe('05:20');
    expect(fmtTime('2026-09-21T06:36:00Z')).toBe('09:36');
    expect(fmtDateTime('2026-09-21T05:57:00.000Z')).toBe('21.09 08:57');
    expect(fmtDay('2026-09-21T05:57:00.000Z')).toBe('пн 21.09');
    expect(fmtDay('2026-09-20')).toBe('нд 20.09');
    expect(fmtDate('2026-09-21T05:57:00.000Z')).toBe('21.09.2026');
  });
  it('is right on both sides of 25.10.2026', () => {
    expect(fmtTime('2026-10-25T00:59:00.000Z')).toBe('03:59');
    expect(fmtTime('2026-10-25T01:00:00.000Z')).toBe('03:00');
  });
  it('does not depend on the process time zone', () => {
    const before = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Europe/Warsaw']) {
        process.env.TZ = tz;
        expect(fmtTime('2026-09-21T02:21:00.000Z')).toBe('05:21');
      }
    } finally {
      process.env.TZ = before;
    }
  });
  it('picks the right form for today, this year and another year', () => {
    expect(fmtWhen('2026-09-21T05:57:00.000Z', '2026-09-21')).toBe('08:57');
    expect(fmtWhen('2026-09-18T14:05:00.000Z', '2026-09-21')).toBe('18.09 17:05');
    expect(fmtWhen('2025-09-18T14:05:00.000Z', '2026-09-21')).toBe('18.09.25 17:05');
  });
  it('groups with NBSP and uses a decimal comma, by string operations only', () => {
    expect([fmtKm(412355), fmtKm(36), fmtKm(null)]).toEqual([`412${NB}355`, '36', '—']);
    expect([fmtDec('22800.00'), fmtDec('113544.00'), fmtDec('-45.00'), fmtDec(null)])
      .toEqual([`22${NB}800,00`, `113${NB}544,00`, '−45,00', '—']);
    expect([fmtRate('31.8'), fmtPct('-0.6'), fmtPct('5.9'), fmtPct('0.0')])
      .toEqual(['31,8', `−0,6${NB}%`, `+5,9${NB}%`, `0,0${NB}%`]);
    expect([fmtMass('12.000'), fmtMass('1439.6'), fmtMass(null)]).toEqual(['12,000', `1${NB}439,6`, '—']);
  });
  it('writes durations, timers and ages', () => {
    expect([fmtDur(642), fmtDur(18), fmtDur(120), fmtDur(0)]).toEqual(['10 год 42 хв', '18 хв', '2 год', '0 хв']);
    expect([fmtTimer(98), fmtTimer(18)]).toEqual(['1:38', '0:18']);
    expect([fmtAgo(0), fmtAgo(42), fmtAgo(160)]).toEqual(['щойно', '42 хв', '2 год 40 хв']);
  });
  it('declines counted nouns', () => {
    const rec = ['запис', 'записи', 'записів'] as const;
    expect([1, 3, 5, 11, 21, 22, 12, 112].map((n) => pluralN(n, rec)))
      .toEqual(['1 запис', '3 записи', '5 записів', '11 записів', '21 запис', '22 записи', '12 записів', '112 записів']);
    expect(plural(58, ['день', 'дні', 'днів'])).toBe('днів');
    expect(pluralN(3, ['рядок', 'рядки', 'рядків'])).toBe('3 рядки');
    expect(pluralN(11, ['машина', 'машини', 'машин'])).toBe('11 машин');
  });
  it('renders codes and mock photo sizes', () => {
    expect(fmtCode('483920')).toBe(`483${NB}920`);
    expect([fmtBytes(700000), fmtBytes(300000), fmtBytes(200000)]).toEqual(['0,7 МБ', '0,3 МБ', '0,2 МБ']);
  });
});
