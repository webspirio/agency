export type Paginated<T> = { data: T[]; total: number; page: number; limit: number };

declare const instantBrand: unique symbol;
declare const businessDateBrand: unique symbol;
declare const decimal2Brand: unique symbol;

/** ISO-8601 with a Z suffix. From a timestamptz. */
export type Instant = string & { readonly [instantBrand]: true };
/** 'YYYY-MM-DD'. Server-derived, never accepted in a request body. */
export type BusinessDate = string & { readonly [businessDateBrand]: true };
/** Canonical 2-decimal string. */
export type Decimal2 = string & { readonly [decimal2Brand]: true };

export const asInstant = (v: string): Instant => v as Instant;
export const asBusinessDate = (v: string): BusinessDate => v as BusinessDate;
export const asDecimal2 = (v: string): Decimal2 => v as Decimal2;

/**
 * Store-assigned monotonic ids. Zero-padded so lexicographic order equals
 * creation order — a property a SQL `ORDER BY id` reproduces and
 * `Math.random()` does not.
 */
export function createSeq(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(6, '0')}`;
}
