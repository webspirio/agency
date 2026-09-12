/**
 * `page` and `limit` off the wire: parsed STRICTLY, clamped ONCE, and returned
 * as the clamped values so the envelope can never echo a number the store did
 * not use.
 *
 * `Ctx.query` is `Record<string, string | string[]>` because that is what
 * express@5's default `simple` parser hands a Nest DTO — a repeated key arrives
 * as an array. The product converts the same two fields with `@Type(() => Number)`
 * on its PaginationQueryDto; this is that conversion, with the four defects the
 * lab's version shipped:
 *
 *   limit:-1   returned rows AND echoed -1 into a field a client renders
 *   page:NaN   serialised as `"page": null` on a field typed `number`
 *   '12abc'    became 12, because parseInt takes the prefix
 *   '0x10'     became 0, for the same reason
 *
 * The echo is the half that bites: a screen renders `limit` from the envelope,
 * so an unclamped echo is a wrong number in front of the client.
 */

/** What a caller gets when it names no limit. */
export const DEFAULT_LIMIT = 20;

/**
 * The ceiling. A demo table is a few dozen rows, and an unbounded `limit` is how
 * a mock ends up serving its whole store to a screen that renders all of it.
 */
export const MAX_LIMIT = 100;

export type PageQuery = { page: number; limit: number };

/** The WHOLE token must be digits. `parseInt` is happy with a prefix; we are not. */
const DIGITS = /^\d+$/;

function digitsOr(raw: string | string[] | undefined, fallback: number): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === undefined || !DIGITS.test(first)) return fallback;
  // oxlint-disable-next-line agency/no-numeric-coercion -- an integer ROW COUNT off a query string, never money. DIGITS has already refused every token parseInt would silently truncate, which is the only hazard this rule is about here.
  const parsed = Number.parseInt(first, 10);
  // An all-digits token too large to be a safe integer is still a request for
  // MORE than the ceiling, so it clamps to the ceiling rather than falling back
  // to the default — and it can never reach the envelope as Infinity.
  return Number.isSafeInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

/**
 * `Math.max`/`Math.min` rather than `<`/`>`: the agency ordering rules ban the
 * relational operators outright, because they are syntactic and cannot tell a
 * page number from a decimal string.
 */
function intOr(value: number, fallback: number): number {
  if (Number.isSafeInteger(value)) return value;
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/**
 * The single clamp. `store.list` calls it too, so a store handed numbers that
 * never went through `pageQuery` is still total — one definition used twice,
 * not two clamps that can disagree.
 */
export function clampPage(page: number, limit: number): PageQuery {
  return {
    page: Math.max(1, intOr(page, 1)),
    limit: Math.min(MAX_LIMIT, Math.max(1, intOr(limit, DEFAULT_LIMIT))),
  };
}

export function pageQuery(query: Record<string, string | string[]>): PageQuery {
  return clampPage(digitsOr(query['page'], 1), digitsOr(query['limit'], DEFAULT_LIMIT));
}
