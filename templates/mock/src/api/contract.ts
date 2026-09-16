/**
 * THE CONTRACT. One object keyed by operation name, and everything else in this
 * mock is derived from it by type: the handler map in `routes.ts`, every call site
 * in `src/pages/`, every refusal, and the error branch a screen reads. Nothing is
 * generated — tsc derives them from this one literal.
 *
 * ONE ENTRY PER OPERATION. The request, response and query types ride on the entry
 * through `op<Req, Res, Qry>()`; there is no sibling type map to fall out of step
 * with. No `as const` either — `op`'s `<const S extends Spec>` preserves every
 * literal, and that was measured rather than assumed.
 *
 * NOT @scaffold-owned, and that is a decision rather than an omission. The five
 * marked files carry the marker because they fail SILENTLY when rewritten. This
 * file fails LOUDLY: drop an operation and the handler map is red, forget the
 * `op<…>()` wrapper on an entry and `KEEP_LITERAL` is red. It is also the one file
 * a mock author MUST edit — every new endpoint starts here — so a "do not touch"
 * marker would be telling them not to do the thing the file exists for.
 *
 * WHAT A BACKEND DEVELOPER RECEIVES. This object is the whole hand-off: every
 * operation with its method, path, success status, capability, request type,
 * response type, and closed set of error codes WITH the status each answers —
 * which is the `responses` column any OpenAPI emitter needs. It is the nearest
 * thing to an OpenAPI table this repo can produce with zero dependencies, and the
 * product has no equivalent — @nestjs/swagger is not installed (SPEC 3).
 */
