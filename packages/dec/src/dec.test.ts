import { describe, it, expect } from 'vitest';
import { add, sub, mul, div, sum, cmp, gt, gte, lt, lte, isZero, isNegative, round } from './dec';

describe('parsing', () => {
  it('rejects anything that is not a plain decimal', () => {
    for (const bad of ['1e3', '', ' 1', '1.2.3', 'NaN', '0x10', '+1']) {
      expect(() => add(bad, '0')).toThrow(/decimal/);
    }
  });
});

describe('add / sub — scale 2 by default', () => {
  it('canonicalises and signs correctly at scale 2', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floats — but note that this
    // assertion does NOT detect a float implementation: rounding to scale 2
    // hides the error. It is kept for parity with
    // reference/money/backend-money.spec.ts:47-50, not as the float guard.
    expect(add('0.10', '0.2')).toBe('0.30');
    expect(add('140.00', '-5')).toBe('135.00');
    expect(sub('1.05', '1.05')).toBe('0.00');
    expect(sub('1.00', '2.50')).toBe('-1.50');
  });

  /**
   * THE ACTUAL FLOAT GUARD. A full Number()-based reimplementation of this
   * module — same signatures, same PATTERN, Math.round/toFixed to render —
   * passes every other authored test in this file. These three assertions are
   * the ones it fails, so they are what stands between the module and a
   * rewrite that reaches for `Number()`.
   */
  it('does not go through a float', () => {
    // scale 20 puts the target BELOW the float error instead of above it:
    // a double says 0.30000000000000009992 here.
    expect(add('0.10', '0.2', 20)).toBe('0.30000000000000000000');
    // 1.005 is not representable in binary; the nearest double is just under
    // it, so a float build rounds this to 0.00.
    expect(sub('1.005', '1')).toBe('0.01');
    // numeric(12,2) tops out at 9999999999.99, well past Number.MAX_SAFE_INTEGER
    // once scaled. The square is the proof the internals are bigint: a double
    // says ...800016896.00.
    expect(mul('9999999999.99', '1.00')).toBe('9999999999.99');
    expect(mul('9999999999.99', '9999999999.99', 2)).toBe('99999999999800000000.00');
  });
});

describe('mul — half-up AWAY FROM ZERO, operands may differ in scale', () => {
  it('rounds the scale-4 product back to scale 2', () => {
    expect(mul('2.50', '1.005')).toBe('2.51');
    expect(mul('-2.50', '1.005')).toBe('-2.51'); // away from zero, not toward positive
  });
  it('multiplies a scale-2 amount by a scale-4 FX rate', () => {
    expect(mul('100.00', '47.8032')).toBe('4780.32');
  });
  it('can return a higher-scale product when asked', () => {
    expect(mul('1.5', '1.5', 4)).toBe('2.2500');
  });
});

describe('div — a decimal split over a whole count', () => {
  it('matches the semantics already shipped in yagoda-starter', () => {
    expect(div('126.40', 2)).toBe('63.20');
    expect(div('1.00', 8)).toBe('0.13');
    expect(div('3.00', 8)).toBe('0.38');
    expect(div('10.00', 3)).toBe('3.33');
  });
  it('refuses a non-integer or zero divisor', () => {
    expect(() => div('1.00', 0)).toThrow(/non-zero integer/);
    expect(() => div('1.00', 2.5)).toThrow(/non-zero integer/);
  });
  it('rounds ONCE, even when the dividend is finer than the target scale', () => {
    // 0.0045 sits BELOW the 0.005 tie, so half-up at scale 2 is 0.00. Scaling the
    // dividend to a single guard digit first rounds it to 0.005 and then rounds
    // that up: two roundings, one wrong answer. This is the money bug the module
    // exists to make impossible, so it is asserted rather than assumed.
    expect(div('0.00450', 1)).toBe('0.00');
    expect(div('0.00451', 1)).toBe('0.00');
    expect(div('1.00450', 1)).toBe('1.00');
    expect(div('-1.00450', 1)).toBe('-1.00');
    // a real tie at the target scale still goes up, away from zero
    expect(div('0.005', 1)).toBe('0.01');
    expect(div('-0.005', 1)).toBe('-0.01');
    // an FX rate split over a count, kept at the rate's own scale
    expect(div('47.8032', 4, 4)).toBe('11.9508');
  });
  it('divides by a negative count, rounding away from zero', () => {
    expect(div('1.00', -3)).toBe('-0.33');
    expect(div('-1.00', -3)).toBe('0.33');
    // Both cases above have a remainder of 100/300 — nowhere near the tie — so
    // neither can see the sign of the ROUNDING STEP. `negative` at dec.ts is
    // the XOR of the two signs, and simplifying it to `numerator < 0n` (the
    // dividend's sign alone, which looks redundant) leaves the whole suite
    // green while div('1.00', -8) silently returns -0.11 instead of -0.13.
    // 1/8 and 3/8 land exactly on the half, so these four pin the XOR.
    expect(div('1.00', -8)).toBe('-0.13');
    expect(div('-1.00', -8)).toBe('0.13');
    expect(div('3.00', -8)).toBe('-0.38');
    expect(div('0.25', -2)).toBe('-0.13');
  });
});

