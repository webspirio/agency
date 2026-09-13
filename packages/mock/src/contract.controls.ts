/**
 * THE PROOF THAT THE SPINE BITES — and the proof of what it does NOT catch.
 *
 * Every `@ts-expect-error` below is a drift the contract is supposed to refuse.
 * This file compiles ONLY while each one is still an error: weaken the binding
 * and tsc reports `TS2578: Unused '@ts-expect-error' directive`. So the controls
 * ratchet in both directions exactly as a lint-exemption baseline does, and they
 * cost nothing to run because `pnpm typecheck` already compiles this directory.
 *
 * The second half is the important one. A weakness asserted as a LIVE TYPE goes
 * red the day the design gains the property, which is the only way a negative
 * claim in a document can be kept honest.
 *
 * ONE MECHANIC, measured rather than assumed: the directive applies to the NEXT
 * LINE, and tsc reports an argument error at the ARGUMENT. A directive above
 * `export const` for an error reported three lines later suppresses nothing and
 * is itself reported as TS2578.
 */
import type {
  CallArgsOf,
  Contract,
  Equal,
  Expect,
  HandlersOf,
  Leaks,
  ParamsOf,
  PathsAreLiterals,
  CodeOf,
  QryOf,
  ReqOf,
  ResOf,
  AllResJsonSafe,
  IsJsonSafe,
} from './contract';
import { makeContract, op } from './contract';
import type { Route } from './router';
import type { Paginated } from './types';

/* ── a fixture contract, small enough to read in one screen ─────────────── */

type Party = { id: string; name: string };

const api = {
  listParties: op<void, Paginated<Party>, { page?: string; limit?: string }>()({
    method: 'GET', path: '/parties', status: 200, caps: [], codes: {},
  }),
  getParty: op<void, Party>()({
    method: 'GET', path: '/parties/:id', status: 200, caps: [], codes: { PARTY_NOT_FOUND: 404 },
  }),
  createParty: op<{ name: string }, Party>()({
    method: 'POST', path: '/parties', status: 201, caps: ['crm'], codes: { PARTY_NAME_TAKEN: 409 },
  }),
  removeParty: op<void, void>()({
    method: 'DELETE', path: '/parties/:id', status: 204, caps: ['crm'], codes: { PARTY_NOT_FOUND: 404 },
  }),
};
/** No `as const`. `op`'s `<const S extends Spec>` preserves every literal — measured. */
type Api = typeof api;

const contract = makeContract<Api>(api);
const call: Contract<Api>['call'] = contract.call;
const fail: Contract<Api>['fail'] = contract.fail;
const toRoutes: Contract<Api>['toRoutes'] = contract.toRoutes;

/* ── THE LITERALS SURVIVE WITHOUT `as const` ────────────────────────────── */

export type PathIsTheLiteral = Expect<Equal<Api['getParty']['path'], '/parties/:id'>>;
/** The NEGATIVE too: a positive alone is satisfied by `string` degenerating. */
export type PathIsNotString = Expect<Equal<Equal<Api['getParty']['path'], string>, false>>;
export type StatusIsTheLiteral = Expect<Equal<Api['createParty']['status'], 201>>;
export type StatusIsNotNumber = Expect<Equal<Equal<Api['getParty']['status'], number>, false>>;
export type MethodIsTheLiteral = Expect<Equal<Api['createParty']['method'], 'POST'>>;
export type CapsIsATuple = Expect<Equal<Api['getParty']['caps'], readonly []>>;
export type CodeStatusIsTheLiteral = Expect<Equal<Api['getParty']['codes']['PARTY_NOT_FOUND'], 404>>;

/* ── THE PHANTOM RESOLVES, THROUGH AN OPTIONAL PROPERTY ─────────────────── */

export type ResIsTheDeclaredType = Expect<Equal<ResOf<Api, 'getParty'>, Party>>;
export type ResIsVoidForA204 = Expect<Equal<ResOf<Api, 'removeParty'>, void>>;
export type ResIsTheEnvelope = Expect<Equal<ResOf<Api, 'listParties'>, Paginated<Party>>>;
export type ReqIsTheDeclaredBody = Expect<Equal<ReqOf<Api, 'createParty'>, { name: string }>>;
export type ReqIsVoidForAGet = Expect<Equal<ReqOf<Api, 'getParty'>, void>>;
export type QryIsDeclared = Expect<
  Equal<QryOf<Api, 'listParties'>, { page?: string; limit?: string }>
