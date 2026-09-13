# Contract layer, second pass — design

**Date:** 2026-09-13
**Intent:** `docs/intent.md` — why this exists, what "simple" means here, and the success criteria.
**Supersedes:** the contract sections of `CLAUDE.md` as they stand at `c2e9886`. Every sentence this
design contradicts is listed in §8 with the correction.
**Status:** proposed. Nothing below is built.

> Governing rule, unchanged: a standard may propagate only as (a) something the deterministic
> scaffolder writes at t=0, or (b) a check that goes red. This document is neither. Every section
> below therefore names the type, check or scaffolder output that carries it, and **"prose" is
> written where a guarantee has no carrier** rather than quietly omitted.

---

## 1. Scope

In: all four phases of the fix list, **minus** `agency add endpoint` (deferred with reason —
`docs/intent.md` §4). Out: a library, a runtime dependency, codegen, a shared contracts package, a
`resource()` shorthand.

The work divides into four phases because the dependencies are real, not because four is tidy:
Phase 1 touches no shape and can land against today's tree; Phase 2 changes the literal both AST
checks parse, so everything that reads a registry moves in one commit; Phase 3 needs Phase 2's
`codes` object to enumerate refusals; Phase 4 builds on all of it.

---

## 2. The eight decisions

Each was contested between two independently-written proposals. Where they split, the losing
argument is recorded, because it is the one that comes back in six months.

### A. Exactness moves from the author to the binding point

Handlers end in `satisfies HandlersOf<Api>` and return plain values. `toRoutes` returns
`LeakFree<…>`, so a handler returning more than its operation declares is a compile error at
`export const routes` — one line, written by the scaffolder at t=0, never edited.

Measured on tsc 6.0.3: a wide row at top level, nested in `data[]`, and behind `async` are each red;
a `string` response and a `string[]` response stay green (the branded-return variant broke both);
the diagnostic names the operation. `too little` stays red in place, at the handler, via `satisfies`.

**The losing argument.** The competing proposal wanted *zero* mechanism: the template's store row
already **is** the wire type (`createStore<Party>`), so assert that once per resource with
`Expect<Equal<RowOf<store>, ResOf<Api,'getParty'>>>` and write a mapper only when a private field
appears. It is the simpler story and it is right that neither approach survives a cast. It loses
because `LeakFree` costs the author the same zero and covers strictly more: it catches a wide return
from *any* source, not only a widened store.

**The residual, which is real.** Nothing type-level survives an annotated widening or a cast:

```ts
// templates/mock/src/api/drift.controls.ts — NO @ts-expect-error. It compiles, and that is the point.
export const annotatedWideningIsGreen: HandlersOf<Api>['getParty'] = () => {
  const out: Party = wideRow;   // assignability, not exactness
  return out;                   // green under wire(), under a brand, and under LeakFree alike
};
```

This is why §4 makes the golden exhaustive rather than adding a sixth type mechanism.

### B. The adapter stops minting transport codes

`DomainError.code` becomes optional; `envelopeOf` writes `code` only when present, exactly as it
already handles `requestId`. The adapter's `NOT_FOUND`/`INTERNAL` and the router's `BAD_REQUEST` are
deleted. `codeOf` additionally filters at runtime against `api[key].codes`, so
`CodeOf<Api,K> | undefined` becomes true by construction rather than by discipline.

Both proposals reached this independently. The reference `AllExceptionsFilter` emits no `code` on
404/400/500, so **the mock is currently more informative than the product**: a screen branching on
`NOT_FOUND` works in the demo and silently stops working after conversion.

**The losing argument.** The research consensus was the opposite — declare
`TRANSPORT = { NOT_FOUND: 404, INTERNAL: 500, … }` once and make `codeOf` total, returning
`CodeOf<K> | TransportCode | 'UNKNOWN'`. It is more honest about what the wire can carry today. It
loses because it taxes every exhaustive screen branch with three codes the product never sends,
enshrining the divergence at each call site instead of removing it.

### C. One registry entry per operation; status lives on the code

`interface Io` folds into the entry through a curried phantom, and `codes` becomes an object.

```ts
getParty: op<void, Party>()({
  method: 'GET', path: '/parties/:id', status: 200, caps: [],
  codes: { PARTY_NOT_FOUND: 404 },
}),
```

