/**
 * THE DATA LAYER COMES FROM THE REGISTRY TOO.
 *
 * A screen hand-wrote `queryKey: ['parties', page]` for an operation named
 * `listParties`, with `invalidateQueries({ queryKey: ['parties'] })` beside it. Two
 * declarations that have to agree — the exact shape the contract removes one layer
 * down — and renaming the operation would have moved neither string.
 *
 * `query` and `mutation` return OPTIONS OBJECTS, never hook results, and that is not a
 * stylistic choice: calling `useQuery` here would make `@agency/mock` — a package every
 * mock imports — depend on React and TanStack Query. HARD RULE 6 is about a mock's
 * dependencies, but the spirit is the same, and a screen spreading `{...q.query(…)}`
 * into its own `useQuery` reads no worse.
 */
import { byCodepoint } from './order';
import type { ApiSpec, CallArgsOf, Contract, ResOf, Transport } from './contract';

/** The cache key of one operation, optionally narrowed to one set of arguments. */
export type KeyOf<A extends ApiSpec> = <K extends keyof A>(
  key: K,
  args?: CallArgsOf<A, K>,
) => readonly unknown[];

export type Queries<A extends ApiSpec> = {
  keyOf: KeyOf<A>;
  query: <K extends keyof A>(
    key: K,
    args: CallArgsOf<A, K>,
  ) => { queryKey: readonly unknown[]; queryFn: () => Promise<ResOf<A, K>> };
  mutation: <K extends keyof A>(
    key: K,
  ) => { mutationFn: (args: CallArgsOf<A, K>) => Promise<ResOf<A, K>> };
};

/** Sorted by CODE POINT so two equal queries written in different key order are ONE
 *  cache entry, never two. `byCodepoint` rather than localeCompare for the reason it
 *  exists: ICU collation is a property of the machine. */
const stable = (record: unknown): [string, unknown][] => {
  if (typeof record !== 'object' || record === null) return [];
  return Object.entries(record as Record<string, unknown>).sort((a, b) => byCodepoint(a[0], b[0]));
};

export function makeQueries<A extends ApiSpec>(
  contract: Contract<A>,
  http: Transport,
): Queries<A> {
  const keyOf: KeyOf<A> = (key, args) => {
    /* The operation NAME first, always, so two operations cannot collide however their
       params happen to be spelled — and so invalidating one operation is a prefix match
       on exactly that name.

       THE BODY IS IN THE KEY, and an earlier version left it out "so a mutation does
       not fragment its own cache". That reasoning described a path that does not
       exist: `mutation()` calls `keyOf(key)` with NO args, so it never reaches this
       line, and `query()` is the only caller that passes them. Dropping the body meant
       two different bodied reads — a search POST, say — collided on one key and served
       each other's data. */
    if (args === undefined) return [String(key)] as const;
    return [String(key), stable(args.params), stable(args.qry), args.body ?? null] as const;
  };

  return {
    keyOf,
    query: (key, args) => ({ queryKey: keyOf(key, args), queryFn: () => contract.call(http, key, args) }),
    /* NO `invalidates`. A first version returned `keyOf(key)` — the MUTATION's own
       name — which can never prefix-match the key of any read, so a screen following
       it would silently stop refreshing after a write. The registry declares no
       relationship between a write and the reads it stales, so there is no correct
       value to derive: the screen names the reads to invalidate with `keyOf`, which is
       still registry-derived and still cannot drift from the operation. */
    mutation: (key) => ({ mutationFn: (args) => contract.call(http, key, args) }),
  };
}