>;
/** The DEFAULT closes the slot `interface Io` used to declare by hand. */
export type QryDefaultsClosed = Expect<Equal<QryOf<Api, 'getParty'>, Record<string, never>>>;

/* ── NOTHING IS GREEN BY DEGENERATION ───────────────────────────────────── */

export type ResIsNotUnknown = Expect<Equal<Equal<ResOf<Api, 'getParty'>, unknown>, false>>;
export type ResIsNotNever = Expect<Equal<Equal<ResOf<Api, 'getParty'>, never>, false>>;

/* ── WHAT THE REGISTRY GUARANTEES, asserted positively ──────────────────── */

/** The path LITERAL produces the params — not a hand-written declaration. */
export type ParamsComeFromThePath = Expect<Equal<ParamsOf<Api['getParty']['path']>, { id: string }>>;

/** Error codes are a closed union per operation, never bare `string`. */
export type CodesAreClosed = Expect<Equal<CodeOf<Api, 'createParty'>, 'PARTY_NAME_TAKEN'>>;

/**
 * Over a UNION of operations, `CodeOf` is the UNION of their code sets.
 *
 * MEASURED 2026-09-13, and it was WRONG before this control existed: `keyof` over a
 * union of object types is the INTERSECTION of their keys, so
 * `CodeOf<Api, 'listParties' | 'getParty'>` was `never` — and `listParties` declares
 * `codes: {}`, so any union containing it collapsed the whole thing. A screen's
 * `SAYS … satisfies Record<CodeOf<Api, K1 | K2>, string>` was therefore
 * `satisfies Record<never, string>`, which is `satisfies {}` and asserts nothing in
 * either direction. `CodeOf` distributes over `K` for exactly this reason.
 */
export type CodeOfAUnionIsTheUnion = Expect<
  Equal<CodeOf<Api, 'getParty' | 'createParty'>, 'PARTY_NOT_FOUND' | 'PARTY_NAME_TAKEN'>
>;

/** …and an operation with no codes contributes nothing rather than erasing the rest. */
export type AnEmptyCodeSetDoesNotEraseTheUnion = Expect<
  Equal<CodeOf<Api, 'listParties' | 'getParty'>, 'PARTY_NOT_FOUND'>
>;

/** An operation that declares no codes may refuse with NOTHING. */
export type NoCodesMeansNever = Expect<Equal<CodeOf<Api, 'listParties'>, never>>;

/** `as const` is intact, so call-site parameter checking still exists at all. */
export type KeepAsConst = Expect<Equal<PathsAreLiterals<Api>, true>>;

/** Every declared response is a shape JSON can actually carry. */
export type ResponsesAreWireShaped = Expect<AllResJsonSafe<Api>>;

/** A 204 handler returns nothing, and `void` is a legitimate wire response. */
export type VoidIsWireSafe = Expect<IsJsonSafe<void>>;

/* ── WHAT IT REFUSES. Each line must stay an error. ─────────────────────── */

export function callRefusals(http: Parameters<typeof call>[0]): void {
  // @ts-expect-error the path declares ':id'; 'partyId' is not a param of it.
  void call(http, 'getParty', { params: { partyId: 'x' }, body: undefined });

  // @ts-expect-error a declared param may not be omitted.
  void call(http, 'getParty', { params: {}, body: undefined });

  // @ts-expect-error createParty declares a { name } body; 'title' is not a field of it.
  void call(http, 'createParty', { params: {}, body: { title: 'x' } });

  // @ts-expect-error listParties declares no 'nope' query key — the qry slot is closed.
  void call(http, 'listParties', { params: {}, body: undefined, qry: { nope: '1' } });

  // @ts-expect-error a query value is a WIRE string, never a number.
  void call(http, 'listParties', { params: {}, body: undefined, qry: { page: 1 } });

  // @ts-expect-error getParty declares no query at all.
  void call(http, 'getParty', { params: { id: 'p1' }, body: undefined, qry: { page: '1' } });

  /* A name no registry will ever declare, DELIBERATELY: a control must not become
     an ambush the day someone declares an operation by the name it probes with. */
  // @ts-expect-error there is no such operation in the contract.
  void call(http, '__no_such_operation__', { params: {}, body: undefined });
}