Measured: with `<const S extends Spec>` the path survives as the literal `'/parties/:id'` with no
`as const`; `Object.keys` of an entry is unchanged at runtime (the phantom is type-only); `codes: {}`
yields `CodeOf = never`. `IO_COVERS_API`, `KEEP_AS_CONST`, `PathsAreLiterals` and `IoFor` all become
unnecessary — three tripwires deleted for one idiom learned. It also removes the measured
twelve-errors-from-one-missing-line cascade, because there is no second declaration to fall out of step.

Status on the code removes one hand-typed value per refusal, makes it impossible for two handlers to
disagree about a code's status (today `getParty` and `renameParty` each spell `404` by hand), and is
the `responses` column any Lane B OpenAPI emitter needs. oRPC, Effect and tRPC all converged on it.

**The losing argument.** The sibling `interface Io` reads as an OpenAPI table to the backend
developer who receives it, and SPEC calls that pair "the whole hand-off". That is a genuine
readability trade, and it is why this is Phase 2 rather than Phase 1: it is reversible and must not
put the correctness work at risk.

### D. Refusals keep throwing

`fail(key, code, message, ctx)` — the status now read from the registry. Unanimous. It is
byte-shaped like the product's own `reference/contract/intake-lines.ts` idiom, and the
never-narrowing rule that makes it work lives in four annotated consts at the bottom of a contract
file that no endpoint edit touches. Rules in `src/domain` stay pure
`{ code, message, ctx } | undefined` returns.

**The losing argument.** `return refuse(...)` narrows by ordinary control flow and would delete the
annotation rule entirely — but at one mechanical rewrite per refusal on conversion, to simplify a
rule the author never meets.

### E. `api:bound` — four changes

1. **Absence is red.** Push a problem instead of returning early; count only parsed registries; drop
   the `templates/mock` pre-guard. Accept the `call` import only when its specifier resolves to
   *this* mock's `src/api/contract`, closing the bare-specifier hoist.
2. **Raw transport becomes a type.** `httpClient` is exported as an opaque `Transport` that only
   `call()` unwraps, so `httpClient.get(…)` is TS2339 in every file the mock compiles. The
   `/httpClient|axios/i` clause is then **deleted, not weakened**: all 13 measured evasions are red
   elsewhere with a better message, and its two measured false reds (`httpClientCache.get`,
   `axiosLike.get`) disappear. `no-restricted-imports` (axios) and `no-restricted-globals` (fetch)
   join the existing pages/components override for the paths the type cannot see.
3. **The reach clause becomes a ratchet.** `unreached?: string` on the entry: not reached and no
   marker is red; marker present while the operation *is* reached is red as stale, exactly like
   `reportUnusedDisableDirectives`; an empty reason is red. Reachers widen from `src/pages` to any
   non-test, non-controls file under `src/`, fixing the measured false red on the hook layout
   `reference/bulletproof-react` recommends. This is a **stronger** check about a **smaller** claim —
   the current one is satisfied by a dead module.
4. **Drop `after: ['typecheck']`.** The row consumes no tsc output, and gating it hid the one
   fast-tier signal for an undeclared operation whenever anything in `packages/*` was red.

### F. The screen closes its own message table

`const SAYS = { … } satisfies Record<CodeOf<Api, K>, string>`. A declared code with no sentence is
TS2741 naming the code; a sentence for a code nothing declares is TS2353. One plain operator, and it
closes the only step in the endpoint path that nothing held. `makeQueries` is Phase 4.

### G. The golden becomes the instrument

Since no type closes the cast residual, the golden must — which means it has to cover refusals:

- A `REFUSALS` table, one drive per declared `(operation, code)`, asserting the `(status, code)`
  **pair** and fingerprinting the envelope into a `refusals` section.
- The exhaustiveness loop runs **at runtime** over `Object.keys(api[key].codes)`, so a cast in the
  table cannot evade it. The mapped type is for early naming only.
- `DRIVES` go through `call()` with typed keys, chained on an id captured from `create`, replacing
  raw verbs and the hard-coded `party-000001`. This is also the precondition for a live replay,
  since the product assigns UUIDs.

This replaces `contract:complete`'s literal clause as the proof that a code can actually be emitted —
measured, that clause stays green after every `fail()` for a code is deleted.

