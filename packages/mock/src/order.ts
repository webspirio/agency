/**
 * Order by CODE POINT, never by locale.
 *
 * `localeCompare` consults ICU, and node can be compiled `small-icu` — so the same
 * array sorts differently on two machines, and anything that sorts with it differs
 * between a laptop and CI for reasons that have nothing to do with the code. That is
 * the host-not-code failure `docs/BUILD-REPORT.md` records twice already.
 *
 * It is also what a SQL `ORDER BY` under the C collation does, so an ordering the
 * mock demonstrates is one the product can reproduce — which is the whole standard
 * this repo exists to carry across the seam.
 */
// oxlint-disable-next-line agency/no-decimal-comparison -- ordering two strings by code point, not comparing money
export const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