/* ── THE PAGE-SIDE CLIENT IS OPAQUE ─────────────────────────────────────── *
 *
 * Only `call()` unwraps it, so a raw verb is TS2339 in every file a mock compiles —
 * hooks, components and helpers included, which no single-file AST walk reaches.
 * This replaces api:bound's /httpClient|axios/i match against the callee text, which
 * 13 of 19 measured spellings evaded: the UNALIASED `httpClient({ url })` most of all,
 * because an AxiosInstance is callable, so the callee is an Identifier and the
 * property-access branch never ran.
 */
export function transportIsOpaque(http: Parameters<typeof call>[0]): void {
  // @ts-expect-error a raw verb is not a member of the transport.
  void http.get('/parties');

  // @ts-expect-error the transport is not callable either.
  void http({ url: '/parties' });

  // @ts-expect-error a verb the old RAW_HTTP set never listed is refused by the same mechanism.
  void http.postForm('/parties', {});
}

export function codeRefusals(): void {
  // @ts-expect-error PARTY_NAME_TAKEN is not in getParty's declared code set.
  fail('getParty', 'PARTY_NAME_TAKEN', 'no');

  // @ts-expect-error an undeclared code. THE graft that turns an inert `codes` into a mechanism.
  fail('getParty', 'PARTY_MISSPELLED', 'no');

  // @ts-expect-error listParties declares NO codes, so every code is refused here.
  fail('listParties', 'ANYTHING', 'no');
}

/** A handler must return everything the contract declares. */
// @ts-expect-error this one returns only `id`.
export const handlerReturnsTooLittle: HandlersOf<Api>['getParty'] = () => ({ id: 'p1' });

/** Every declared operation needs a handler. */
// @ts-expect-error 'removeParty' is missing from the map.
export const handlerMapIsIncomplete: HandlersOf<Api> = {
  listParties: () => ({ data: [], total: 0, page: 1, limit: 20 }),
  getParty: () => ({ id: 'p1', name: 'x' }),
  createParty: () => ({ id: 'p1', name: 'x' }),
};

/* ── EXACTNESS: a wider store row may not reach the client ──────────────── *
 *
 * The check is at the SINK, not at each return. MEASURED 2026-09-13: `wire()` was
 * OPT-IN, and `getParty: () => storedWideRow` compiled clean against the real
 * `HandlersOf` in the exact shape routes.ts uses — excess-property checking never
 * fires on a contextually typed arrow's return. The two controls this replaces
 * asserted that `wire()` bites WHEN CALLED, which was the positive direction only
 * and is precisely the gap.
 */

type StoredParty = Party & { internalNote: string };
declare const wideRow: StoredParty;

/**
 * `satisfies`, NOT a return-type annotation. An annotation widens the factory's
 * return to the declared type, `H` collapses into it, and the sink has nothing
 * left to compare — which is what `FactoryNotWidened` below pins.
 */
const makeOkHandlers = () =>
  ({
    listParties: () => ({ data: [], total: 0, page: 1, limit: 20 }),
    getParty: () => ({ id: 'p1', name: 'x' }),
    createParty: () => ({ id: 'p1', name: 'x' }),
    removeParty: () => undefined,
  }) satisfies HandlersOf<Api>;

const ok = makeOkHandlers();

// @ts-expect-error a top-level wide row is refused at toRoutes, naming the operation.
export const leakTopLevel: Route[] = toRoutes({ ...ok, getParty: () => wideRow });

// @ts-expect-error a wide row NESTED in data[] is refused — the check is DEEP.
export const leakNested: Route[] = toRoutes({ ...ok, listParties: () => ({ data: [wideRow], total: 1, page: 1, limit: 20 }) });

// @ts-expect-error a wide row behind `async` is refused — Awaited<R> strips the Promise.
export const leakAsync: Route[] = toRoutes({ ...ok, getParty: async () => wideRow });

/** A narrow map is accepted, and no handler body mentions the contract at all. */
export const noLeak: Route[] = toRoutes(ok);

/** The factory's return type is the LITERAL map, not the declared one. */
export type FactoryNotWidened = Expect<
  Equal<Equal<ReturnType<typeof makeOkHandlers>, HandlersOf<Api>>, false>
