/**
 * THE PROOF THAT THIS MOCK'S CONTRACT BITES.
 *
 * Every `@ts-expect-error` below is a drift the contract is supposed to refuse.
 * This file compiles ONLY while each one is still an error — weaken the binding
 * and tsc reports `TS2578: Unused '@ts-expect-error' directive`. So the controls
 * ratchet in both directions exactly as a lint-exemption baseline does, and they
 * cost nothing to run because `pnpm build` typechecks this directory.
 *
 * It is imported by nothing on purpose. `contract:controls` asserts that it is
 * nevertheless IN the tsc program, because a controls file the compiler never
 * opens is a file full of claims nobody is checking.
 *
 * ONE MECHANIC, measured: the directive applies to the NEXT LINE, and tsc reports
 * an argument error at the ARGUMENT. A directive above `export const` for an
 * error reported three lines later suppresses nothing AND is itself TS2578.
 *
 * Replace these when you replace the domain. Do not delete the file: it is the
 * only thing standing between "the contract exists" and "the contract binds".
 */
import type {
  CodeOf,
  Equal,
  Expect,
  HandlersOf,
  ParamsOf,
  ReqOf,
  ResOf,
  Route,
  Transport,
} from '@agency/mock';
import { call, fail, toRoutes, type Api } from './contract';
import { httpClient } from './client';
import { makeHandlers } from './routes';
import type { Party } from '../domain/types';

/* ── WHAT THE CONTRACT GUARANTEES, asserted positively ──────────────────── */

/** The path LITERAL produces the params — not a hand-written declaration. */
export type ParamsComeFromThePath = Expect<Equal<ParamsOf<Api['getParty']['path']>, { id: string }>>;

/** Error codes are a closed union per operation, never bare `string`. */
export type CodesAreClosed = Expect<
  Equal<CodeOf<Api, 'removeParty'>, 'PARTY_NOT_FOUND'>
>;

/** An operation that declares no codes may refuse with NOTHING. */
export type NoCodesMeansNever = Expect<Equal<CodeOf<Api, 'listParties'>, never>>;

/** The declared request body reaches the handler as a real type, not `unknown`. */
export type BodyIsTyped = Expect<Equal<ReqOf<Api, 'createParty'>['name'], string>>;

/** A 204 operation declares no body at all. */
export type DeleteReturnsNothing = Expect<Equal<ResOf<Api, 'removeParty'>, void>>;

/* ── WHAT IT REFUSES. Each line must stay an error. ─────────────────────── */

export function callRefusals(http: Transport): void {
  // @ts-expect-error the path declares ':id'; 'partyId' is not a param of it.
  void call(http, 'getParty', { params: { partyId: 'x' }, body: undefined });

  // @ts-expect-error a declared param may not be omitted.
  void call(http, 'getParty', { params: {}, body: undefined });

  // @ts-expect-error createParty declares a CreateParty body; 'title' is not a field of it.
  void call(http, 'createParty', { params: {}, body: { title: 'x' } });

  void call(http, 'createParty', {
    params: {},
    body: {
      name: 'x',
      company: 'y',
      address: 'z',
      balance: '1.00',
      // @ts-expect-error created_at is server-derived and may not be sent.
      //
      // NOTE WHERE THIS SITS, because it was measured the hard way: tsc reports
      // an object-literal error at the offending PROPERTY, not at the statement.
      // Written above `void call(...)` this directive suppressed nothing AND was
      // itself reported as TS2578 — the exact mechanic this file's header warns
      // about, got wrong three lines below the warning.
      created_at: 'now',
    },
  });

  // @ts-expect-error listParties declares no 'sort' query key — the qry slot is closed.
  void call(http, 'listParties', { params: {}, body: undefined, qry: { sort: 'name' } });

  // @ts-expect-error a query value is a WIRE string, never a number.
  void call(http, 'listParties', { params: {}, body: undefined, qry: { page: 1 } });

  // @ts-expect-error there is no such operation in the contract.
  void call(http, 'archiveParty', { params: { id: 'p1' }, body: undefined });
}

export function codeRefusals(): void {
  // @ts-expect-error PARTY_NAME_TAKEN is not in getParty's declared code set.
  fail('getParty', 'PARTY_NAME_TAKEN', 'no');

  // @ts-expect-error an undeclared code — the graft that turns inert `codes` into a mechanism.
  fail('getParty', 'PARTY_MISPELLED', 'no');

  // @ts-expect-error listParties declares NO codes, so every code is refused here.
  fail('listParties', 'ANYTHING', 'no');
}

