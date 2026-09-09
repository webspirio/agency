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
  const { x, y, scale: s } = align(a, b);
  return render(rescale(x + y, s, scale), scale);
}

export function sub(a: string, b: string, scale = 2): string {
  const { x, y, scale: s } = align(a, b);
  return render(rescale(x - y, s, scale), scale);
}

export function mul(a: string, b: string, scale = 2): string {
  const A = split(a);
  const B = split(b);
  return render(rescale(A.units * B.units, A.scale + B.scale, scale), scale);
}

export function div(a: string, n: number, scale = 2): string {
  if (!Number.isInteger(n) || n === 0) {
    throw new Error('dec.div: n must be a non-zero integer');
  }
  const A = split(a);
  // One guard digit, then round it away — the same half-up the rest of the module uses.
  const numerator = rescale(A.units, A.scale, scale + 1);
  return render(rescale(numerator / BigInt(n), scale + 1, scale), scale);
}

export function sum(values: string[], scale = 2): string {
  return values.reduce((total, v) => add(total, v, scale), render(0n, scale));
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

export function round(v: string, scale: number): string {
  const A = split(v);
  return render(rescale(A.units, A.scale, scale), scale);
}