import {
  makeContract,
  op,
  s,
  shape,
  type AllResJsonSafe,
  type BodiesOf,
  type Contract,
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
 * before its `:param` sibling. `op()` is type-only at runtime, so it does not
 * disturb that order.
 *
 * `codes` maps each code to the STATUS it answers, so `fail()` takes no status and
 * two handlers cannot disagree about one code. `{}` means the operation never
 * refuses, and `CodeOf` for it is `never`.
 */
export const api = {
  overview: op<void, Overview>()({
    method: 'GET', path: '/overview', status: 200, caps: [], codes: {},
  }),
  listParties: op<void, Paginated<Party>, { page?: string; limit?: string }>()({
    method: 'GET', path: '/parties', status: 200, caps: [], codes: {},
  }),
  /**
   * MODELLED FROM THE TRANSCRIPT BEFORE ITS SCREEN EXISTS, which is what `unreached`
   * is for: an operation nothing calls is red unless its entry says why, in a
   * sentence, and the marker itself goes red the day a screen does reach it. Delete
   * the marker then — do not delete the check.
   *
   * DECLARED BEFORE `getParty`, and that is not cosmetic: '/parties/export' is a
   * LITERAL segment where '/parties/:id' has a param, so declaring it second means
   * the param route matches first and swallows it. `compile()` refuses that table at
   * startup — it caught this exact ordering when the operation was first added.
   *
   * Its response is a plain `string` deliberately. That is the case the
   * branded-return exactness variant broke, so the sink is exercised against a
   * primitive response on every build.
   */
  exportParties: op<void, string>()({
    method: 'GET', path: '/parties/export', status: 200, caps: [], codes: {},
    unreached: 'CSV export lands with the reports screen',
  }),
  getParty: op<void, Party>()({
    method: 'GET', path: '/parties/:id', status: 200, caps: [],
    codes: { PARTY_NOT_FOUND: 404 },
  }),
  createParty: op<CreateParty, Party>()({
    method: 'POST', path: '/parties', status: 201, caps: [],
    codes: { PARTY_NAME_TAKEN: 409, PARTY_NAME_BLANK: 400, PARTY_BALANCE_INVALID: 400 },
  }),
  renameParty: op<RenameParty, Party>()({
    method: 'PATCH', path: '/parties/:id', status: 200, caps: [],
    codes: { PARTY_NOT_FOUND: 404, PARTY_NAME_TAKEN: 409, PARTY_NAME_BLANK: 400 },
  }),
  /** 204, and therefore NO body. Measured: a handler returning `null` puts the
   *  literal JSON `null` on a 204, which no Nest 204 ever carries; returning
   *  nothing yields '', which is what axios gives against the real backend. */
  removeParty: op<void, void>()({
    method: 'DELETE', path: '/parties/:id', status: 204, caps: [],
    codes: { PARTY_NOT_FOUND: 404 },
  }),
};

/** No `as const`. `op`'s `<const S extends Spec>` preserves every literal — measured. */
export type Api = typeof api;

/* ── the two tripwires, each a compile error rather than a convention ────── */

/**
 * Every path is still a LITERAL. It reads as a leftover now that there is no
 * `as const` to delete, and it is not: it is the only check INSIDE this file that
 * an entry was written with `op<…>()` at all. Forget the wrapper and the path
 * widens to `string`, `ParamsOf` evaporates, and every other symptom of the
 * mistake surfaces in a different file.
 */
export const KEEP_LITERAL: PathsAreLiterals<Api> = true;

/**
 * Every declared response is a shape JSON can actually carry. A `Date`, a `Map`,
 * or a REQUIRED key whose value may be `undefined` is refused here — all three
 * survive the round trip as something other than what the type promised. It also
 * refuses an entry written without `op<…>()`, whose response resolves to `unknown`.
 */
export type RESPONSES_ARE_WIRE_SHAPED = Expect<AllResJsonSafe<Api>>;

/* ── the bound helpers ──────────────────────────────────────────────────── */

/**
 * WHAT A MALFORMED REQUEST GETS, and it is the product's answer rather than a
 * convenient one. MEASURED 2026-09-13 before this existed: `POST /parties` with `{}`
 * answered **500 Internal server error** — the demo's most common mistake looking like
 * a crash — and a forged `id` was accepted with 201 and silently ignored. The product
 * answers 400 with one sentence per failed field, and refuses the unknown property
 * outright because its global ValidationPipe runs `forbidNonWhitelisted: true`.
 *
 * Every operation with a request BODY must appear here, and no operation without one
 * may: `BodiesOf<Api>` keys off `ReqOf`, so a missing shape is TS2741 naming the
 * operation and a stray one is TS2353. `satisfies` rather than an annotation, for the
 * same reason the handler map uses it — an annotation would widen the literal and the
 * exactness would evaporate.
 *
 * The check runs BEFORE the handler, so the handler body stays the Nest service body
 * it becomes.
 */
const bodies = {
  createParty: shape({
    name: s.str(),
    company: s.str(),
    address: s.str(),
    /**
     * `s.str()`, NOT `s.dec2()`, and the distinction is load-bearing.
     *
     * A shape check answers "is this the right SHAPE"; a DOMAIN RULE answers "is this
     * a legal value here", and only the second has a declared code. `'1.5'` is a
     * perfectly good string, so it passes here and `invalidBalance` in
     * `src/domain/rules.ts` refuses it with PARTY_BALANCE_INVALID.
     *
     * Measured the moment this was written as `s.dec2()`: the shape check ran BEFORE
     * the handler, so it intercepted the malformed balance and answered a codeless
     * 400 — and PARTY_BALANCE_INVALID became a declared code nothing could emit,
     * while `contract:complete` stayed green because the `fail()` site still existed.
     * A shape that duplicates a domain rule silently deletes that rule's code.
     */
    balance: s.str(),
  }),
  renameParty: shape({ name: s.str() }),
} satisfies BodiesOf<Api>;

const contract = makeContract<Api>(api, bodies);

/**
 * ANNOTATED CONSTS, not a destructure, and the annotation is load-bearing on
 * `fail`. MEASURED: a never-returning function narrows only when the callee is a
 * function declaration or a const with an EXPLICIT type — a destructured
 * `const { fail } = ...` does not narrow, and neither does `contract.fail(...)`.
 * Without it every `if (!row) fail(...)` would leave `row` possibly-undefined and
 * each handler would need a non-null assertion.
 */
export const call: Contract<Api>['call'] = contract.call;
export const fail: Contract<Api>['fail'] = contract.fail;
export const codeOf: Contract<Api>['codeOf'] = contract.codeOf;
export const toRoutes: Contract<Api>['toRoutes'] = contract.toRoutes;


/** The bound `Contract` itself, for `makeQueries` in `src/api/queries.ts`. Exported
 *  rather than used here: `contract.ts` must not import `./client`, which imports
 *  `./routes`, which imports this file — measured as `toRoutes is not a function` at
 *  module init. */
export { contract };
