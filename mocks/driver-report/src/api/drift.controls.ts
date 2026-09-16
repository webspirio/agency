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
 * PORTED from the scaffold's `parties` domain to «Звіт водія», operation by
 * operation — getParty→getEvent, listParties→listEvents, createParty→submitEvent,
 * renameParty→confirmEvent. Each control still encodes the finding it was written
 * for; nothing here is a new opinion, and the one control with no analogue in this
 * registry is named as dropped rather than faked (see `ListIsAnEnvelope`).
 */
import type {
  CodeOf,
  Equal,
  Expect,
  HandlersOf,
  Paginated,
  ParamsOf,
  ReqOf,
  ResOf,
  Route,
  Transport,
} from '@agency/mock';
import { call, fail, toRoutes, type Api } from './contract';
import { httpClient } from './client';
import { makeHandlers } from './routes';
import type { DriverEvent, EventKind } from '../domain/types';

/* ── WHAT THE CONTRACT GUARANTEES, asserted positively ──────────────────── */

/** The path LITERAL produces the params — not a hand-written declaration. */
export type ParamsComeFromThePath = Expect<Equal<ParamsOf<Api['getEvent']['path']>, { id: string }>>;

/** Error codes are a closed union per operation, never bare `string`. */
export type CodesAreClosed = Expect<
  Equal<CodeOf<Api, 'getEvent'>, 'EVENT_NOT_FOUND'>
>;

/**
 * An operation that declares no codes may refuse with NOTHING — and `listEvents`
 * declaring none is a design decision rather than an oversight: the driver's queue
 * and the dispatcher's are one operation over one filtered table, and a list that
 * can refuse is a list a screen has to branch on.
 */
export type NoCodesMeansNever = Expect<Equal<CodeOf<Api, 'listEvents'>, never>>;

/**
 * The declared request body reaches the handler as a real type, not `unknown` —
 * and the UNION survives the trip. `kind` is a string on the wire and three
 * literals in the type, so a screen sending `'LOAD'` is a compile error at the
 * call site; the shape check in `contract.ts` deliberately cannot see that, which
 * is why the type has to.
 */
export type BodyIsTyped = Expect<Equal<ReqOf<Api, 'submitEvent'>['kind'], EventKind>>;

/**
 * REPLACES the scaffold's `DeleteReturnsNothing`, and the replacement is named
 * rather than silent: that control asserted `ResOf<…, 'removeParty'>` was `void`,
 * and this registry declares NO 204 operation at all — every write here answers
 * with the row it wrote, because a driver's phone and a dispatcher's queue both
 * re-render from the response instead of refetching. Inventing a 204 operation to
 * keep the control would be a control over a contract entry nothing serves.
 *
 * What is true here instead, and load-bearing: a list operation answers with HARD
 * RULE 5's envelope, never a bare array. A screen reading `data.length` off a
 * `DriverEvent[]` is a screen that silently shows one page and calls it the fleet.
 */
export type ListIsAnEnvelope = Expect<
  Equal<ResOf<Api, 'listEvents'>, Paginated<DriverEvent>>
>;

/** `op<void, …>()` really does declare "no body", so `call()` demands `undefined`. */
export type MeSendsNothing = Expect<Equal<ReqOf<Api, 'me'>, void>>;

/* ── WHAT IT REFUSES. Each line must stay an error. ─────────────────────── */