### H. `checks:bite` — the highest-leverage row on the list

A fast-tier row that derives a fixture from `templates/mock` at run time with exactly one planted
defect and requires exit 1 with an expected substring. Defects: contract deleted; a raw axios import
in a page; a handler removed; a declared code with no drive; a stale `unreached`; a tautological
`Equal<X,X>`; a reordered golden; a `},,` syntax error.

**Fourteen checks exist and none has ever been observed red.** That is the `dec === dec` failure one
level up, and `docs/SPEC.md` §17 names the operator disabling a row rather than fixing what it caught
as the signal to abandon the enforcement strategy — a check nobody has seen fail cannot even reach
that test.

---

## 3. The author-facing surface

Four things a person writes to add an endpoint. Everything else is generic or scaffolded.

### 3.1 The registry entry — `templates/mock/src/api/contract.ts`

```ts
import { makeContract, op, type AllResJsonSafe, type Contract, type Expect,
         type Paginated } from '@agency/mock';
import type { CreateParty, Overview, Party } from '../domain/types';

export const api = {
  overview:     op<void, Overview>()({ method: 'GET', path: '/overview', status: 200, caps: [], codes: {} }),
  listParties:  op<void, Paginated<Party>, { page?: string; limit?: string }>()({
                  method: 'GET', path: '/parties', status: 200, caps: [], codes: {} }),
  getParty:     op<void, Party>()({ method: 'GET', path: '/parties/:id', status: 200, caps: [],
                  codes: { PARTY_NOT_FOUND: 404 } }),
  createParty:  op<CreateParty, Party>()({ method: 'POST', path: '/parties', status: 201, caps: [],
                  codes: { PARTY_NAME_TAKEN: 409, PARTY_NAME_BLANK: 400, PARTY_BALANCE_INVALID: 400 } }),
  removeParty:  op<void, void>()({ method: 'DELETE', path: '/parties/:id', status: 204, caps: [],
                  codes: { PARTY_NOT_FOUND: 404 } }),

  /** Modelled from the transcript before its screen exists. Red the day a screen reaches it. */
  exportParties: op<void, string>()({ method: 'GET', path: '/parties/export', status: 200, caps: [],
                  codes: {}, unreached: 'CSV export lands with the reports screen' }),
};
/** No `as const`. `op`'s `<const S extends Spec>` preserves every literal — §2.C, measured. */
export type Api = typeof api;

/** The one remaining tripwire: every declared response is a shape JSON can carry. */
export type ResponsesAreWireShaped = Expect<AllResJsonSafe<Api>>;

const contract: Contract<Api> = makeContract<Api>(api);
export const call: Contract<Api>['call'] = contract.call;
export const fail: Contract<Api>['fail'] = contract.fail;     // annotated — this is what makes it narrow
export const codeOf: Contract<Api>['codeOf'] = contract.codeOf;
export const toRoutes: Contract<Api>['toRoutes'] = contract.toRoutes;
```

### 3.2 The handler — `templates/mock/src/api/routes.ts`

```ts
export function makeHandlers() {
  const parties = createStore<Party>('party', buildSeed());

  return {
    getParty: (c) => {
      const row = parties.get(c.params.id);
      if (!row) fail('getParty', 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
      return row;                       // a plain return — this body IS the Nest service body
    },

    createParty: (c) => {
      const blank = blankName(c.body.name);
      if (blank) fail('createParty', blank.code, blank.message, blank.ctx);
      return parties.create({ name: c.body.name, balance: asDecimal2(c.body.balance),
                              created_at: asInstant(c.now) });
    },
  } satisfies HandlersOf<Api>;          // NOT an annotation — an annotation widens H and the sink sees nothing
}

/** The check site. Scaffolder-written, never edited. A wide return is red HERE, naming the operation. */
export const routes: Route[] = toRoutes(makeHandlers());
```

`satisfies` rather than a return-type annotation is load-bearing and needs its own control
(`FactoryNotWidened`): with `makeHandlers(): HandlersOf<Api>`, `H` collapses to the declared type and
`LeakFree` has nothing left to compare.

### 3.3 The screen