/** A handler must return everything the contract declares. */
// @ts-expect-error this one returns only `id`.
export const handlerReturnsTooLittle: HandlersOf<Api>['getParty'] = () => ({ id: 'party-000001' });

/* ── EXACTNESS: a wider row may not reach the client ────────────────────── *
 *
 * The check is at the SINK — `toRoutes` — not at each return. MEASURED 2026-09-13:
 * the `wire()` call this replaces was OPT-IN, and `getParty: () => storedWideRow`
 * compiled clean against the real `HandlersOf` in the exact shape routes.ts uses,
 * because excess-property checking never fires on a contextually typed arrow's
 * return. Asserting that `wire()` bit WHEN CALLED was the positive direction only.
 */

type StoredParty = Party & { internal_note: string };
declare const wideRow: StoredParty;
declare const narrowRow: Party;

export function sinkRefusesALeak(): void {
  // @ts-expect-error the row carries `internal_note`, which getParty does not declare.
  const table: Route[] = toRoutes({ ...makeHandlers(), getParty: () => wideRow });
  void table;
}

/* ── A SECOND RESIDUAL. No directive — it compiles, and that is the point. ───
 *
 * The shape a capability check takes: one branch returns the wide row, the other the
 * declared one. MEASURED 2026-09-13: TypeScript SUBTYPE-REDUCES
 * `StoredParty | Party` to `Party` at inference, because StoredParty is a subtype of
 * Party — so no union ever reaches the exactness check and the handler's return type
 * is `Party` however it is examined. An adversarial review reported this as a union
 * hole in the check; the union hole was real and is fixed, but it is not what makes
 * THIS green, and no type-level scheme closes it.
 *
 * The wire golden is the ground truth here as it is for `annotatedWideningIsGreen` —
 * with the same limit: it drives each operation once, with one actor, so it fingerprints
 * whichever branch that actor takes.
 */
export const subtypeReducedBranchIsGreen: Route[] = toRoutes({
  ...makeHandlers(),
  getParty: (c) => (c.actor.role === 'admin' ? wideRow : narrowRow),
});

/* ── A SCREEN CANNOT GO AROUND THE CONTRACT ─────────────────────────────── *
 *
 * The page-side client is opaque: only `call()` unwraps it, so a raw verb on it is
 * TS2339 in EVERY file this mock compiles — hooks, components and helpers included,
 * which no single-file AST walk could reach.
 *
 * This replaces api:bound's /httpClient|axios/i text match against the callee, which
 * 13 of 19 measured spellings evaded — including the UNALIASED `httpClient({ url })`,
 * because an AxiosInstance is callable and the callee is then an Identifier, so the
 * property-access branch never ran at all.
 */

export function transportIsOpaque(): void {
  // @ts-expect-error a raw verb on the transport is not a member of it.
  void httpClient.get('/parties');

  // @ts-expect-error the instance itself is not callable either.
  void httpClient({ url: '/parties' });

  // @ts-expect-error a verb the old RAW_HTTP set never listed is refused by the same mechanism.
  void httpClient.postForm('/parties', {});
}

/* ── THE HONEST RESIDUAL. No directive — it compiles, and that is the point. ──
 *
 * No type-level scheme survives an annotated widening or a cast. Measured against
 * `wire()`, against a branded return and against `LeakFree` alike: all three are
 * green on these two lines. The wire golden is the ground truth for this, which is
 * why it drives every declared operation and reduces the response to a fingerprint
 * of key names — a key the contract never declared shows up there as a diff.
 *
 * If this line ever goes RED, the design has gained something no measurement here
 * found, and both the memo and the registry rows have to be rewritten.
 */
export const annotatedWideningIsGreen: HandlersOf<Api>['getParty'] = () => {
  const out: Party = wideRow; // assignability, not exactness
  return out;
};

/* ── THE HONEST WEAKNESS, asserted as a live type ───────────────────────── *
 *
 * `ParamsOf` erases every NON-PARAM segment, so renaming '/parties/:id' to
 * '/party/:id' produces an identical params type and compiles clean — MEASURED,
 * exit 0. What keeps a rename safe here is that `call()` takes an operation KEY
 * and never a path, so there is no second copy to drift; a screen that writes a
 * URL by hand is caught by `api:bound`, and a rename visible on the wire is
 * caught by `wire:frozen`.
 *
 * If this ever fails, the contract has GAINED whole-path binding and both the
 * memo and the registry rows have to be rewritten.
 */
export type SegmentRenameIsInvisibleToTypes = Expect<
  Equal<ParamsOf<'/parties/:id'>, ParamsOf<'/party/:id'>>
>;
