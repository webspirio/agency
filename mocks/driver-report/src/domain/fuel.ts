// mocks/driver-report/src/domain/fuel.ts
/** The fuel figures of §7.3 (C-08 «Пальне», C-12, C-13). Every litre, rate and percentage is a decimal string that only
 *  @agency/dec touches; kilometres are whole numbers compared through ./num. Nothing here produces an over-norm litre
 *  count for ПДВ or anything else that needs a norm наказ — callers get a deviation and a hold flag, nothing more
 *  (§7.3 Fuel, [02 UC-A02]). */
import { div, gt, mul, round, sub, sum } from '@agency/dec';
import { asDecimal2, type Decimal2 } from '@agency/mock';
import { gt as gtKm, toInt } from './num';
import type { Dec1, Dec3, Km } from './types';

/** l/100 km at one place: `litres × 100 ÷ km`, one rounding. `null` when the distance is 0 (or negative — a backwards
 *  odometer delta has no rate either). */
export function per100(litres: Decimal2, km: Km): Dec1 | null {
  if (!gtKm(km, 0)) return null;
  return div(mul(litres, '100', 4), km, 1);
}

/** Full-to-full over fills given in the order they were made: from the FIRST full fill to the LAST full fill, the litres
 *  are every fill after the first full one up to and including the last full one (a partial fill inside the span counts,
 *  one before or after it does not), the km are the odometer delta between those two full fills, and `windows` is the
 *  number of full-to-full windows the span holds. `null` with fewer than two full fills or no distance between them. */
export function fullToFull(fills: readonly { value: Km; litres: Decimal2; full: boolean }[]):
  { rate: Dec1; km: Km; litres: Decimal2; windows: number } | null {
  let start: Km | null = null;
  let end: Km | null = null;
  let windows = 0;
  let pending: Decimal2[] = [];
  const counted: Decimal2[] = [];
  for (const f of fills) {
    if (start === null) {
      if (f.full) start = f.value;
      continue;
    }
    pending.push(f.litres);
    if (!f.full) continue;
    counted.push(...pending);
    pending = [];
    end = f.value;
    windows += 1;
  }
  if (start === null || end === null) return null;
  const km = end - start;
  const litres = asDecimal2(sum(counted, 2));
  const rate = per100(litres, km);
  return rate === null ? null : { rate, km, litres, windows };
}

/** A value at one place as whole tenths: '31.8' → 318, '1132.8' → 11328, '5' → 50. */
const tenths = (v: string): string => round(v, 1).replace('.', '');

/** (fact ÷ norm − 1) × 100 at one place, signed: ('31.8', '32.0') → '-0.6'. Works for l/100 against the norm and for
 *  litres against the norm's litres alike. Both sides are taken to one place and then to whole tenths, so the divisor
 *  is the integer dec.div needs; the result is `(factTenths − normTenths) × 100 ÷ normTenths`, rounded ONCE, half-up
 *  away from zero. */
export function deviation(fact: Dec1, norm: Dec1): Dec1 {
  const normTenths = toInt(tenths(norm));
  if (normTenths === 0) throw new Error(`deviation: a norm of "${norm}" has no deviation`);
  return div(mul(sub(tenths(fact), String(normTenths), 0), '100', 0), normTenths, 1);
}

/** Beyond the tolerance, strictly and upward: '5.9' holds, '5.0' does not, a missing deviation never does. The default
 *  5 % is KTL's example figure («приклад», §4.2 C-12). */
export function overTolerance(dev: Dec1 | null, tolerance: Dec1 = '5.0'): boolean {
  return dev !== null && gt(dev, tolerance);
}

/** The norm's litres for a distance: km × norm ÷ 100, to the hundredth. (3540, '32.0') → '1132.80'. */
export function normLitres(km: Km, norm: Dec1): Decimal2 {
  return asDecimal2(div(mul(String(km), norm, 4), 100, 2));
}

/** Tonne-kilometres at one place: ('24.400', 59) → '1439.6'. */
export function tkm(massT: Dec3, km: Km): Dec1 {
  return mul(massT, String(km), 1);
}