describe('sum — rounded per line then summed', () => {
  it('totals the printed lines', () => {
    expect(sum(['10944.00', '1827.00', '0.50'])).toBe('12771.50');
    expect(sum([])).toBe('0.00');
  });

  /**
   * THE LOAD-BEARING TEST OF THIS MODULE, mirroring the one
   * `reference/money/backend-money.spec.ts:85-101` names as such: the receipt
   * prints each line and a total that must equal the lines printed above it.
   * `Σ round(each)` is NOT `round(Σ exact)`, and the paper shows the former.
   *
   * Reducing through `add(total, v, scale)` produces neither: it rounds the
   * RUNNING TOTAL at every step, so the answer depends on the order of the
   * array. Both properties are pinned here, values first, because an
   * add-exactly-then-round-once implementation is order-independent too.
   */
  it('rounds each line, not the running total, and does not depend on order', () => {
    // round-once would say 1.00 (1.00 - 0.005 = 0.995 -> 1.00). Per line:
    // round(-0.005) = -0.01, so 1.00 - 0.01 = 0.99. This single assertion is
    // what separates the two semantics.
    expect(sum(['1.00', '-0.005'])).toBe('0.99');
    // Σ round(each) = 0.01 + 0.01 - 0.01. A running-total reduce says 0.02.
    expect(sum(['0.005', '0.005', '-0.005'])).toBe('0.01');
    // the same multiset, reordered: a running-total reduce says -0.01.
    expect(sum(['-0.005', '0.005', '0.005'])).toBe('0.01');
    expect(sum(['0.005', '-0.005', '0.005'])).toBe('0.01');
    // and the reference module's own case, where every line is already scale 2
    expect(sum(['0.01', '0.01', '0.01'])).toBe('0.03');
    // a scale other than 2 rounds each line at THAT scale
    expect(sum(['0.00005', '0.00005'], 4)).toBe('0.0002');
  });
});

describe('cmp — numeric, never lexicographic', () => {
  it('orders 9 before 10, which a string sort does not', () => {
    expect(cmp('9.00', '10.00')).toBe(-1);
    expect(['9.00', '10.00'].sort()).toEqual(['10.00', '9.00']); // the bug this exists to prevent
    expect(cmp('10', '10.00')).toBe(0);
    expect(gt('0.01', '0')).toBe(true);
    expect(lt('-0.01', '0')).toBe(true);
    // gte/lte were exported but unasserted: flipping either to a strict > / <
    // left all 690 tests green, so the equality boundary is pinned here.
    expect(gte('1.00', '1.000')).toBe(true);
    expect(lte('1.00', '1.000')).toBe(true);
    expect(gte('0.99', '1.00')).toBe(false);
    expect(lte('1.01', '1.00')).toBe(false);
    expect(isZero('0.00')).toBe(true);
    expect(isNegative('-0.01')).toBe(true);
  });
});

describe('round', () => {
  it('rescales half-up away from zero', () => {
    expect(round('2.345', 2)).toBe('2.35');
    expect(round('-2.345', 2)).toBe('-2.35');
    expect(round('2.344', 2)).toBe('2.34');
    expect(round('2', 4)).toBe('2.0000');
  });

  it('defaults to scale 2 like every other export', () => {
    expect(round('2.345')).toBe('2.35');
    expect(round('-2.345')).toBe('-2.35');
    expect(round('2')).toBe('2.00');
  });
});

/**
 * `scale` reaches `render`, which builds the body with `digits.slice(0, -scale)`
 * and `digits.slice(-scale)`. A negative scale makes that produce a string
 * ending in a bare '.' — round('1234.00', -2) returned '12.', a value this
 * module's own PATTERN rejects, so it emitted something it could not read back.
 * A fractional or NaN scale reached `10n ** BigInt(scale)` and surfaced a raw
 * `RangeError: The number 2.5 cannot be converted to a BigInt`, which matches
 * neither the /decimal/ nor the /non-zero integer/ contract the other guards
 * establish. Every entry point validates its scale up front instead.
 */
describe('scale validation', () => {
  it('refuses a negative scale rather than rendering an invalid decimal', () => {
    expect(() => round('1234.00', -2)).toThrow(/scale/);
    expect(() => round('1.00', -1)).toThrow(/scale/);
    expect(() => add('1', '2', -1)).toThrow(/scale/);
    expect(() => sub('1', '2', -1)).toThrow(/scale/);
    expect(() => mul('1', '2', -1)).toThrow(/scale/);
    expect(() => div('1.00', 2, -1)).toThrow(/scale/);
    expect(() => sum([], -1)).toThrow(/scale/);
    expect(() => sum(['1.00'], -1)).toThrow(/scale/);
  });

  it('refuses a non-integer or NaN scale with dec\'s own error, not a RangeError', () => {
    expect(() => round('2.345', 2.5)).toThrow(/scale/);
    expect(() => round('2.345', Number.NaN)).toThrow(/scale/);
    expect(() => add('1', '2', 2.5)).toThrow(/scale/);
    expect(() => sub('1', '2', Number.NaN)).toThrow(/scale/);
    expect(() => mul('1', '2', 2.5)).toThrow(/scale/);
    expect(() => div('1.00', 2, 2.5)).toThrow(/scale/);
    expect(() => sum(['1.00'], 2.5)).toThrow(/scale/);
  });

  it('still allows scale 0', () => {
    expect(round('2.5', 0)).toBe('3');
    expect(round('-2.5', 0)).toBe('-3');
    expect(add('1', '2', 0)).toBe('3');
    expect(sum(['0.6', '0.6'], 0)).toBe('2');
  });
});