export function callRefusals(http: Transport): void {
  // @ts-expect-error the path declares ':id'; 'eventId' is not a param of it.
  void call(http, 'getEvent', { params: { eventId: 'x' }, body: undefined });

  // @ts-expect-error a declared param may not be omitted.
  void call(http, 'getEvent', { params: {}, body: undefined });

  // @ts-expect-error submitEvent declares a SubmitEvent body; 'title' is not a field of it.
  void call(http, 'submitEvent', { params: {}, body: { title: 'x' } });

  void call(http, 'submitEvent', {
    params: {},
    body: {
      kind: 'LOADING',
      truck_id: 'truck-000001',
      odometer_km: '412348',
      odometer_source: 'DRIVER_CONFIRMED',
      photo_kind: 'TTN',
      place: 'Елеватор, Вільнянськ',
      // @ts-expect-error occurred_at is server-derived and may not be sent — a
      // timestamp a client can name is a timestamp a client can forge. `id` and
      // `flags` are absent from SubmitEvent for the same reason: ids are
      // store-assigned (HARD RULE 4) and the flags are the office's verdict.
      //
      // NOTE WHERE THIS SITS, because it was measured the hard way: tsc reports
      // an object-literal error at the offending PROPERTY, not at the statement.
      // Written above `void call(...)` this directive suppressed nothing AND was
      // itself reported as TS2578 — the exact mechanic this file's header warns
      // about, got wrong three lines below the warning.
      occurred_at: 'now',
    },
  });

  // @ts-expect-error listEvents declares page/limit/pending and nothing else — the qry slot is closed.
  void call(http, 'listEvents', { params: {}, body: undefined, qry: { sort: 'occurred_at' } });

  // @ts-expect-error a query value is a WIRE string, never a number.
  void call(http, 'listEvents', { params: {}, body: undefined, qry: { page: 1 } });

  /* A name no registry will ever declare, DELIBERATELY. An earlier draft used
     'archiveParty', which is a perfectly plausible endpoint — declare it and this
     directive stops suppressing anything, so the author's first act on a new
     endpoint is an unrelated red in a file they did not touch. A control should
     never be an ambush, and this domain has obvious next endpoints (voidEvent,
     listTrucks) that must stay free to be written. */
  // @ts-expect-error there is no such operation in the contract.
  void call(http, '__no_such_operation__', { params: { id: 'e1' }, body: undefined });
}

export function codeRefusals(): void {
  // @ts-expect-error TTN_BLANK is confirmEvent's code, not one getEvent declares.
  fail('getEvent', 'TTN_BLANK', 'no');

  // @ts-expect-error an undeclared code — the graft that turns inert `codes` into a mechanism.
  fail('getEvent', 'EVENT_NOT_FOND', 'no');

  // @ts-expect-error listEvents declares NO codes, so every code is refused here.
  fail('listEvents', 'ANYTHING', 'no');
}

/** A handler must return everything the contract declares. */
// @ts-expect-error this one returns only `id`.
export const handlerReturnsTooLittle: HandlersOf<Api>['getEvent'] = () => ({ id: 'event-000001' });

/* ── THE SCREEN'S MESSAGE TABLE IS CLOSED ───────────────────────────────── *
 *
 * `SAYS` was `Record<string, string>`, so a declared code with no sentence was
 * invisible and a sentence for a code nothing declares was invisible. One plain
 * operator closes both directions, and it is the only step in the endpoint path
 * that nothing held.
 *
 * `confirmEvent` is the operation used here because it declares FOUR codes — the
 * most in this registry, and the one table a dispatcher actually reads.
 */

/** A declared code with no sentence is TS2741, naming the code. */
export const missingSentence = {
  EVENT_NOT_FOUND: 'Такої події немає',
  EVENT_ALREADY_CONFIRMED: 'Цю подію вже підтвердили',
  TTN_BLANK: 'Номер ТТН порожній',
  // @ts-expect-error confirmEvent also declares TTN_DUPLICATE, which has no sentence here.
} satisfies Record<CodeOf<Api, 'confirmEvent'>, string>;

/** A sentence for a code the operation does not declare is TS2353, naming the key. */
export const strangeSentence = {
  EVENT_NOT_FOUND: 'Такої події немає',
  // @ts-expect-error getEvent declares only EVENT_NOT_FOUND.
  EVENT_ON_FIRE: 'oh no',
} satisfies Record<CodeOf<Api, 'getEvent'>, string>;

