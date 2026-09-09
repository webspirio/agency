/**
 * Scale-generic decimal-string arithmetic. Strings in, strings out, bigint
 * internals, half-up AWAY FROM ZERO. No value ever passes through a float.
 *
 * Scale is a parameter, not a constant, because the domain needs two of them:
 * amounts and weights at 2, FX rates at 4-6. A scale-2-only module throws on a
 * rate of 47.8032, which is why the agency ended up with three incompatible
 * money modules.
 */
const PATTERN = /^-?\d+(?:\.\d+)?$/;

function split(v: string): { units: bigint; scale: number } {
  if (typeof v !== 'string' || !PATTERN.test(v)) {
    throw new Error(`dec: ${JSON.stringify(v)} is not a plain decimal`);
  }
  const negative = v.startsWith('-');
  const magnitude = negative ? v.slice(1) : v;
  const [whole = '0', fraction = ''] = magnitude.split('.');
  const units = BigInt(whole + fraction);
  return { units: negative ? -units : units, scale: fraction.length };
}

/** The number of fractional digits `v` is written with. `'1.20'` -> 2, `'7'` -> 0. */
export function scaleOf(v: string): number {
  return split(v).scale;
}

/**
 * Every entry point validates its target scale here, before a single bigint is
 * built. Two failures made this necessary and neither announced itself:
 *
 *  - a NEGATIVE scale reached `render`, whose `digits.slice(0, -scale)` /
 *    `digits.slice(-scale)` then produced a string ending in a bare '.'.
 *    round('1234.00', -2) returned '12.' — not the 1200 it should be, and not
 *    a decimal at all: feeding it back into add() throws. The module was
 *    emitting values it could not itself read.
 *  - a FRACTIONAL or NaN scale reached `10n ** BigInt(scale)` and surfaced as
 *    `RangeError: The number 2.5 cannot be converted to a BigInt`, a message
 *    matching neither /decimal/ nor /non-zero integer/, so a caller catching
 *    dec's errors by message missed it entirely. `round(v)` with the argument
 *    omitted was this case, via NaN.
 */
function checkScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new Error(`dec: scale must be a non-negative integer, got ${String(scale)}`);
  }
}

/** Move `units` from scale `from` to scale `to`, rounding half-up away from zero. */
function rescale(units: bigint, from: number, to: number): bigint {
  if (to === from) return units;
  if (to > from) return units * 10n ** BigInt(to - from);
  const divisor = 10n ** BigInt(from - to);
  const quotient = units / divisor;
  const remainder = units % divisor;
  const magnitude = remainder < 0n ? -remainder : remainder;
  if (magnitude * 2n >= divisor) return quotient + (units < 0n ? -1n : 1n);
  return quotient;
}

function render(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const body = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${body}` : body;
}

function align(a: string, b: string): { x: bigint; y: bigint; scale: number } {
  const A = split(a);
  const B = split(b);
  const scale = Math.max(A.scale, B.scale);
  return { x: rescale(A.units, A.scale, scale), y: rescale(B.units, B.scale, scale), scale };
}

export function add(a: string, b: string, scale = 2): string {
  checkScale(scale);
  const { x, y, scale: s } = align(a, b);
  return render(rescale(x + y, s, scale), scale);
}

export function sub(a: string, b: string, scale = 2): string {
  checkScale(scale);
  const { x, y, scale: s } = align(a, b);
  return render(rescale(x - y, s, scale), scale);
}

export function mul(a: string, b: string, scale = 2): string {
  checkScale(scale);
  const A = split(a);
  const B = split(b);
  return render(rescale(A.units * B.units, A.scale + B.scale, scale), scale);
}

export function div(a: string, n: number, scale = 2): string {
  checkScale(scale);
  if (!Number.isInteger(n) || n === 0) {
    throw new Error('dec.div: n must be a non-zero integer');
  }
  const A = split(a);
  // ONE rounding, at the target scale. Scaling the dividend to a single guard
  // digit first and rounding that away rounds twice, and two half-ups are not
  // one half-up: 0.00450 / 1 becomes 0.005 and then 0.01, where half-up at
  // scale 2 is 0.00. Dividing the fully-scaled numerator instead keeps the
  // whole remainder in play, so the only rounding is the last one.
  const numerator = A.units * 10n ** BigInt(scale);
  const denominator = 10n ** BigInt(A.scale) * BigInt(n);
  const quotient = numerator / denominator; // bigint division truncates toward zero
  const remainder = numerator % denominator;
  const magnitude = remainder < 0n ? -remainder : remainder;
  const divisor = denominator < 0n ? -denominator : denominator;
  const negative = (numerator < 0n) !== (denominator < 0n);
  if (magnitude * 2n >= divisor) return render(quotient + (negative ? -1n : 1n), scale);
  return render(quotient, scale);
}

/**
 * Σ round(each line), NOT round(Σ exact) and NOT a running total that is
 * re-rounded at every step. `reference/money/backend-money.spec.ts:85-101`
 * calls this distinction load-bearing: the receipt prints each line and a
 * total that must equal the lines printed above it.
 *
 * Reducing through `add(total, v, scale)` rounds the ACCUMULATOR each step,
 * which is a third semantic and an order-dependent one — the same multiset in
 * two orders gave 0.02 and -0.01. Each value is rounded once, on its own, and
 * the already-rounded units are then added exactly.
 */
export function sum(values: string[], scale = 2): string {
  checkScale(scale);
  const total = values.reduce((acc, v) => {
    const p = split(v);
    return acc + rescale(p.units, p.scale, scale);
  }, 0n);
  return render(total, scale);
}

export function cmp(a: string, b: string): -1 | 0 | 1 {
  const { x, y } = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const gt = (a: string, b: string): boolean => cmp(a, b) === 1;
export const gte = (a: string, b: string): boolean => cmp(a, b) >= 0;
export const lt = (a: string, b: string): boolean => cmp(a, b) === -1;
export const lte = (a: string, b: string): boolean => cmp(a, b) <= 0;
export const isZero = (v: string): boolean => split(v).units === 0n;
export const isNegative = (v: string): boolean => split(v).units < 0n;

export function round(v: string, scale = 2): string {
  checkScale(scale);
  const A = split(v);
  return render(rescale(A.units, A.scale, scale), scale);
}
