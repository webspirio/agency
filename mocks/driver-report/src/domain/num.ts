// mocks/driver-report/src/domain/num.ts
/** Integer helpers for src/domain, src/api, src/app and src/stage, where the money rules forbid `*`, `/`, `<`,
 *  `>`, `<=`, `>=` and every numeric coercion. These values are whole kilometres, minutes, pages and pixels —
 *  never money, which only @agency/dec touches. */
export const cmpNum = (a: number, b: number): -1 | 0 | 1 => Math.sign(a - b) as -1 | 0 | 1;
export const gt = (a: number, b: number): boolean => cmpNum(a, b) === 1;
export const gte = (a: number, b: number): boolean => cmpNum(a, b) !== -1;
export const lt = (a: number, b: number): boolean => cmpNum(a, b) === -1;
export const lte = (a: number, b: number): boolean => cmpNum(a, b) !== 1;
export const between = (v: number, lo: number, hi: number): boolean => gte(v, lo) && lte(v, hi);

/** floor(a / b) for a >= 0, b > 0. Throws on b <= 0 or a < 0. */
export function intDiv(a: number, b: number): number {
  if (!gt(b, 0) || lt(a, 0)) throw new Error(`intDiv: ${a} / ${b} is not a whole non-negative division`);
  // oxlint-disable-next-line agency/no-float-arithmetic -- the remainder is removed first, so this divides an exact multiple of b: whole minutes, hours or pages, never money.
  return (a - (a % b)) / b;
}

const INT = /^-?\d{1,9}$/;
/** /^-?\d{1,9}$/ → integer; anything else throws Error(`toInt: "<raw>" is not an integer`). */
export function toInt(raw: string): number {
  if (!INT.test(raw)) throw new Error(`toInt: "${raw}" is not an integer`);
  // oxlint-disable-next-line agency/no-numeric-coercion -- pinned to /^-?\d{1,9}$/ above: there is no decimal point to lose and 999999999 is exact in a double.
  return Number(raw);
}

/** Left-aligned digit positions where two non-negative integers of EQUAL digit count differ; [] when the counts differ. */
export function differingDigits(a: number, b: number): number[] {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return [];
  return [...x].flatMap((ch, i) => (ch === y[i] ? [] : [i]));
}
