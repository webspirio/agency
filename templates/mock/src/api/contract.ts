/**
 * THE CONTRACT. One `as const` object keyed by operation name, and everything
 * else in this mock is derived from it by type: the handler map in `routes.ts`,
 * every call site in `src/pages/`, every refusal, and the error branch a screen
 * reads. Nothing is generated — tsc derives them from this one literal.
 *
 * NOT @scaffold-owned, and that is a decision rather than an omission. The five
 * marked files carry the marker because they fail SILENTLY when rewritten. This
 * file fails LOUDLY: drop an operation and the handler map is red, drop
 * `as const` and `KEEP_AS_CONST` is red, add an operation without a type entry
 * and `IO_COVERS_API` is red. It is also the one file a mock author MUST edit —
 * every new endpoint starts here — so a "do not touch" marker would be telling
 * them not to do the thing the file exists for.
 *
 * WHAT A BACKEND DEVELOPER RECEIVES. This object is the whole hand-off: every
 * operation with its method, path, success status, capability, request type,
 * response type and closed set of error codes. It is the nearest thing to an
 * OpenAPI table this repo can produce with zero dependencies, and the product
 * has no equivalent — @nestjs/swagger is not installed (SPEC 3).
 */
import {
  makeContract,
  type AllResJsonSafe,
  type Contract,
  type Equal,
  type Expect,
  type Paginated,
  type PathsAreLiterals,
} from '@agency/mock';
import type { CreateParty, Overview, Party, RenameParty } from '../domain/types';

/**
 * `caps: []` everywhere, deliberately: `agency new` cannot know a client's
 * capability vocabulary at t=0, and a route gated on a capability no profile
 * grants is a route that 404s for everyone. Add `caps: ['fleet']` here and the
 * adapter gates the ROUTE — not merely the menu — for every profile that lacks
 * it, with no other file to update.
 *
 * DECLARATION ORDER IS THE ROUTE TABLE'S ORDER. `toRoutes` reads these keys in
 * order, the first matching route wins, and `compile()` refuses a table where an
 * earlier route shadows a later one — so a literal segment must be declared
 * before its `:param` sibling.
 */
export const api = {
  overview: { method: 'GET', path: '/overview', status: 200, caps: [], codes: [] },
  listParties: { method: 'GET', path: '/parties', status: 200, caps: [], codes: [] },
  getParty: { method: 'GET', path: '/parties/:id', status: 200, caps: [], codes: ['PARTY_NOT_FOUND'] },
  createParty: {
    method: 'POST', path: '/parties', status: 201, caps: [],
    codes: ['PARTY_NAME_TAKEN', 'PARTY_NAME_BLANK', 'PARTY_BALANCE_INVALID'],
  },
  renameParty: {
    method: 'PATCH', path: '/parties/:id', status: 200, caps: [],
    codes: ['PARTY_NOT_FOUND', 'PARTY_NAME_TAKEN', 'PARTY_NAME_BLANK'],
  },
  removeParty: {
    method: 'DELETE', path: '/parties/:id', status: 204, caps: [],
    codes: ['PARTY_NOT_FOUND'],
  },
} as const;

export type Api = typeof api;

/**
 * The sibling TYPE map — one entry per operation, and the types live HERE rather
 * than as phantom values in the registry above, so nothing type-only survives
 * into the bundle.
 *
 * A PLAIN interface, never `extends IoFor<Api>`: extending would make a
 * forgotten operation inherit the wide `IoSpec` from the base, and `IO_COVERS_API`
 * below would pass while the operation had no types at all.
 *
 * `qry` is declared on EVERY entry from t=0 — `Record<string, never>` means "this
 * operation takes no query", and it refuses every key. Retrofitting a query slot
 * later is all-or-nothing, because `CallArgs` threads it through every call site.
 */
export interface Io {
  overview: { req: void; res: Overview; qry: Record<string, never> };
  listParties: { req: void; res: Paginated<Party>; qry: { page?: string; limit?: string } };
  getParty: { req: void; res: Party; qry: Record<string, never> };
  createParty: { req: CreateParty; res: Party; qry: Record<string, never> };
  renameParty: { req: RenameParty; res: Party; qry: Record<string, never> };
  /** 204, and therefore NO body. Measured: a handler returning `null` puts the
   *  literal JSON `null` on a 204, which no Nest 204 ever carries; returning
   *  nothing yields '', which is what axios gives against the real backend. */
  removeParty: { req: void; res: void; qry: Record<string, never> };
}

/* ── the three tripwires, each a compile error rather than a convention ──── */

/**
 * Losing `as const` fails HALF-SILENTLY: the path widens to `string`,
 * `ParamsOf<string>` evaporates, and only the HANDLER stays red — every wrong
 * call site goes quiet. This line makes that loss loud.
 */
export const KEEP_AS_CONST: PathsAreLiterals<Api> = true;

/** An operation in one and not the other is a compile error, both directions. */
export type IO_COVERS_API = Expect<Equal<keyof Io, keyof Api>>;

/**
 * Every declared response is a shape JSON can actually carry. A `Date`, a `Map`,
 * or a REQUIRED key whose value may be `undefined` is refused here — all three
 * survive the round trip as something other than what the type promised.
 */
export type RESPONSES_ARE_WIRE_SHAPED = Expect<AllResJsonSafe<Api, Io>>;

/* ── the bound helpers ──────────────────────────────────────────────────── */

const contract = makeContract<Api, Io>(api);

/**
 * ANNOTATED CONSTS, not a destructure, and the annotation is load-bearing on
 * `fail`. MEASURED: a never-returning function narrows only when the callee is a
 * function declaration or a const with an EXPLICIT type — a destructured
 * `const { fail } = ...` does not narrow, and neither does `contract.fail(...)`.
 * Without it every `if (!row) fail(...)` would leave `row` possibly-undefined and
 * each handler would need a non-null assertion.
 */
export const call: Contract<Api, Io>['call'] = contract.call;
export const fail: Contract<Api, Io>['fail'] = contract.fail;
export const codeOf: Contract<Api, Io>['codeOf'] = contract.codeOf;
export const toRoutes: Contract<Api, Io>['toRoutes'] = contract.toRoutes;