```ts
const SAYS = {
  PARTY_NOT_FOUND: 'That party is no longer there. Reload the list.',
  PARTY_NAME_TAKEN: 'That name is already in the book.',
} satisfies Record<CodeOf<Api, 'getParty' | 'createParty'>, string>;

const code = codeOf('getParty', error);        // 'PARTY_NOT_FOUND' | undefined
const message = code === undefined ? messageOf(error) : SAYS[code];
```

`undefined` is not a mystery: it is what the product's filter sends for every transport failure and
every `ValidationPipe` 400. The envelope's own message is rendered — rendering is not branching, so
HARD RULE 5 holds.

### 3.4 The golden entry

One `DRIVES` chain step through `call()`, and one `REFUSALS` entry per declared code. Regenerate,
then **read the diff** — that step is the author's, and no check can do it for them.

---

## 4. The generic core — `packages/mock/src/contract.ts`

```ts
/* ── the registry entry, with types riding on it ─────────────────────────── */
export interface Spec {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly status: number;
  readonly caps: readonly string[];
  readonly codes: Readonly<Record<string, number>>;
  readonly unreached?: string;
}
export const op =
  <Req, Res, Qry = Record<string, never>>() =>
  <const S extends Spec>(spec: S): S & { readonly __io?: { req: Req; res: Res; qry: Qry } } => spec;

type IoOf<S> = S extends { readonly __io?: infer I } ? NonNullable<I> : never;
export type ReqOf<A, K extends keyof A> = IoOf<A[K]>['req'];
export type ResOf<A, K extends keyof A> = IoOf<A[K]>['res'];
export type QryOf<A, K extends keyof A> = IoOf<A[K]>['qry'];
export type CodeOf<A, K extends keyof A> = keyof A[K]['codes'] & string;

/* ── exactness, checked once, at the sink ────────────────────────────────── */
export type Leaks<A, H> = {
  [K in keyof A]: [ResOf<A, K>] extends [void] ? never
    : K extends keyof H
      ? (H[K] extends (c: never) => infer R
          ? ([Awaited<R>] extends [DeepExact<Awaited<R>, ResOf<A, K>>] ? never : K)
          : never)
      : never;
}[keyof A];

export type LeakFree<A, H, Ok> = [Leaks<A, H>] extends [never] ? Ok
  : { 'these handlers return keys the contract does not declare': Leaks<A, H> };

/* ── the opaque page-side client ─────────────────────────────────────────── */
declare const TRANSPORT: unique symbol;
export interface Transport { readonly [TRANSPORT]: true }   // `true`, not `unique symbol`:
                                                            // a unique symbol may only type a const
export const transport = (http: AxiosInstance): Transport => http as never;
/** Only `call()` unwraps it. A raw verb on a `Transport` is TS2339 in every file a mock compiles. */

```

`DeepExact` keeps a primitive guard — `[A] extends [string | number | boolean | null | undefined] ? A`
— so a branded `Decimal2` or `Instant` compares as itself instead of expanding into ~50
`String.prototype` members in every diagnostic. Measured: −38% instantiations at template size, and
it is the single biggest legibility problem in every leak error today.

Deleted from this file: `wire()`, `IoFor`, `IoSpec`, and the header notes claiming `NoInfer` is
load-bearing twice (measured false — stripping both occurrences leaves every diagnostic
byte-identical; the load-bearing token is the constraint `A extends Awaited<T>`, which gains its own
control).

**Contract surface after the change:**

| Export | Signature | Carried by |
|---|---|---|
| `call` | `(http: Transport, key: K, args: CallArgsOf<A,K>) => Promise<ResOf<A,K>>` | type |
| `fail` | `(key: K, code: CodeOf<A,K>, message: string, ctx?: object) => never` | type + annotated const |
| `codeOf` | `(key: K, error: unknown) => CodeOf<A,K> \| undefined` | type + runtime filter |
| `toRoutes` | `<H extends HandlersOf<A>>(h: H) => LeakFree<A, H, Route[]>` | type |
| `op` | `<Req,Res,Qry>() => <const S extends Spec>(s: S) => S & phantom` | type |
| `transport` | `(http: AxiosInstance) => Transport` | type |

---

## 5. Lane B — what conversion inherits

