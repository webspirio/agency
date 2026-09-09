import { mul } from './dec';

/**
 * A cross-currency amount with the rate STAMPED ON THE ROW and the base-currency
 * equivalent computed once, at write, and stored.
 */
export type Stamped = {
  /** The amount as entered, in `ccy`. */
  amount: string;
  /** ISO 4217 code of the amount's currency. */
  ccy: string;
  /** The rate used, at its own scale (typically 4-6). Stored, never re-derived. */
  rate: string;
  /** amount x rate, rounded to `baseScale` at write time. Stored. */
  base: string;
};

export function stampFx(amount: string, ccy: string, rate: string, baseScale = 2): Stamped {
  return { amount, ccy, rate, base: mul(amount, rate, baseScale) };
}