/**
 * An operation that declares no codes has NO sentences to write, and the type says
 * so rather than a comment: `Record<never, string>` is `{}`. That is why the
 * dispatcher's overview strip carries no message table.
 */
export type OverviewHasNoCodesToSay = Expect<Equal<CodeOf<Api, 'overview'>, never>>;

/* ── EXACTNESS: a wider row may not reach the client ────────────────────── *
 *
 * The check is at the SINK — `toRoutes` — not at each return. MEASURED 2026-09-13:
 * the `wire()` call this replaces was OPT-IN, and `getParty: () => storedWideRow`
 * compiled clean against the real `HandlersOf` in the exact shape routes.ts uses,
 * because excess-property checking never fires on a contextually typed arrow's
 * return. Asserting that `wire()` bit WHEN CALLED was the positive direction only.
 *
 * `internal_note` is the honest version of the hazard here: the stored event row is
 * where an office-only annotation would land, and `getEvent` is reachable by a
 * dispatcher's browser — so a leak is a real field reaching a real screen, not a
 * hypothetical one.
 */

type StoredEvent = DriverEvent & { internal_note: string };
declare const wideRow: StoredEvent;
declare const narrowRow: DriverEvent;

export function sinkRefusesALeak(): void {
  // @ts-expect-error the row carries `internal_note`, which getEvent does not declare.
  const table: Route[] = toRoutes({ ...makeHandlers(), getEvent: () => wideRow });
  void table;
}

/* ── A SECOND RESIDUAL. No directive — it compiles, and that is the point. ───
 *
 * The shape a capability check takes: one branch returns the wide row, the other the
 * declared one — and this mock has exactly that shape available, because `caps` here
 * are load-bearing and `c.actor.role` is `driver` or `dispatcher` rather than a
 * decoration. MEASURED 2026-09-13: TypeScript SUBTYPE-REDUCES `StoredEvent |
 * DriverEvent` to `DriverEvent` at inference, because StoredEvent is a subtype of
 * DriverEvent — so no union ever reaches the exactness check and the handler's return
 * type is `DriverEvent` however it is examined. An adversarial review reported this as
 * a union hole in the check; the union hole was real and is fixed, but it is not what
 * makes THIS green, and no type-level scheme closes it.
 *
 * The wire golden is the ground truth here as it is for `annotatedWideningIsGreen` —
 * with the same limit: it drives each operation once, with one actor, so it fingerprints
 * whichever branch that actor takes.
 */
export const subtypeReducedBranchIsGreen: Route[] = toRoutes({
  ...makeHandlers(),
  getEvent: (c) => (c.actor.role === 'dispatcher' ? wideRow : narrowRow),
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
  void httpClient.get('/events');

  // @ts-expect-error the instance itself is not callable either.
  void httpClient({ url: '/events' });

  // @ts-expect-error a verb the old RAW_HTTP set never listed is refused by the same mechanism.
  void httpClient.postForm('/events', {});
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
export const annotatedWideningIsGreen: HandlersOf<Api>['getEvent'] = () => {
  const out: DriverEvent = wideRow; // assignability, not exactness
  return out;
};

/* ── THE HONEST WEAKNESS, asserted as a live type ───────────────────────── *
 *
 * `ParamsOf` erases every NON-PARAM segment, so renaming '/events/:id' to
 * '/event/:id' produces an identical params type and compiles clean — MEASURED,
 * exit 0. What keeps a rename safe here is that `call()` takes an operation KEY
 * and never a path, so there is no second copy to drift; a screen that writes a
 * URL by hand is caught by `api:bound`, and a rename visible on the wire is
 * caught by `wire:frozen`.
 *
 * If this ever fails, the contract has GAINED whole-path binding and both the
 * memo and the registry rows have to be rewritten.
 */
export type SegmentRenameIsInvisibleToTypes = Expect<
  Equal<ParamsOf<'/events/:id'>, ParamsOf<'/event/:id'>>
>;