>;

/* ── WHAT IS ACTUALLY LOAD-BEARING IN `Leaks` ───────────────────────────── *
 *
 * The memo claimed "NoInfer is load-bearing TWICE". It did not reproduce: stripping
 * both occurrences from the `wire()` it lived in left every diagnostic byte-identical,
 * and `wire()` is now deleted, so the word appears nowhere in this package. These four
 * controls pin what does the work instead — nothing pinned it before.
 */

/** The comparison target is read from the REGISTRY, not inferred from the handler. */
export type ExactnessTargetComesFromTheRegistry = Expect<
  Equal<Leaks<Api, { getParty: () => Party }>, never>
>;

/** A wide return IS a leak, and `Leaks` names the operation rather than saying `true`. */
export type LeakNamesTheOperation = Expect<
  Equal<Leaks<Api, { getParty: () => StoredParty }>, 'getParty'>
>;

/**
 * `Awaited<R>` is the load-bearing token. A handler's contextual return type is
 * `Res | Promise<Res>`, and `keyof (Party | Promise<Party>)` is empty — without the
 * unwrap every property maps to `never` and an async leak is invisible.
 */
export type AsyncLeakIsStillALeak = Expect<
  Equal<Leaks<Api, { getParty: () => Promise<StoredParty> }>, 'getParty'>
>;

/**
 * …and THIS is the one that pins `Awaited`. MEASURED 2026-09-13: stripping the unwrap
 * left `AsyncLeakIsStillALeak` above green, because `keyof Promise<StoredParty>` is
 * `then | catch | finally | …`, none of which Party declares, so the comparison fails
 * for the wrong reason and an async LEAK still reads as a leak. What breaks is the
 * other direction — every CORRECT async handler reads as a leak too, and the check
 * becomes noise rather than a guard. Only this control goes red on that.
 */
export type AsyncExactIsNotALeak = Expect<
  Equal<Leaks<Api, { getParty: () => Promise<Party> }>, never>
>;

/**
 * A UNION return is a leak if ANY constituent leaks. Found on 2026-09-13 by an
 * adversarial review of Phase 1: `DeepExact`'s object branch is a homomorphic mapped
 * type, so it distributed over a union argument, and
 * `[Wide | Narrow] extends [DeepExact<Wide, Res> | DeepExact<Narrow, Res>]` was
 * satisfied by the Narrow constituent — because Wide is ASSIGNABLE to Narrow. So
 * `return c.actor.role === 'admin' ? { ...row, internalNote } : row` was green while
 * the same wide row returned unconditionally was red.
 */
export type UnionReturnIsALeak = Expect<
  Equal<Leaks<Api, { getParty: () => StoredParty | Party }>, 'getParty'>
>;

/** …and a union of two EXACT shapes is still not a leak. */
export type ExactUnionIsNotALeak = Expect<
  Equal<Leaks<Api, { getParty: () => Party | Party }>, never>
>;

declare const unrelated: { id: string; extra: number };
declare const narrowParty: Party;
declare const flag: boolean;

/** And it bites at the SINK, not only when `Leaks` is applied by hand. */
// @ts-expect-error one constituent carries `extra`, which getParty does not declare.
export const leakUnion: Route[] = toRoutes({ ...ok, getParty: () => (flag ? unrelated : narrowParty) });

/* ── A THIRD RESIDUAL, and it is NOT the union hole above ────────────────── *
 *
 * No directive: this compiles, and that is the point.
 *
 * MEASURED 2026-09-13. An adversarial review reported that a handler branching
 * `c.actor.role === 'admin' ? wideRow : row` evades `Leaks`, and read it as the union
 * hole. It is not. TypeScript SUBTYPE-REDUCES `StoredParty | Party` to `Party` at
 * inference, because StoredParty is a subtype of Party — so no union ever reaches
 * `Leaks`, and the handler's return type is `Party` however it is examined. The union
 * fix above is real and necessary (an UNRELATED union survives reduction and is caught,
 * measured), but it cannot close this: the type stopped describing the value before any
 * of our machinery ran.
 *
 * This sits beside the annotated widening as a residual no type-level scheme closes,
 * and the wire golden is the ground truth for both.
 */
