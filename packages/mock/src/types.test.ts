import { describe, it, expect } from 'vitest';
import { add, round, sum } from '@agency/dec';
import { asBusinessDate, asDecimal2, asInstant } from './types';

describe('asDecimal2 asserts the shape its doc comment claims', () => {
  it('accepts every shape dec emits at scale 2', () => {
    expect(asDecimal2('12.50')).toBe('12.50');
    expect(asDecimal2('-0.01')).toBe('-0.01');
    expect(asDecimal2(add('1', '2'))).toBe('3.00');
    expect(asDecimal2(round('1.005', 2))).toBe('1.01');
    expect(asDecimal2(sum(['12480.00', '3195.50']))).toBe('15675.50');
  });

  it('rejects the wrong scale — "12.5" renders where numeric(12,2) renders "12.50"', () => {
    expect(() => asDecimal2('12.5')).toThrow(/12\.5/);
  });

  it('rejects a value that is not a decimal at all, at the brand rather than inside dec later', () => {
    expect(() => asDecimal2('not a number')).toThrow();
    expect(() => asDecimal2('')).toThrow();
    expect(() => asDecimal2('12')).toThrow();
    expect(() => asDecimal2('1.234')).toThrow();
    expect(() => asDecimal2('1,50')).toThrow();
  });
});

describe('asInstant', () => {
  it('accepts an ISO-8601 Z instant, which is what toISOString emits', () => {
    expect(asInstant('2026-09-09T10:00:00.000Z')).toBe('2026-09-09T10:00:00.000Z');
    expect(asInstant(new Date('2026-01-02T03:04:05Z').toISOString())).toBe('2026-01-02T03:04:05.000Z');
    expect(asInstant('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05Z');
  });

  it('rejects a local timestamp, an offset timestamp and a business date', () => {
    expect(() => asInstant('2026-09-09T10:00:00')).toThrow();
    expect(() => asInstant('2026-09-09T10:00:00+02:00')).toThrow();
    expect(() => asInstant('2026-09-09')).toThrow();
  });

  it('rejects a well-shaped string that is not a real instant', () => {
    expect(() => asInstant('2026-13-45T10:00:00.000Z')).toThrow();
  });
});

describe('asBusinessDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(asBusinessDate('2026-09-09')).toBe('2026-09-09');
  });

  it('rejects an instant — a BusinessDate is server-derived, never a timestamp', () => {
    expect(() => asBusinessDate('2026-09-09T10:00:00.000Z')).toThrow();
    expect(() => asBusinessDate('2026-9-9')).toThrow();
    expect(() => asBusinessDate('2026-02-30')).toThrow();
  });
});
