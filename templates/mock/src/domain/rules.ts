/**
 * The domain's refusals, as PURE FUNCTIONS over row snapshots.
 *
 * This is `reference/contract/intake-lines.ts`'s shape: nothing here touches a
 * store, a request or a Nest context — the caller resolves the rows and hands
 * them in. That is what makes a handler body a move rather than a rewrite at
 * conversion: the same function, called from a Nest service with rows from
 * TypeORM instead of rows from the in-memory store.
 *
 * A rule RETURNS its refusal rather than throwing one. Throwing would mean
 * importing `fail()` from `src/api/`, and the domain must not depend on the
 * transport — the code set lives in the contract, and the handler is where the
 * two meet. The returned `code` is checked against the operation's declared set
 * at that call site, so a rule inventing a code is a compile error there.
 */
import type { Party } from './types';

/** The snapshot a uniqueness rule needs — never the whole row. */
export type PartyNameRow = Pick<Party, 'id' | 'name'>;

export type Refusal<Code extends string> = {
  code: Code;
  message: string;
  /** Spread into the error envelope beside `code`, as the product's filter does. */
  ctx: Record<string, unknown>;
};

/**
 * A party name is unique across the book.
 *
 * `exceptId` is what makes this reusable for a rename: patching a row must not
 * collide with ITSELF. Leaving that out is the classic version of this bug —
 * the rename succeeds once and then refuses every subsequent no-op save.
 */
export function duplicateName(
  snapshot: readonly PartyNameRow[],
  name: string,
  exceptId?: string,
): Refusal<'PARTY_NAME_TAKEN'> | undefined {
  const taken = snapshot.some((row) => row.name === name && row.id !== exceptId);
  if (!taken) return undefined;
  return {
    code: 'PARTY_NAME_TAKEN',
    message: `A party named ${name} already exists`,
    ctx: { field: 'name' },
  };
}

/**
 * A name has to be something a human typed. Trimmed emptiness is the case a
 * required-field check misses, because '   ' is a non-empty string.
 */
export function blankName(name: string): Refusal<'PARTY_NAME_BLANK'> | undefined {
  if (name.trim() !== '') return undefined;
  return { code: 'PARTY_NAME_BLANK', message: 'A party needs a name', ctx: { field: 'name' } };
}

/**
 * A balance off the wire is an untrusted string. `asDecimal2` ASSERTS rather
 * than coerces, so an unguarded call turns a typo in a form into a 500 with a
 * stack trace where a 400 with a code belongs. The regex is the one `asDecimal2`
 * itself enforces, checked here so the refusal can carry a code the contract
 * declares.
 */
const DECIMAL2 = /^-?\d+\.\d{2}$/;

export function invalidBalance(raw: string): Refusal<'PARTY_BALANCE_INVALID'> | undefined {
  if (DECIMAL2.test(raw)) return undefined;
  return {
    code: 'PARTY_BALANCE_INVALID',
    message: `A balance must be a canonical 2-decimal string, e.g. '1240.00' — got ${JSON.stringify(raw)}`,
    ctx: { field: 'balance' },
  };
}