export const subtypeReducedBranchIsGreen: Route[] = toRoutes({
  ...ok,
  getParty: () => (flag ? wideRow : narrowParty),
});

/**
 * The reduction itself, pinned where it actually happens — at INFERENCE. A written
 * `StoredParty | Party` is not reduced (measured: `Equal<StoredParty | Party, Party>`
 * is false), which is exactly why `UnionReturnIsALeak` above can be written at all.
 * If TypeScript ever stops reducing the inferred branch, this goes red and the residual
 * above has closed itself.
 */
const branchedHandler = () => (flag ? wideRow : narrowParty);
export type BranchInfersAsTheDeclaredRow = Expect<
  Equal<ReturnType<typeof branchedHandler>, Party>
>;

/**
 * `Leaks` is about EXCESS only, and deliberately. A handler returning LESS than
 * declared is not a leak — it is refused one step earlier, by `toRoutes`'s constraint
 * `H extends HandlersOf<A, I>`, which is what the next control asserts.
 */
export type NarrowReturnIsNotALeak = Expect<
  Equal<Leaks<Api, { getParty: () => { id: string } }>, never>
>;

// @ts-expect-error too LITTLE is refused by the constraint at the sink, not by Leaks.
export const tooLittleIsRefusedAtTheSink: Route[] = toRoutes({ ...ok, getParty: () => ({ id: 'p1' }) });

/**
 * A response the contract declares as `void` is exempt: there is nothing to widen.
 *
 * THE WITNESS IS LOAD-BEARING, and the obvious one does not work. `() => undefined`
 * is swallowed by `DeepExact`'s own primitive guard — `DeepExact<undefined, void>` is
 * `undefined` — so the control was green with the void branch DISABLED and asserted
 * nothing about it. Measured 2026-09-13. An object-returning handler for the void
 * operation is the witness that actually reaches the branch.
 */
export type VoidResponseIsNotALeak = Expect<
  Equal<Leaks<Api, { removeParty: () => { internalNote: string } }>, never>
>;

/* ── JsonSafe: the declared response must be the WIRE type ──────────────── */

/** A `Date` does not survive JSON as a Date. */
export type DateIsRefused = Expect<
  // @ts-expect-error a Date-carrying response is not a wire shape.
  IsJsonSafe<{ id: string; at: Date }>
>;

/** A `Map` serialises to `{}` — every entry silently gone. */
export type MapIsRefused = Expect<
  // @ts-expect-error a Map-carrying response is not a wire shape.
  IsJsonSafe<{ id: string; seen: Map<string, string> }>
>;

/** A REQUIRED key that may be undefined simply vanishes from the payload. */
export type RequiredUndefinedIsRefused = Expect<
  // @ts-expect-error the key is required but its value can vanish; the type lies about the wire.
  IsJsonSafe<{ id: string; maybe: string | undefined }>
>;

/* ── THE HONEST WEAKNESS, asserted as a live type ───────────────────────── *
 *
 * `ParamsOf` erases every NON-PARAM segment, so renaming '/parties/:id' to
 * '/party/:id' produces an identical params type and compiles clean. MEASURED
 * with this repo's tsc 6.0.3, exit 0.
 *
 * The lab README claimed the opposite — "a path rename goes red on both sides
 * from one edit" — and that claim is false for every segment that is not a
 * param. What actually makes a rename safe here is that `call()` takes an
 * operation KEY and never a path, so there is no second copy of the path to
 * drift; a screen that writes a URL by hand instead is caught by `api:bound`,
 * and a rename visible on the wire is caught by `wire:frozen`.
 *
 * If this assertion ever fails, the contract has GAINED whole-path binding and
 * both the memo and the registry row have to be rewritten.
 */
export type SegmentRenameIsInvisibleToTypes = Expect<
  Equal<ParamsOf<'/parties/:id'>, ParamsOf<'/party/:id'>>
>;

/** And the params themselves ARE bound, which is the half that does hold. */
export type ParamRenameIsVisible = Expect<
  Equal<Equal<ParamsOf<'/parties/:id'>, ParamsOf<'/parties/:partyId'>>, false>
>;

/** The args type is derived per operation, so two operations cannot share one. */
export type ArgsArePerOperation = Expect<
  Equal<Equal<CallArgsOf<Api, 'getParty'>, CallArgsOf<Api, 'listParties'>>, false>
>;
