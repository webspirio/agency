import { mul, round, scaleOf } from './dec';

/**
 * A cross-currency amount with the rate STAMPED ON THE ROW and the base-currency
 * equivalent computed once, at write, and stored.
 */
export type Stamped = {
  /** The amount as entered, in `ccy`, canonicalised. */
  amount: string;
  /** ISO 4217 code of the amount's currency. */
  ccy: string;
  /** The rate used, at its own scale (typically 4-6). Stored, never re-derived. */
  rate: string;
  /** amount x rate, rounded to `baseScale` at write time. Stored. */
  base: string;
};

/**
 * The stored scale of a value that is going on the wire: `baseScale` floor, but
 * never below what the value was written with.
 *
 * This is PADDING, not rounding. `reference/money/canonical-decimal.ts` exists
 * because a POST answered {"weight_kg":"1.2"} and the next GET answered
 * {"weight_kg":"1.20"} for the same row — unequal as strings, so a PATCH diff
 * saw a change that never happened. `stampFx` had the same split inside a
 * single object: `base` was canonical while the `amount` and `rate` it came
 * from were whatever the caller typed.
 *
 * Taking the max, rather than rounding down to `baseScale`, is the whole point.
 * Rounding `amount` to `baseScale` before multiplying rounds TWICE, and two
 * half-ups are not one half-up: it moves the stored base of
 * stampFx('0.004', X, '1000.0000') from '4.00' to '0.00'. `base` must be
 * computed from what the caller actually supplied.
 *
 * Residual limit, stated rather than hidden: '0.004' and '0.0040' still differ,
 * because collapsing scales BELOW `baseScale` would need a currency -> scale
 * map, which this module has no way to know.
 */
function canonical(v: string, baseScale: number): string {
  return round(v, Math.max(baseScale, scaleOf(v)));
}

export function stampFx(amount: string, ccy: string, rate: string, baseScale = 2): Stamped {
  const amt = canonical(amount, baseScale);
  const rt = canonical(rate, baseScale);
  return { amount: amt, ccy, rate: rt, base: mul(amt, rt, baseScale) };
}
