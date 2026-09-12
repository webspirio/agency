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
  ParamsOf,
  PathsAreLiterals,
  AllResJsonSafe,
  IsJsonSafe,
} from './contract';
import { makeContract, wire } from './contract';
import type { Paginated } from './types';

/* ── a fixture contract, small enough to read in one screen ─────────────── */

type Party = { id: string; name: string };

const api = {
  listParties: { method: 'GET', path: '/parties', status: 200, caps: [], codes: [] },
  getParty: { method: 'GET', path: '/parties/:id', status: 200, caps: [], codes: ['PARTY_NOT_FOUND'] },
  createParty: { method: 'POST', path: '/parties', status: 201, caps: ['crm'], codes: ['PARTY_NAME_TAKEN'] },
  removeParty: { method: 'DELETE', path: '/parties/:id', status: 204, caps: ['crm'], codes: ['PARTY_NOT_FOUND'] },
} as const;
type Api = typeof api;

interface Io {
  listParties: { req: void; res: Paginated<Party>; qry: { page?: string; limit?: string } };
  getParty: { req: void; res: Party; qry: Record<string, never> };
  createParty: { req: { name: string }; res: Party; qry: Record<string, never> };
  removeParty: { req: void; res: void; qry: Record<string, never> };
}

const contract = makeContract<Api, Io>(api);
const call: Contract<Api, Io>['call'] = contract.call;
const fail: Contract<Api, Io>['fail'] = contract.fail;

/* ── WHAT THE REGISTRY GUARANTEES, asserted positively ──────────────────── */

/** Every operation in the registry has exactly one entry in the type map. */
export type IoCoversApi = Expect<Equal<keyof Io, keyof Api>>;

/** The path LITERAL produces the params — not a hand-written declaration. */
export type ParamsComeFromThePath = Expect<Equal<ParamsOf<Api['getParty']['path']>, { id: string }>>;

/** Error codes are a closed union per operation, never bare `string`. */
export type CodesAreClosed = Expect<Equal<Api['createParty']['codes'][number], 'PARTY_NAME_TAKEN'>>;

/** An operation that declares no codes may refuse with NOTHING. */
export type NoCodesMeansNever = Expect<Equal<Api['listParties']['codes'][number], never>>;

/** `as const` is intact, so call-site parameter checking still exists at all. */
export type KeepAsConst = Expect<Equal<PathsAreLiterals<Api>, true>>;

/** Every declared response is a shape JSON can actually carry. */
export type ResponsesAreWireShaped = Expect<AllResJsonSafe<Api, Io>>;

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

  // @ts-expect-error there is no such operation in the contract.
  void call(http, 'deleteEverything', { params: {}, body: undefined });
}

export function codeRefusals(): void {
  // @ts-expect-error PARTY_NAME_TAKEN is not in getParty's declared code set.
  fail('getParty', 409, 'PARTY_NAME_TAKEN', 'no');

  // @ts-expect-error an undeclared code. THE graft that turns A's inert `codes` into a mechanism.
  fail('getParty', 404, 'PARTY_MISSPELLED', 'no');

  // @ts-expect-error listParties declares NO codes, so every code is refused here.
  fail('listParties', 500, 'ANYTHING', 'no');
}

/** A handler must return everything the contract declares. */
// @ts-expect-error this one returns only `id`.
export const handlerReturnsTooLittle: HandlersOf<Api, Io>['getParty'] = () => ({ id: 'p1' });

/** Every declared operation needs a handler. */
// @ts-expect-error 'removeParty' is missing from the map.
export const handlerMapIsIncomplete: HandlersOf<Api, Io> = {
  listParties: () => wire({ data: [], total: 0, page: 1, limit: 20 }),
  getParty: () => wire({ id: 'p1', name: 'x' }),
  createParty: () => wire({ id: 'p1', name: 'x' }),
};

/* ── EXACTNESS: a wider store row may not reach the client ──────────────── */

type StoredParty = Party & { internalNote: string };
declare const stored: StoredParty;
declare const storedRows: StoredParty[];

export const leaksAPrivateField: HandlersOf<Api, Io>['getParty'] = () =>
  // @ts-expect-error the store row carries `internalNote`, which the contract does not declare.
  wire(stored);

export const leaksThroughTheListEnvelope: HandlersOf<Api, Io>['listParties'] = () =>
  // @ts-expect-error the wide row is NESTED in data[]; a shallow Exact misses this one.
  wire({ data: storedRows, total: 1, page: 1, limit: 20 });

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
  Equal<Equal<CallArgsOf<Api, Io, 'getParty'>, CallArgsOf<Api, Io, 'listParties'>>, false>
>;
