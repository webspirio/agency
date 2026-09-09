import { describe, it, expect } from 'vitest';
import { stampFx } from './fx';

describe('stampFx', () => {
  it('computes base once, at write, and stores it alongside the rate', () => {
    expect(stampFx('100.00', 'EUR', '47.8032')).toEqual({
      amount: '100.00', ccy: 'EUR', rate: '47.8032', base: '4780.32',
    });
  });

  it('keeps a scale-4 rate at scale 4 — a scale-2 validator would have thrown here', () => {
    expect(stampFx('1.00', 'EUR', '47.8032').rate).toBe('47.8032');
  });

  /**
   * Every other call in this file and in the repo takes the default, so
   * replacing `baseScale` with the literal 2 in `mul(amt, rt, baseScale)` left
   * the whole suite green while base silently truncated to scale 2 — the same
   * scale-2 assumption applied to a scale-4 value that the test above exists to
   * catch, one field to the right.
   */
  it('rounds base to the baseScale it was given, not to 2', () => {
    expect(stampFx('1.00', 'EUR', '47.8032', 4).base).toBe('47.8032');
    expect(stampFx('1.00', 'EUR', '47.8032', 4).amount).toBe('1.0000');
    expect(stampFx('1.00', 'EUR', '47.8032', 0).base).toBe('48');
    expect(stampFx('100.00', 'EUR', '47.8032', 6).base).toBe('4780.320000');
  });

  it('does not move when the rate later moves — base is a stored value', () => {
    const march = stampFx('100.00', 'EUR', '40.0000');
    const today = stampFx('100.00', 'EUR', '47.8032');
    expect(march.base).toBe('4000.00');
    expect(today.base).toBe('4780.32');
  });

  it('rejects a malformed rate', () => {
    expect(() => stampFx('1.00', 'EUR', '')).toThrow(/decimal/);
  });

  it('refuses a negative baseScale rather than stamping base "5." on the row', () => {
    expect(() => stampFx('1.00', 'EUR', '47.8032', -1)).toThrow(/scale/);
  });

  /**
   * The row goes on the wire, and `reference/money/canonical-decimal.ts` is the
   * module that exists because POST answered {"weight_kg":"1.2"} while the very
   * next GET answered {"weight_kg":"1.20"} for the same row — unequal as
   * strings, which is what makes `diffFields` write a phantom audit entry.
   * `stampFx` was copying `amount` and `rate` through verbatim, so its own
   * `base` field was canonical while the two fields it was derived from were
   * not.
   */
  it('stores canonical amount and rate, so two stamps of the same money are byte-identical', () => {
    expect(stampFx('1.2', 'EUR', '1.0000')).toEqual(stampFx('1.20', 'EUR', '1.0000'));
    expect(JSON.stringify(stampFx('1.2', 'EUR', '1.0000'))).toBe(
      JSON.stringify(stampFx('1.20', 'EUR', '1.0000')),
    );
    expect(stampFx('1.2', 'EUR', '1.0000').amount).toBe('1.20');
    expect(stampFx('007.5', 'EUR', '1.0000').amount).toBe('7.50');
    // '-0' is a value no Postgres SELECT can return — canonical-decimal.ts:52-59.
    expect(stampFx('-0', 'EUR', '1.0000').amount).toBe('0.00');
    expect(stampFx('1.00', 'EUR', '1.2').rate).toBe('1.20');
  });

  /**
   * Canonicalising is PADDING, never rounding: the stored scale is
   * `max(baseScale, the value's own scale)`, so no digit is ever dropped and
   * `base` is computed from the full-precision inputs. Rounding `amount` to
   * `baseScale` FIRST would round twice and silently move the stored base —
   * the exact double-rounding failure `div` was written to avoid. These three
   * are the cases where the two differ.
   */
  it('never rounds the inputs, so base is unchanged by canonicalisation', () => {
    expect(stampFx('0.004', 'X', '1000.0000').base).toBe('4.00'); // round-first: '0.00'
    expect(stampFx('0.005', 'X', '1000.0000').base).toBe('5.00'); // round-first: '10.00'
    expect(stampFx('1.005', 'X', '2.0000').base).toBe('2.01'); // round-first: '2.02'
    // and the finer-than-baseScale amount keeps its own scale on the row
    expect(stampFx('0.004', 'X', '1000.0000').amount).toBe('0.004');
    expect(stampFx('1.005', 'X', '2.0000').amount).toBe('1.005');
  });
});