| Mock file | Becomes | Change needed |
|---|---|---|
| `src/api/contract.ts` | the hand-off document; `codes: { CODE: status }` is the `responses` column | none — it is read, not run |
| `src/api/routes.ts` handler bodies | Nest service methods | **none.** `return row` is already the service body once `wire()` is gone |
| `src/domain/rules.ts` | service-level guards | none — pure functions over row snapshots already |
| `fail(key, code, …)` | `throw new NotFoundException(…)` / `ConflictException(…)` | mechanical, one per refusal; the status is already on the code, so 404→`NotFoundException`, 409→`ConflictException` is a lookup |
| `packages/mock` store | a TypeORM repository | `store.list` returns `{ rows, total }` and the handler builds the envelope, so the body is a textual match for `findAndCount` → map → envelope |
| `wire.golden.json` + fingerprint | the product's `test/wire.e2e-spec.ts` under supertest | copy one JSON and ~45 lines; the product's CI then goes red when it serves a shape the sold demo did not |
| error envelope | the Nest filter's envelope | **none after §2.B** — that is the point of it |

---

## 6. Sequence

Each step is a red-first commit: the control or check is written and watched failing *for the stated
reason* before the implementation exists (HARD RULE 1).

**Phase 1 — stop the false greens** (no shape changes; lands against today's tree)
1. `checks:bite` row, with a fabricated-root test in `packages/cli/src/` so `test:parity` collects it.
2. Absence is red in both AST checks; `checked` counts parsed registries; `call` resolves to this mock.
3. `satisfies` + `LeakFree` at `toRoutes`; delete `wire()` and its six call sites; add the four
   negative controls and the live `annotatedWideningIsGreen`.
4. Opaque `Transport`; delete the regex clause; add the two oxlint entries.
5. Adapter and router stop minting codes; `codeOf` filters at runtime. **Six assertions change — §8.**
6. Delete the dead loop; anchor `handlersOf` on the annotated factory; drop `after: ['typecheck']`.
7. Memo corrections + `pnpm verify:write`.

**Phase 2 — shrink the shape** (all-or-nothing)
8. `codes: { CODE: status }`, `fail(key, code, …)`; both checks read object keys.
9. Fold `Io` into `op<…>()`; delete `IO_COVERS_API`, `KEEP_AS_CONST`, `PathsAreLiterals`, `IoFor`.
10. `unreached` ratchet; widen reachers beyond `src/pages`.
11. `SAYS … satisfies Record<CodeOf<…>, string>` in both template screens.

**Phase 3 — the golden becomes the instrument**
12. `DRIVES` through `call()`, chained on a captured id.
13. `REFUSALS` table + runtime exhaustiveness; narrow `contract:complete`'s literal clause.
14. Template tests and `tsc --noEmit` into the fast tier (**the approved `pnpm add`**: six root
    devDependencies plus `@agency/*` workspace links, with a range-parity assertion so the root and
    `package.json.hbs` cannot drift).
15. Codepoint comparator + ICU tripwire; `.verify` run-id nonce; `seam:settle` row.

**Phase 4 — capability**
16. `shape()` + `BodiesOf<Api>` on `makeContract(api, bodies)`, run in `toRoutes` before the handler,
    emitting the product's `ValidationPipe` bytes (`message: string[]`, no code). Today `{}` answers
    500 and a forged `id` is accepted with 201.
17. `makeQueries(contract, http) → { query, mutation, keyOf }`; `api:bound` learns the factory surface.
18. `AGENCY_LIVE_API` replay, SKIPPED when unset, with a one-entry `{ 'seq-id': ['uuid'] }`
    equivalence map. This makes SPEC §15's "exactly one migration mechanism" concrete — it is
    currently unbuilt.

---

## 7. Deliberately not built

| Rejected | Reason |
|---|---|
| Any contract library (ts-rest, oRPC, tRPC, Hono, Elysia, Zodios) | Runtime dependency plus a schema library §14 rejected; and **none refuses a wide row at the type level** — measured, their exactness is runtime stripping |
| `agency add endpoint` | ~1.3× line leverage by its own author's count — §14's rejection ratio. Its real value is the shared anchor module, which only pays after Phase 2. Revisit after the next real mock |
| `resource()` CRUD shorthand | yagoda's operations are bespoke; a shorthand over a one-entry-per-op registry is §14's manifest in a smaller coat |
| `TRANSPORT` union in `CodeOf` | Taxes every exhaustive screen branch with codes the product never sends |
| Branded `wire()` return | Measured to break `res: T[]` and primitive responses, and the symbol-brand variant is defeated by an ordinary spread |
| Checker-`Program` in `api:bound` | Once the receiver is an opaque type there is nothing left for a checker to resolve that the compiler has not already refused |
| `vitest --typecheck` / expect-type / tsd | A second tsc pass outside the `tsc -b` solution, defeating what `contract:controls` proves; and a sixth mechanism for no new guarantee |
| Stryker, per-mock | SPEC §5 and §14. `checks:bite` is the cheap form of the same question |

---

## 8. Existing assertions this design changes

HARD RULE 2 forbids weakening a check to go green. None of these is that — each is a check asserting
behaviour this design deliberately changes, and each becomes *more* specific. **Every one must be
named in the commit that makes it**, or this is indistinguishable from the move the rule forbids.

| File | Today | After | Why |
|---|---|---|---|
| `adapter.test.ts:104, :261` | `toMatchObject({ code: 'NOT_FOUND' })` | `toMatchObject({ statusCode: 404 })` + `not.toHaveProperty('code')` | the reference filter emits no code on 404 |
| `adapter.test.ts:192, :209` | `{ statusCode: 500, code: 'INTERNAL' }` | `{ statusCode: 500 }` + `not.toHaveProperty('code')` | the filter's non-HttpException path emits no code |
| `adapter.test.ts:422`, `router.test.ts:89` | `'BAD_REQUEST'` | status 400 + no code | express/Nest answer a malformed escape with no code |
| `errors.test.ts` + every `new DomainError(...)` | `code` required | `code` optional; envelope omits it when absent | §2.B |
| `contract.controls.ts`, `drift.controls.ts` | `leaksAPrivateField`, `leaksThroughTheListEnvelope` assert `wire()` bites **when called** | four `toRoutes`-sink controls + `FactoryNotWidened` + the live `annotatedWideningIsGreen` | `wire()` no longer exists; the positive-only assertion was the gap |
| `contract.test.ts` | `fail(key, status, code, …)` | `fail(key, code, …)` | §2.C |
| `store.test.ts` | `list()` returns the envelope | `list()` returns `{ rows, total }` | the handler builds the envelope, matching `findAndCount` |
| registry `proves`/`blindSpot` | four rows | rewritten + three rows added | `pnpm verify:write`, or `memo:drift` is red |

**CLAUDE.md sentences that become false and must be rewritten:** the `DeepExact`/"it is DEEP"
paragraph (exactness now lives at the sink, and the golden is named as ground truth for the
residual); the `NoInfer`-load-bearing-twice bullet (measured false); decision 4 (true only after
Phase 1 step 2); decision 5's "the only way to reintroduce it" (the type now holds it); and
`grep -c settle` moves from prose to a row.

---

## 9. Risks

1. **Phase 2 is all-or-nothing.** Template, both AST checks and both controls files move together.
   If it stalls halfway the tree is red in a way no single revert fixes. Mitigation: it is one commit,
   and Phase 1 is complete and green before it starts.
2. **`checks:bite` may find more than it fixes.** It is designed to make checks fail; if several fail
   for reasons unrelated to its fixtures, that is a finding, not a bug in the row — report it, do not
   soften the fixtures.
3. **The residual is permanent.** No phase closes the cast/annotated-widening hole. If a future reader
   takes `LeakFree` for a guarantee the way `DeepExact` was taken, the same error recurs one layer
   over. The live control and the rewritten memo paragraph are the only defences, and both are prose-
   adjacent. This is the weakest point in the design and is recorded as such.
4. **No coverage or mutation testing.** Every `proves` sentence written for the three new rows is an
   unverified claim in exactly the sense `checks:bite` exists to fix — including `checks:bite`'s own.
5. **The environment is broken right now.** Eight self-looped symlinks under `node_modules` make
   `pnpm verify` red for reasons unrelated to any file here. Phase 1 step 1 cannot be watched failing
   until `pnpm install --frozen-lockfile --offline` has run.

---

## 10. Done means

`docs/intent.md` §5 — nine criteria, all of which are checkable, none of which is "the author
remembers to". The one that matters most: **`checks:bite` exists and passes**, which is the first
time any check in this repository will have been observed going red.
