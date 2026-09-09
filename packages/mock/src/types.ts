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

/**
 * The brands assert, they do not merely cast. An unchecked cast makes the doc
 * comments above a wish: `asDecimal2('12.5')` would render "12.5" on screen
 * where the product, reading a numeric(12,2) column, renders "12.50", and
 * `asDecimal2('not a number')` would blow up much later, inside dec's split(),
 * at whichever unrelated call site first did arithmetic on it.
 *
 * They throw rather than coerce: they run once per row at seed time, and a
 * silent coercion would reopen exactly the hole the brand exists to close.
 */
const DECIMAL2 = /^-?\d+\.\d{2}$/;
/** ISO-8601, UTC. What `Date#toISOString` emits, with the fraction optional. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertShape(brand: string, pattern: RegExp, expected: string, v: string): void {
  if (!pattern.test(v)) throw new Error(`${brand}: ${JSON.stringify(v)} is not ${expected}`);
}

function assertReal(brand: string, v: string): void {
  // A well-shaped string can still be a date that does not exist: the ISO
  // parser ROLLS OVER, so '2026-02-30' silently parses as 2026-03-02. The
  // round trip is what catches it.
  const day = v.slice(0, 10);
  const rolled = Number.isNaN(Date.parse(v))
    || new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day;
  if (rolled) throw new Error(`${brand}: ${JSON.stringify(v)} is not a real date`);
}

export const asInstant = (v: string): Instant => {
  assertShape('asInstant', INSTANT, 'an ISO-8601 instant with a Z suffix', v);
  assertReal('asInstant', v);
  return v as Instant;
};

export const asBusinessDate = (v: string): BusinessDate => {
  assertShape('asBusinessDate', BUSINESS_DATE, "a 'YYYY-MM-DD' business date", v);
  assertReal('asBusinessDate', v);
  return v as BusinessDate;
};

export const asDecimal2 = (v: string): Decimal2 => {
  // dec at scale 2 always emits exactly two decimals, so this can never reject
  // a value dec produced — only one a handler typed by hand.
  assertShape('asDecimal2', DECIMAL2, 'a canonical 2-decimal string', v);
  return v as Decimal2;
};

/**
 * Store-assigned monotonic ids. Zero-padded so lexicographic order equals
 * creation order — a property a SQL `ORDER BY id` reproduces and
 * `Math.random()` does not.
 */
export function createSeq(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(6, '0')}`;
}
