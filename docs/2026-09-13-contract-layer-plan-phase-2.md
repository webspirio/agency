# Contract Layer Phase 2 — Shrink the Shape — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One registry entry per operation — request, response and query types ride on the entry through a curried phantom, `codes` carries each code's status — so an author holds fewer concepts and there is no second declaration to fall out of step.

**Architecture:** `interface Io` disappears into `op<Req, Res, Qry>()({ … })`, a curried identity function whose `<const S extends Spec>` preserves every literal without `as const`. `codes` becomes `{ CODE: status }`, so `fail(key, code, message, ctx)` reads the status from the registry and two handlers can no longer disagree about a code's status. Three tripwires are deleted because they have nothing left to compare; a fourth is **kept** against the design's own recommendation, because it was measured to be the only registry-local detector of a forgotten `op()`.

**Tech Stack:** TypeScript 6.0.3 (`tsc -b --force`), node 24 (`.nvmrc`), pnpm workspaces, vitest 4 (node + dom projects), oxlint 1.82 with a custom JS plugin, axios 1.20 custom adapter.

**Spec:** `docs/2026-09-13-contract-layer-design.md` — §2.C (one entry per operation), §2.E.3 (the `unreached` ratchet), §2.F (the screen's message table), §3.1 (the author-facing registry), §4 (the generic core), §6 steps 8–11, §8 (every assertion this changes).

**Intent:** `docs/intent.md` — why, and the nine success criteria.

**Measurements this plan is built on:** three independent probes against the post-Phase-1 tree, each re-run by a second agent told to refute it, all three CONFIRMED. Their findings are quoted inline where they contradict the design; `docs/BUILD-REPORT.md` records Phase 1's own results.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `CLAUDE.md`.

- **Node:** the interpreter must satisfy `.nvmrc` (major **24**). The shell default here is node 22. For a manual run: `export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH`.
- **TDD, always.** Failing test, run it, watch it fail *for the stated reason*, then implement. If you cannot quote the red output, you did not watch it.
- **Never weaken a check to go green.** No editing a rule, no ignore, no `it.skip`. If a check is genuinely wrong, say so in your report and leave it failing.
- **No new dependencies of any kind.** This plan adds none.
- **Money is decimal strings.** `packages/dec/src/dec.ts` is the only module allowed to do the arithmetic.
- **Ids are `seq()` or a ULID, store-assigned.** Never `Math.random()`.
- **Branch on `code` only.** Pagination is `{ data, total, page, limit }`.
- **`reference/` is read-only.**
- **Never `git reset --hard`, `git clean`, or `git checkout .`.** Commit with an explicit pathspec: `git add <paths> && git commit -F - -- <paths>`.
- **An oxlint exemption goes on the line it excuses**, never the file.
- **After editing `scripts/verify/registry.mjs`, run `pnpm verify:write`** or `memo:drift` goes red.
- **`pnpm verify` must be green before a turn ends.** `.claude/hooks/stop-gate.mjs` blocks on red.
- **Report the status you got**, one of `PASSED` / `FAILED` / `SKIPPED` / `NOT_RUN` / `UNRUNNABLE`.

## Precondition

```bash
export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH
node -v            # v24.x
pnpm verify        # must be 13 PASSED, not narrowed
pnpm verify:full   # must be 16 PASSED, not narrowed
```

If either is not green, stop and report which of the five statuses you got.

## The risk this plan is shaped around

Phase 2 is **all-or-nothing**: `templates/mock`, `packages/mock`, both AST checks and both controls files move together. Measured, and this is the part that matters:

> The commit's real risk is NOT the loud `interface Io` red. `contract-complete.mjs`'s `codes` reader breaks **silently** — the Phase 2 initializer is a `CallExpression`, `ts.isObjectLiteralExpression(op.initializer)` is false, the loop body never runs, `codes[key]` stays `[]`, and the code-reachability clause goes vacuous while the success line still claims "a literal site for every declared code". Measured green with an unemittable code declared.

So Task 5 is written **check-first**: a `checks:bite` fixture that plants an unemittable code and demands a red is written and watched failing *before* the reader is ported. That fixture is the only thing standing between this commit and a check that silently stops checking.

---

### Task 1: The registry entry carries its own types

**Files:**
- Modify: `packages/mock/src/contract.ts` — `OperationSpec`/`ApiSpec` (lines 61–72), add `Spec`, `op`, `IoOf`, `ReqOf`, `ResOf`, `QryOf`; `CodeOf` (line 107); delete `IoSpec`, `IoFor`
- Modify: `packages/mock/src/contract.controls.ts` — the fixture registry and every `<Api, Io>` application
- Test: `packages/mock/src/contract.controls.ts` is the test; it is compiled by `pnpm typecheck`

**Interfaces:**
- Produces: `Spec`, `op<Req, Res, Qry = Record<string, never>>() => <const S extends Spec>(spec: S) => S & { readonly __io?: { req: Req; res: Res; qry: Qry } }`
- Produces: `ReqOf<A, K>`, `ResOf<A, K>`, `QryOf<A, K>`, `CodeOf<A, K>`, all taking `A extends ApiSpec`
- Produces: `ApiSpec = Record<string, Spec>`
- Removes: `IoSpec`, `IoFor`, `OperationSpec`
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing controls**

At the top of `packages/mock/src/contract.controls.ts`, replace the fixture registry and `interface Io` with the folded form, and add the literal assertions. Delete `IoCoversApi` (there is nothing left to cover).

```ts
const api = {
  listParties: op<void, Paginated<Party>, { page?: string; limit?: string }>()({
    method: 'GET', path: '/parties', status: 200, caps: [], codes: {},
  }),
  getParty: op<void, Party>()({
    method: 'GET', path: '/parties/:id', status: 200, caps: [],
    codes: { PARTY_NOT_FOUND: 404 },
  }),
  createParty: op<{ name: string }, Party>()({
    method: 'POST', path: '/parties', status: 201, caps: ['crm'],
    codes: { PARTY_NAME_TAKEN: 409 },
  }),
  removeParty: op<void, void>()({
    method: 'DELETE', path: '/parties/:id', status: 204, caps: ['crm'],
    codes: { PARTY_NOT_FOUND: 404 },
  }),
};
/** No `as const`. `op`'s `<const S extends Spec>` preserves every literal — measured. */
type Api = typeof api;
```

Then add these assertions. **Every one was measured true on 2026-09-13 against a probe of exactly this shape**, so any red here is a real divergence, not an expected one:

```ts
/* ── THE LITERALS SURVIVE WITHOUT `as const` ────────────────────────────── */

export type PathIsTheLiteral = Expect<Equal<Api['getParty']['path'], '/parties/:id'>>;
/** The NEGATIVE too: a positive alone is satisfied by `string` degenerating. */
export type PathIsNotString = Expect<Equal<Equal<Api['getParty']['path'], string>, false>>;
export type StatusIsTheLiteral = Expect<Equal<Api['createParty']['status'], 201>>;
export type StatusIsNotNumber = Expect<Equal<Equal<Api['getParty']['status'], number>, false>>;
export type MethodIsTheLiteral = Expect<Equal<Api['createParty']['method'], 'POST'>>;
export type CapsIsATuple = Expect<Equal<Api['getParty']['caps'], readonly []>>;

/* ── THE PHANTOM RESOLVES, THROUGH AN OPTIONAL PROPERTY ─────────────────── */

export type ResIsTheDeclaredType = Expect<Equal<ResOf<Api, 'getParty'>, Party>>;
export type ResIsVoidForA204 = Expect<Equal<ResOf<Api, 'removeParty'>, void>>;
export type ResIsTheEnvelope = Expect<Equal<ResOf<Api, 'listParties'>, Paginated<Party>>>;
export type ReqIsTheDeclaredBody = Expect<Equal<ReqOf<Api, 'createParty'>, { name: string }>>;
export type ReqIsVoidForAGet = Expect<Equal<ReqOf<Api, 'getParty'>, void>>;
export type QryIsDeclared = Expect<Equal<QryOf<Api, 'listParties'>, { page?: string; limit?: string }>>;
/** The DEFAULT closes the slot `interface Io` used to declare by hand. */
export type QryDefaultsClosed = Expect<Equal<QryOf<Api, 'getParty'>, Record<string, never>>>;

/* ── NOTHING IS GREEN BY DEGENERATION ───────────────────────────────────── */

export type ResIsNotUnknown = Expect<Equal<Equal<ResOf<Api, 'getParty'>, unknown>, false>>;
export type ResIsNotNever = Expect<Equal<Equal<ResOf<Api, 'getParty'>, never>, false>>;
```

Update every remaining `<Api, Io>` in the file to `<Api>`: `HandlersOf<Api, Io>` → `HandlersOf<Api>`, `Leaks<Api, Io, H>` → `Leaks<Api, H>`, `CallArgsOf<Api, Io, K>` → `CallArgsOf<Api, K>`, `Contract<Api, Io>` → `Contract<Api>`, `makeContract<Api, Io>(api)` → `makeContract<Api>(api)`, `AllResJsonSafe<Api, Io>` → `AllResJsonSafe<Api>`.

- [ ] **Step 2: Run typecheck and watch it fail for the stated reason**

```bash
export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH
pnpm typecheck
```

Expected: FAIL with `TS2304: Cannot find name 'op'` and `TS2304: Cannot find name 'ResOf'` (and `ReqOf`, `QryOf`), plus arity errors `TS2707: Generic type 'HandlersOf<A, I>' requires 2 type argument(s)`. That is the correct red: none of the new surface exists yet. Quote at least the `op` and the arity error.

- [ ] **Step 3: Implement the entry shape**

In `packages/mock/src/contract.ts`, replace `OperationSpec`, `ApiSpec`, `IoSpec` and `IoFor` (lines 61–83) with:

```ts
/* ── what a registry entry is ──────────────────────────────────────────── */

/**
 * A query as it travels on the wire: strings, or repeated keys as arrays. Never
 * a number — `?page=1` is the string '1' on both sides of the seam.
 */
export type QuerySpec = Record<string, string | string[] | undefined>;

export type Spec = {
  readonly method: Method;
  /** Express-style, e.g. '/parties/:id'. A LITERAL — `op`'s `<const S>` keeps it one. */
  readonly path: string;
  readonly status: number;
  readonly caps: readonly string[];
  /**
   * The closed set this operation may refuse with, each code mapped to the STATUS
   * it answers. `{}` means it never refuses. The status lives here rather than at
   * each `fail()` site so two handlers cannot disagree about one code — today
   * `getParty` and `renameParty` each spell `404` by hand.
   */
  readonly codes: Readonly<Record<string, number>>;
  /**
   * Why this operation has no screen yet. Present and unreached is green; present
   * and REACHED is red as stale, exactly as `reportUnusedDisableDirectives` is.
   */
  readonly unreached?: string;
};

export type ApiSpec = Record<string, Spec>;

/**
 * CURRIED, and the currying is the whole trick: the first call takes the types
 * EXPLICITLY, the second infers the spec. One call taking both would force the
 * author to spell the spec's type as well, which is the descriptor cost SPEC 14
 * rejected.
 *
 * `<const S extends Spec>` is what preserves `'/parties/:id'`, `200` and `'POST'`
 * as literals with NO `as const` on the registry object — measured on tsc 6.0.3.
 * Drop the `const` modifier and every path widens to `string`; `PathsAreLiterals`
 * below is what catches that.
 *
 * `__io` is OPTIONAL and type-only: measured, `'__io' in entry` is false at
 * runtime, `Object.keys` is unchanged, and declaration order is preserved — which
 * matters because declaration order IS the route table's order.
 */
export const op =
  <Req, Res, Qry extends QuerySpec = Record<string, never>>() =>
  <const S extends Spec>(spec: S): S & { readonly __io?: { req: Req; res: Res; qry: Qry } } =>
    spec;

/**
 * `IoOf<Bare>` is `never` for an entry written without `op()`, and
 * `never extends { res: infer R }` is TRUE with `R` inferred as `unknown` — so a
 * forgotten `op()` yields `unknown`, which `AllResJsonSafe` and `Leaks` both refuse.
 *
 * That is deliberate and it is the cheap remedy. MEASURED 2026-09-13: the
 * alternative spelling — intersecting a slot type to make `IoOf` indexable — yields
 * `never` instead, `IsJsonSafe<never>` is `true`, `[never] extends [void]` takes the
 * void branch, and BOTH tripwires go blind. The only remaining signal there was a
 * `TS2739 … Promise<never>` at the handler, in another file, naming neither the
 * operation nor the missing `op()`.
 */
type IoOf<S> = S extends { readonly __io?: infer I } ? NonNullable<I> : never;

export type ReqOf<A extends ApiSpec, K extends keyof A> =
  IoOf<A[K]> extends { req: infer R } ? R : never;
export type ResOf<A extends ApiSpec, K extends keyof A> =
  IoOf<A[K]> extends { res: infer R } ? R : never;
export type QryOf<A extends ApiSpec, K extends keyof A> =
  IoOf<A[K]> extends { qry: infer Q } ? Q : never;

/**
 * KEPT, against design §2.C's "PathsAreLiterals becomes unnecessary".
 *
 * MEASURED: restated over the new entry shape it still holds on a real registry and
 * still goes to `never` on three separate widenings — a `string`-typed variable,
 * `as string`, and `as Spec` — and on an entry written without `op()`. It is the
 * only REGISTRY-LOCAL detector of the forgotten-`op()` mistake; everything else
 * about that mistake surfaces in another file. What genuinely became unnecessary is
 * the `as const` it was named for, so the name moves with the mechanism.
 */
export type PathsAreLiterals<A extends ApiSpec> =
  string extends A[keyof A]['path'] ? never : true;
```

Change `CodeOf` (line 107):

```ts
/** The closed code set of one operation — the KEYS of its `codes` object. */
export type CodeOf<A extends ApiSpec, K extends keyof A> = keyof A[K]['codes'] & string;

/** The status an operation answers a given code with, read off the registry. */
export type StatusOf<A extends ApiSpec, K extends keyof A> = A[K]['codes'][CodeOf<A, K>];
```

Then drop the `I` parameter from every type in the file: `AllResJsonSafe<A, I>` → `AllResJsonSafe<A>` (its body becomes `{ [K in keyof A]: IsJsonSafe<ResOf<A, K>> }`), `Leaks<A, I, H>` → `Leaks<A, H>` (body reads `ResOf<A, K>` in place of `I[K]['res']`), `LeakFree<A, I, H, Ok>` → `LeakFree<A, H, Ok>`, `HandlerCtxOf<A, I, K>` → `HandlerCtxOf<A, K>` (body reads `ReqOf<A, K>`), `HandlersOf<A, I>` → `HandlersOf<A>`, `CallArgsOf<A, I, K>` → `CallArgsOf<A, K>` (body reads `ReqOf`/`QryOf`), `Contract<A, I>` → `Contract<A>`, `makeContract<A extends ApiSpec, I extends IoFor<A>>` → `makeContract<A extends ApiSpec>`.

Inside `makeContract`, `const op = api[key] as OperationSpec` shadows the new exported `op`. Rename the local to `entry`:

```ts
      const entry = api[key] as Spec;
```

at both sites (`call` and `toRoutes`).

- [ ] **Step 4: Run typecheck and watch it pass**

```bash
pnpm typecheck
```

Expected: PASSED. If `ResIsNotUnknown` or `ResIsNotNever` is red, the phantom is not resolving and the whole fold is unsound — stop and report rather than adjusting the assertion.

- [ ] **Step 5: Prove the `const` modifier is load-bearing**

Measured 2026-09-13: dropping it widens every path and ONLY `PathsAreLiterals`/`PathIsTheLiteral`/`ParamsComeFromThePath` go red. Reproduce it, so the claim in the comment you just wrote is yours:

```bash
cp packages/mock/src/contract.ts /tmp/contract.bak
perl -pi -e 's/<const S extends Spec>/<S extends Spec>/' packages/mock/src/contract.ts
pnpm typecheck    # must FAIL, naming PathIsTheLiteral and PathsAreLiterals
cp /tmp/contract.bak packages/mock/src/contract.ts
pnpm typecheck    # must PASS again
```

Quote the failure. If it does NOT fail, `<const S>` is not doing what the comment claims and the comment must be rewritten to say what is actually true.

- [ ] **Step 6: Run the tier**

```bash
pnpm verify
```

Expected: FAILED on `test` and `contract:complete` — `packages/mock/src/contract.test.ts` and the template still use the old shape, and they are Tasks 2–5. Record which rows are red so the next tasks can be checked against the list. Do **not** commit a red tree; this task's commit comes after Task 2.

---

### Task 2: `codes` carries the status, and `fail` stops taking one

**Files:**
- Modify: `packages/mock/src/contract.ts` — the `Contract` type's `fail` signature, and `makeContract`'s `fail` implementation
- Modify: `packages/mock/src/contract.test.ts` — the fixture registry, `makeHandlers`, and every `fail(...)` call
- Modify: `packages/mock/src/contract.controls.ts` — `codeRefusals`

**Interfaces:**
- Consumes: `Spec`, `op`, `CodeOf`, `StatusOf` from Task 1.
- Produces: `fail<K extends keyof A>(key: K, code: CodeOf<A, K>, message: string | string[], ctx?: Record<string, unknown>): never`

- [ ] **Step 1: Write the failing test**

In `packages/mock/src/contract.test.ts`, add:

```ts
describe('fail reads the status off the registry, so two handlers cannot disagree', () => {
  it('answers a declared code with the status its registry entry names', async () => {
    const err = await rejection(() =>
      call(client(), 'getParty', { params: { id: 'party-999999' }, body: undefined }),
    );
    // 404 appears ONCE in the whole mock now — on the code, in the registry.
    expect(err.response?.status).toBe(404);
    expect(codeOf('getParty', err)).toBe('PARTY_NOT_FOUND');
  });

  it('answers a 409 code with 409, from the same mechanism', async () => {
    const c = client();
    await call(c, 'createParty', { params: {}, body: { name: 'Zed', balance: '1.00' } });
    const err = await rejection(() =>
      call(c, 'createParty', { params: {}, body: { name: 'Zed', balance: '1.00' } }),
    );
    expect(err.response?.status).toBe(409);
    expect(codeOf('createParty', err)).toBe('PARTY_NAME_TAKEN');
  });
});
```

`rejection` already exists in that file (added in Phase 1, Task 6) — reuse it, do not redefine it.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec vitest run packages/mock/src/contract.test.ts
```

Expected: FAIL — the file does not compile, because its fixture registry still uses `codes: [...]` arrays and `interface Io`. The error names `Io` or `codes`. Quote it.

- [ ] **Step 3: Change the `fail` signature and implementation**

In `packages/mock/src/contract.ts`, in the `Contract<A>` type:

```ts
  /**
   * NO `status` PARAMETER. It is read from the registry entry's `codes` object, so
   * one code answers one status everywhere — `getParty` and `renameParty` each spelled
   * `404` by hand before this, and nothing compared them.
   */
  fail<K extends keyof A>(
    key: K,
    code: CodeOf<A, K>,
    message: string | string[],
    ctx?: Record<string, unknown>,
  ): never;
```

and in `makeContract`:

```ts
    fail(key, code, message, ctx) {
      const entry = api[key] as Spec;
      const status = entry.codes[code as string];
      if (status === undefined) {
        // Unreachable through the type, reachable through a cast. A thrown Error is
        // better than a 500 whose envelope says nothing about why.
        throw new Error(
          `fail(${String(key)}): the code '${String(code)}' is not in that operation's ` +
            `registry entry, so there is no status to answer with`,
        );
      }
      // String(code): the closed set is a TYPE-level guarantee; DomainError carries
      // the plain string the envelope puts on the wire.
      throw new DomainError(status, String(code), message, ctx);
    },
```

- [ ] **Step 4: Port the test fixture and its handlers**

In `packages/mock/src/contract.test.ts`, rewrite the fixture registry in the folded form (same shape as Task 1's controls fixture, with this file's own `Party` and operations), delete `interface Io`, change `makeContract<Api, Io>(api)` to `makeContract<Api>(api)` and every `Contract<Api, Io>['x']` to `Contract<Api>['x']`, change the `satisfies HandlersOf<Api, Io>` to `satisfies HandlersOf<Api>`, and drop the status argument from all seven `fail(...)` calls:

```ts
      if (!row) fail('getParty', 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
```

In `packages/mock/src/contract.controls.ts`, `codeRefusals` loses its status argument too:

```ts
export function codeRefusals(): void {
  // @ts-expect-error PARTY_NAME_TAKEN is not in getParty's declared code set.
  fail('getParty', 'PARTY_NAME_TAKEN', 'no');

  // @ts-expect-error an undeclared code. THE graft that turns an inert `codes` into a mechanism.
  fail('getParty', 'PARTY_MISSPELLED', 'no');

  // @ts-expect-error listParties declares NO codes, so every code is refused here.
  fail('listParties', 'ANYTHING', 'no');
}
```

Measured: losing `status` costs these three nothing — each stays `TS2345` naming the code, at argument 2 instead of 3.

- [ ] **Step 5: Run the test and watch it pass**

```bash
pnpm exec vitest run packages/mock/src/contract.test.ts
pnpm typecheck
```

Expected: both PASS.

- [ ] **Step 6: Commit Tasks 1 and 2 together**

They are one change to one module's surface; neither compiles without the other.

```bash
git add packages/mock/src/contract.ts packages/mock/src/contract.controls.ts packages/mock/src/contract.test.ts
git commit -F - -- packages/mock/src/contract.ts packages/mock/src/contract.controls.ts packages/mock/src/contract.test.ts <<'MSG'
feat(contract): the registry entry carries its own types and statuses

`interface Io` folds into the entry through a curried `op<Req, Res, Qry>()`
phantom, and `codes` becomes `{ CODE: status }`. One declaration per operation
instead of two that have to agree.

MEASURED on tsc 6.0.3, with NO `as const` on the registry: path, status, method
and caps all survive as literals; the phantom resolves through the OPTIONAL
`__io?`; `codes: {}` is genuinely `never`; and `'__io' in entry` is false at
runtime, so declaration order — which IS the route table's order — is unchanged.

`fail` loses its `status` argument and reads it off the code. 404 appeared four
times by hand before this and nothing compared them.

ReqOf/ResOf/QryOf use the `extends { res: infer R }` spelling deliberately: an
entry written without `op()` then yields `unknown`, which AllResJsonSafe and Leaks
both refuse. The obvious alternative yields `never`, which BOTH tripwires accept —
measured — leaving a TS2739 about `Promise<never>` in another file as the only
signal.

PathsAreLiterals is KEPT, against the design's own recommendation. Measured: it is
the only registry-local detector of a forgotten `op()`, and it still goes to
`never` on a string-typed path, an `as string` and an `as Spec`. What became
unnecessary is the `as const` it was named for.

CHECK CHANGES (HARD RULE 2 disclosure): IoCoversApi is deleted — there is no
second declaration left for it to compare. codeRefusals loses its status argument;
each of its three directives stays TS2345 naming the code, at argument 2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

The tree is still red at this point (the template has not moved). Say so in your report; do not run `pnpm verify` expecting green.

---

### Task 3: The template's registry folds

**Files:**
- Modify: `templates/mock/src/api/contract.ts` — the whole file
- Modify: `templates/mock/src/api/routes.ts` — the `satisfies` clause and six `fail(...)` calls
- Modify: `templates/mock/src/api/drift.controls.ts` — every `<Api, Io>` and `codeRefusals`
- Modify: `templates/mock/src/api/wire.golden.helpers.ts` and `wire.golden.test.ts` — if either names `Io`

**Interfaces:**
- Consumes: `op`, `Spec`, `CodeOf`, `ResOf` from Task 1; the status-less `fail` from Task 2.
- Produces: `templates/mock/src/api/contract.ts` exports `api`, `Api`, `call`, `fail`, `codeOf`, `toRoutes` and `RESPONSES_ARE_WIRE_SHAPED`; it no longer exports `Io`, `IO_COVERS_API`.

- [ ] **Step 1: Rewrite the template registry**

Replace `templates/mock/src/api/contract.ts` lines 21–123 with:

```ts
import {
  makeContract,
  op,
  type AllResJsonSafe,
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
 * ONE ENTRY PER OPERATION. The request, response and query types ride on the
 * entry through `op<Req, Res, Qry>()`; there is no sibling type map to fall out
 * of step with. `codes` maps each code to the STATUS it answers, so `fail()`
 * needs no status argument and two handlers cannot disagree about one code.
 */
export const api = {
  overview: op<void, Overview>()({
    method: 'GET', path: '/overview', status: 200, caps: [], codes: {},
  }),
  listParties: op<void, Paginated<Party>, { page?: string; limit?: string }>()({
    method: 'GET', path: '/parties', status: 200, caps: [], codes: {},
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

/** NO `as const`. `op`'s `<const S extends Spec>` preserves every literal — measured. */
export type Api = typeof api;

/* ── the two tripwires, each a compile error rather than a convention ────── */

/**
 * Every path is still a LITERAL. It reads as a leftover now that there is no
 * `as const` to delete, and it is not: it is the only check INSIDE this file that
 * an entry was written with `op<…>()` at all. Forget the wrapper and the path
 * widens to `string`, `ParamsOf` evaporates, and every other symptom surfaces in
 * a different file.
 */
export const KEEP_LITERAL: PathsAreLiterals<Api> = true;

/**
 * Every declared response is a shape JSON can actually carry. A `Date`, a `Map`,
 * or a REQUIRED key whose value may be `undefined` is refused here — all three
 * survive the round trip as something other than what the type promised. It also
 * refuses an entry written without `op<…>()`, whose response resolves to
 * `unknown`.
 */
export type RESPONSES_ARE_WIRE_SHAPED = Expect<AllResJsonSafe<Api>>;

/* ── the bound helpers ──────────────────────────────────────────────────── */

const contract = makeContract<Api>(api);

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
```

Keep the file's existing header comment, correcting "three tripwires" to "two" and deleting the `IO_COVERS_API` sentence.

- [ ] **Step 2: Port routes.ts**

Change the import to drop `type Io`, change `} satisfies HandlersOf<Api, Io>;` to `} satisfies HandlersOf<Api>;`, and drop the status argument from all six `fail(...)` calls:

```ts
      if (!row) fail('getParty', 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
```
```ts
      if (blank) fail('createParty', blank.code, blank.message, blank.ctx);
      const bad = invalidBalance(c.body.balance);
      if (bad) fail('createParty', bad.code, bad.message, bad.ctx);
      const taken = duplicateName(book(), c.body.name);
      if (taken) fail('createParty', taken.code, taken.message, taken.ctx);
```

and the three in `renameParty`, and the one in `removeParty`, all the same way.

- [ ] **Step 3: Port drift.controls.ts**

Every `HandlersOf<Api, Io>` → `HandlersOf<Api>`, `Io['createParty']['req']['name']` → `ReqOf<Api, 'createParty'>['name']`, `Io['removeParty']['res']` → `ResOf<Api, 'removeParty'>`, `Api['removeParty']['codes'][number]` → `CodeOf<Api, 'removeParty'>`, `Api['listParties']['codes'][number]` → `CodeOf<Api, 'listParties'>`, and `codeRefusals` loses its status arguments. Import `ReqOf`, `ResOf`, `CodeOf` as types from `@agency/mock`.

- [ ] **Step 4: Run the template's own compile**

The template is outside the root tsc solution, so `pnpm typecheck` will not see it. The only compiler that opens it is a scaffolded mock's. Scaffold one by hand:

```bash
node packages/cli/bin/agency.mjs new p2check --title "Phase 2" --locale de --profiles solo,full
pnpm install
pnpm --filter p2check build
```

Expected: PASS. Read every diagnostic if it does not — a `TS2578: Unused '@ts-expect-error'` here means a control has stopped biting and is a finding, not a thing to delete.

Then remove the scratch mock so it does not become a second thing to maintain:

```bash
rm -rf mocks/p2check
git checkout -- pnpm-lock.yaml 2>/dev/null || true
pnpm install --frozen-lockfile --offline
```

- [ ] **Step 5: Commit**

```bash
git add templates/mock/src/api/contract.ts templates/mock/src/api/routes.ts templates/mock/src/api/drift.controls.ts
git commit -F - -- templates/mock/src/api/contract.ts templates/mock/src/api/routes.ts templates/mock/src/api/drift.controls.ts <<'MSG'
feat(template): one registry entry per operation

`interface Io` is gone; the request, response and query types ride on the entry
through `op<Req, Res, Qry>()`, and `codes` maps each code to the status it
answers. A new endpoint is now one declaration instead of two that have to agree,
and the twelve-errors-from-one-missing-line cascade the sibling map produced has
no way to happen.

Two tripwires instead of three. IO_COVERS_API had nothing left to compare.
KEEP_AS_CONST becomes KEEP_LITERAL and stays: with no `as const` to delete it
reads as a leftover, and it is the only check inside the contract file that an
entry was written with `op<…>()` at all.

Scaffolded, installed and built a real mock to compile this — the template is
outside the root tsc solution and nothing else opens it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: `contract:complete` reads the new shape — check-first

The Phase 2 initializer is a `CallExpression`, so `ts.isObjectLiteralExpression(op.initializer)` is false, the `codes` loop never runs, `codes[key]` stays `[]`, and the code-reachability clause goes vacuous **while the success line still claims it checked**. Measured green with an unemittable code declared. This task is written check-first for that reason.

**Files:**
- Modify: `scripts/verify/checks/checks-bite.mjs` — one defect, one fixture
- Modify: `scripts/verify/checks/contract-complete.mjs:46-59` (the entry/codes reader), `:70-93` (`ioOf`, deleted), `:195-207` (the `qry` clause, deleted), `:218-220` (the reverse `Io` clause, deleted)
- Modify: `scripts/verify/registry.mjs` — the `contract:complete` row's `proves` and `blindSpot`

**Interfaces:**
- Consumes: the folded registry from Task 3.
- Produces: `registryOf` returns `{ keys, codes }` where `codes[key]` is the list of code NAMES read from the `codes` object literal inside the `op()(…)` call.

- [ ] **Step 1: Write the failing fixture**

In `scripts/verify/checks/checks-bite.mjs` add to `DEFECTS`:

```js
  /**
   * A declared code nothing can emit. The clause that catches this is the one that
   * goes VACUOUS if the reader is ported carelessly — the Phase 2 initializer is a
   * CallExpression, so the old `isObjectLiteralExpression` guard is false, the loop
   * never runs, and the check reports success having read no codes at all.
   */
  'unemittable-code': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'contract.ts');
    const src = readFileSync(file, 'utf8');
    const extra = src.replace(
      'codes: { PARTY_NOT_FOUND: 404 },\n  }),\n  createParty:',
      'codes: { PARTY_NOT_FOUND: 404, PARTY_NEVER_EMITTED: 418 },\n  }),\n  createParty:',
    );
    if (extra === src) throw new Error('unemittable-code: the getParty codes object moved');
    writeFileSync(file, extra);
  },
```

and to `FIXTURES`:

```js
  {
    id: 'unemittable-code',
    check: 'scripts/verify/checks/contract-complete.mjs',
    expect: 'PARTY_NEVER_EMITTED',
  },
```

- [ ] **Step 2: Run it and watch it fail for the stated reason**

```bash
node scripts/verify/checks/checks-bite.mjs --only unemittable-code
```

Expected: exit 1. It will report **either** `UNSOUND FIXTURE — the derived tree is already non-zero` (because the `Io` clause is firing on the folded template, which is Task 4's own subject) **or** `did not go red on a planted defect`. Both are correct reds at this point. Quote whichever you got — and note that the first one is the control run doing exactly its job: it refuses to certify a bite against a tree that was already broken.

- [ ] **Step 3: Port the entry reader**

In `scripts/verify/checks/contract-complete.mjs`, replace the body of `registryOf`'s per-operation loop (lines 46–59) with:

```js
          /* THE INITIALIZER IS A CALL: `op<Req, Res>()({ … })`. The old reader
             guarded on isObjectLiteralExpression, which is false here, so the loop
             below never ran and `codes[key]` stayed empty — a check reporting
             success having read nothing. Unwrap the call, then read the object. */
          let entry = op.initializer;
          while (ts.isCallExpression(entry)) entry = entry.arguments[0] ?? entry.expression;
          if (ts.isAsExpression(entry)) entry = entry.expression;
          if (!ts.isObjectLiteralExpression(entry)) {
            unreadable.push(key);
            continue;
          }
          for (const field of entry.properties) {
            if (
              ts.isPropertyAssignment(field) &&
              ts.isIdentifier(field.name) &&
              field.name.text === 'codes' &&
              ts.isObjectLiteralExpression(field.initializer)
            ) {
              /* The code names are now property NAMES, not string-literal array
                 elements. A port that keeps `isStringLiteral` on the name finds
                 ZERO codes and is exactly as silent as the guard above. */
              for (const c of field.initializer.properties) {
                if (!ts.isPropertyAssignment(c)) continue;
                if (ts.isIdentifier(c.name) || ts.isStringLiteral(c.name)) codes[key].push(c.name.text);
              }
            }
          }
```

Declare `const unreadable = [];` beside `const keys = []` and return it, and in `checkMock` push a problem for each:

```js
  for (const key of unreadable) {
    problems.push(
      `${label}: operation '${key}' has an initializer this check cannot read, so its codes ` +
        `were never examined — an entry is \`op<Req, Res>()({ … })\` or a plain object literal`,
    );
  }
```

**An unreadable entry must be LOUD.** Silence there is the whole defect this task exists to prevent.

- [ ] **Step 4: Delete `ioOf` and the `qry` clause**

Delete `ioOf` (lines 70–93), its call site, the `qry` clause and the reverse `Io` clause. Replace the `qry` clause with nothing, and record why in the row's `blindSpot` (Step 6): the slot it checked is now a type parameter with a default, so an operation cannot fail to declare one — `op<void, Party>()` gives `Qry = Record<string, never>`, which is the same closed slot the interface used to spell by hand. That is a guarantee moved from a check into the scaffolder's own shape, which is the outcome `CLAUDE.md`'s governing rule prefers.

- [ ] **Step 5: Run the fixtures and the tier**

```bash
node scripts/verify/checks/checks-bite.mjs
pnpm verify
```

Expected: `checks:bite` exit 0 with twelve lines; `pnpm verify` 13 PASSED. If `unemittable-code` still reports `did not go red`, the reader is still not seeing the codes and the port is incomplete — do not proceed.

- [ ] **Step 6: Update the row and regenerate**

In `scripts/verify/registry.mjs`, the `contract:complete` row's `proves` currently claims "an entry in `Io`, and a `qry` slot on that entry". Rewrite:

```js
    proves:
      'Every operation in the registry has a handler in routes.ts, and every code an operation ' +
      'declares appears as a string literal somewhere in the mock\'s src/ outside the contract, so a ' +
      'declared code nothing can ever emit is red. The handler map is anchored on ' +
      '`satisfies HandlersOf<…>` and a return-type annotation of HandlersOf is red wherever it ' +
      'appears, because either spelling widens the map and silently stops the exactness check at ' +
      'toRoutes from comparing anything. An operation whose entry this check cannot parse is red ' +
      'rather than skipped.',
    blindSpot:
      'It does NOT check that two operations share no method+path, nor that a literal segment is ' +
      'declared before its :param sibling — MEASURED: compile() already throws on both as a ' +
      'shadowing error before a request is served. The `qry` slot clause is GONE and was not ' +
      'replaced: the slot is now a type parameter with a default, so `op<void, Party>()` yields ' +
      'Record<string, never> and an operation cannot fail to declare one — the guarantee moved out ' +
      'of this row and into the shape the scaffolder writes. The code clause is reachability by ' +
      'LITERAL, not by proof: routes.ts passes rule-returned codes (blank.code), so the literal is ' +
      'matched anywhere under src/ rather than at a fail() site for that operation, and the status ' +
      'each code declares is never compared to anything. The opposite direction — a fail() literal ' +
      'outside the declared set — is held by the type system, not here.',
```

```bash
pnpm verify:write
pnpm verify
```

- [ ] **Step 7: Commit**

```bash
git add scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs CLAUDE.md
git commit -F - -- scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs CLAUDE.md <<'MSG'
fix(verify): contract:complete reads the folded registry, loudly

The Phase 2 initializer is a CallExpression, so the old `isObjectLiteralExpression`
guard was false, the codes loop never ran, `codes[key]` stayed empty, and the
check reported "a literal site for every declared code" having read no codes at
all. MEASURED green with an unemittable code declared. That silent-vacancy is why
this commit is check-first: the unemittable-code fixture was written and watched
failing before the reader was ported.

An entry this check cannot parse is now a pushed problem naming the operation,
not a skipped one.

CHECK CHANGES (HARD RULE 2 disclosure): the `Io` coverage clause and the `qry`
slot clause are DELETED, not weakened. `interface Io` no longer exists, and the
qry slot is now a type parameter with a default — `op<void, Party>()` yields
Record<string, never> — so an operation cannot fail to declare one. The guarantee
moved out of this row and into the shape the scaffolder writes at t=0, which is
the carrier CLAUDE.md's governing rule prefers. The row's blindSpot records that
the status each code declares is compared to nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: `api:bound` — the `unreached` ratchet, and reachers beyond `src/pages`

Measured: `operationsOf` survives the fold **unchanged**, because it reads only the entry's property NAME and never descends into the initializer. It must gain the same CallExpression unwrap for one reason only — to read `unreached` off the entry.

**Files:**
- Modify: `scripts/verify/checks/api-bound.mjs:44-68` (`operationsOf`), `:174-200` (the screens walk and the reach clause)
- Modify: `templates/mock/src/api/contract.ts` — one operation gains `unreached`
- Modify: `scripts/verify/checks/checks-bite.mjs` — two defects, two fixtures
- Modify: `scripts/verify/registry.mjs` — the `api:bound` row

**Interfaces:**
- Consumes: the folded registry from Task 3.
- Produces: `operationsOf` returns `Array<{ key: string, unreached: string | undefined }>`.

- [ ] **Step 1: Write the two failing fixtures**

```js
  /**
   * A marker on an operation a screen DOES reach. Stale exactly as an unused
   * `oxlint-disable-next-line` is, and red for the same reason: an excuse that no
   * longer excuses anything is an excuse nobody will notice has expired.
   */
  'stale-unreached': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'contract.ts');
    const src = readFileSync(file, 'utf8');
    const stale = src.replace(
      "codes: { PARTY_NOT_FOUND: 404 },\n  }),\n  createParty:",
      "codes: { PARTY_NOT_FOUND: 404 }, unreached: 'not really',\n  }),\n  createParty:",
    );
    if (stale === src) throw new Error('stale-unreached: the getParty entry moved');
    writeFileSync(file, stale);
  },
  /** An operation no screen reaches and no marker excuses. */
  'unreached-without-a-reason': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'contract.ts');
    const src = readFileSync(file, 'utf8');
    const added = src.replace(
      '  removeParty: op<void, void>()({',
      "  exportParties: op<void, string>()({\n" +
        "    method: 'GET', path: '/parties/export', status: 200, caps: [], codes: {},\n" +
        '  }),\n' +
        '  removeParty: op<void, void>()({',
    );
    if (added === src) throw new Error('unreached-without-a-reason: the removeParty entry moved');
    writeFileSync(file, added);
  },
```

```js
  { id: 'stale-unreached', check: 'scripts/verify/checks/api-bound.mjs', expect: 'is reached' },
  { id: 'unreached-without-a-reason', check: 'scripts/verify/checks/api-bound.mjs', expect: 'exportParties' },
```

- [ ] **Step 2: Run them and watch them fail**

```bash
node scripts/verify/checks/checks-bite.mjs --only stale-unreached
node scripts/verify/checks/checks-bite.mjs --only unreached-without-a-reason
```

Expected: `stale-unreached` reports `did not go red on a planted defect` — nothing reads `unreached` yet. `unreached-without-a-reason` reports a bite already, because the existing reach clause catches it; that is fine and it stays as a regression guard for the clause you are about to rewrite. Quote both.

- [ ] **Step 3: Read `unreached` off the entry**

In `operationsOf`, keep reading the property name, and add the unwrap only to reach the marker:

```js
function operationsOf(contractFile) {
  const source = parse(contractFile);
  /** @type {{key: string, unreached: string | undefined}[]} */
  const ops = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'api' &&
      node.initializer
    ) {
      let literal = node.initializer;
      if (ts.isAsExpression(literal)) literal = literal.expression;
      if (ts.isObjectLiteralExpression(literal)) {
        for (const p of literal.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          if (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name)) continue;
          // The KEY needs no unwrap — measured, this half survived the fold intact.
          // The unwrap exists solely to reach `unreached` inside the spec object.
          let entry = p.initializer;
          while (ts.isCallExpression(entry)) entry = entry.arguments[0] ?? entry.expression;
          if (ts.isAsExpression(entry)) entry = entry.expression;
          let unreached;
          if (ts.isObjectLiteralExpression(entry)) {
            for (const f of entry.properties) {
              if (
                ts.isPropertyAssignment(f) &&
                ts.isIdentifier(f.name) &&
                f.name.text === 'unreached' &&
                ts.isStringLiteral(f.initializer)
              ) {
                unreached = f.initializer.text;
              }
            }
          }
          ops.push({ key: p.name.text, unreached });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return ops;
}
```

- [ ] **Step 4: Widen the reachers and make the clause a ratchet**

Replace the screens walk and reach clause in `checkMock`:

```js
  /* ANY non-test, non-controls file under src/ is a reacher, not only src/pages.
     The hook layout reference/bulletproof-react recommends puts the call in
     src/features/<x>/api/*.ts, and the old src/pages-only walk reported every one
     of those operations as unreached — a false red that teaches an operator to
     distrust the row. */
  const srcDir = path.join(dir, 'src');
  const reachers = walk(srcDir, /\.tsx?$/).filter(
    (f) => !/\.test\.tsx?$/.test(f) && !/\.controls\.ts$/.test(f) && f !== contractFile,
  );
  if (reachers.length === 0) {
    problems.push(`${label}: no source files under src/, so no operation can be reached`);
    return { parsed: true, operations: declared.length };
  }

  const reached = new Set();
  for (const file of reachers) {
    const { named, raw } = callsIn(file, dir);
    for (const key of named) {
      if (!declared.some((o) => o.key === key)) {
        problems.push(`${label}: ${path.basename(file)} calls '${key}', which the contract does not declare`);
      }
      reached.add(key);
    }
    for (const r of raw) problems.push(`${label}: ${r}`);
  }

  /* A RATCHET, in both directions, exactly as reportUnusedDisableDirectives is.
     Not reached and no marker is red; a marker while the operation IS reached is
     red as stale; an empty reason is red because "" is not a reason. */
  for (const { key, unreached } of declared) {
    const isReached = reached.has(key);
    if (!isReached && unreached === undefined) {
      problems.push(
        `${label}: operation '${key}' is declared but nothing under src/ calls it. Either reach it, ` +
          `or say why not: \`unreached: 'the reports screen lands in March'\` on its registry entry.`,
      );
    }
    if (!isReached && unreached !== undefined && unreached.trim() === '') {
      problems.push(`${label}: operation '${key}' carries an empty \`unreached\` — the reason IS the excuse`);
    }
    if (isReached && unreached !== undefined) {
      problems.push(
        `${label}: operation '${key}' carries \`unreached: '${unreached}'\` but IS reached under src/ — ` +
          `stale, exactly as an unused oxlint-disable is. Delete the marker.`,
      );
    }
  }
```

Update the two other uses of `declared` (the `.length === 0` guard and the returned `operations` count) to the new array-of-objects shape.

- [ ] **Step 5: Give the template one modelled-but-unreached operation**

This is §2.F's "model the API from the transcript before any screen exists", and it is what makes the marker a demonstrated idiom rather than an unused feature. In `templates/mock/src/api/contract.ts`, before `removeParty`:

```ts
  /** Modelled from the transcript before its screen exists. Red the day a screen reaches it. */
  exportParties: op<void, string>()({
    method: 'GET', path: '/parties/export', status: 200, caps: [], codes: {},
    unreached: 'CSV export lands with the reports screen',
  }),
```

`routes.ts` needs a handler for it, because `HandlersOf<Api>` requires one:

```ts
    /** No screen yet — see `unreached` on its registry entry. The body is the
     *  service body regardless, so the endpoint is ready when the screen is. */
    exportParties: (c) =>
      parties
        .list({ page: 1, limit: MAX_LIMIT })
        .data.map((p) => `${p.id},${p.name},${p.balance}`)
        .join('\n') + (c.now ? '' : ''),
```

Simplify that last line to just the `.join('\n')` if `c` is otherwise unused and lint objects to an unused parameter; use `()` for the parameter list in that case.

**A `string` response is deliberate here.** It is the case the branded-return exactness variant broke, and having one in the template means the sink is exercised against a primitive response on every `build`.

- [ ] **Step 6: Run everything**

```bash
node scripts/verify/checks/checks-bite.mjs
pnpm verify
```

Expected: all fixtures bite; 13 PASSED. `api:bound` must now report the template's 7 operations with `exportParties` excused.

- [ ] **Step 7: Update the row, regenerate and commit**

Rewrite the `api:bound` row's `proves` to state the ratchet and the widened walk, and its `blindSpot` to record that `unreached` is a string nobody validates and that a reacher is any file under `src/` — including one nothing imports, so a dead module still counts as reaching. Then:

```bash
pnpm verify:write
pnpm verify
git add scripts/verify/checks/api-bound.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs templates/mock/src/api/contract.ts templates/mock/src/api/routes.ts CLAUDE.md
git commit -F - -- scripts/verify/checks/api-bound.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs templates/mock/src/api/contract.ts templates/mock/src/api/routes.ts CLAUDE.md <<'MSG'
feat(verify): api:bound gains the unreached ratchet and looks past src/pages

An operation nothing reaches is red unless its entry says why, in a sentence; a
marker on an operation that IS reached is red as stale, exactly as an unused
oxlint-disable is; an empty reason is red because "" is not a reason. This is a
STRONGER check about a SMALLER claim — the old one was satisfied by any module
under src/pages, dead or not.

Reachers widen from src/pages to any non-test, non-controls file under src/. The
hook layout reference/bulletproof-react recommends puts the call in
src/features/<x>/api/, and the old walk reported every such operation as unreached
— a false red, which is the fastest route to a row an operator switches off.

operationsOf's key reader survived the fold untouched (it reads the property NAME
and never descends into the initializer — measured); the CallExpression unwrap
exists solely to reach `unreached` inside the spec object.

The template now models one operation ahead of its screen, so the marker is a
demonstrated idiom rather than an unused feature. Its response is a plain `string`
deliberately: that is the case the branded-return exactness variant broke, and the
sink is now exercised against a primitive response on every build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: The screen closes its own message table

`SAYS` is `Record<string, string>` today, so a declared code with no sentence is invisible and a sentence for a code nothing declares is invisible. One operator closes both.

**Files:**
- Modify: `templates/mock/src/pages/PartiesPage.tsx:30-38`
- Modify: `templates/mock/src/pages/OverviewPage.tsx` — add the same table
- Modify: `templates/mock/src/api/drift.controls.ts` — two controls

**Interfaces:**
- Consumes: `CodeOf<Api, K>` from Task 1.

- [ ] **Step 1: Write the failing controls**

In `templates/mock/src/api/drift.controls.ts`:

```ts
/* ── THE SCREEN'S MESSAGE TABLE IS CLOSED ───────────────────────────────── */

/** A declared code with no sentence is TS2741, naming the code. */
// @ts-expect-error PARTY_BALANCE_INVALID is declared by createParty and has no sentence here.
export const missingSentence = {
  PARTY_NAME_TAKEN: 'taken',
  PARTY_NAME_BLANK: 'blank',
} satisfies Record<CodeOf<Api, 'createParty'>, string>;

/** A sentence for a code nothing declares is TS2353, naming the key. */
export const strangeSentence = {
  PARTY_NOT_FOUND: 'gone',
  // @ts-expect-error getParty declares only PARTY_NOT_FOUND.
  PARTY_ON_FIRE: 'oh no',
} satisfies Record<CodeOf<Api, 'getParty'>, string>;
```

- [ ] **Step 2: Compile the template and watch both fail**

Scaffold as in Task 3 Step 4. Expected: PASS **only if both directives are used**. If either reports `TS2578: Unused '@ts-expect-error'`, `satisfies Record<CodeOf<…>, string>` is not closing the table and the mechanism does not work — report it and stop rather than deleting the control.

- [ ] **Step 3: Close both screens' tables**

In `templates/mock/src/pages/PartiesPage.tsx`:

```ts
/**
 * A refusal message per declared code. `satisfies Record<CodeOf<…>, string>` closes
 * the table in BOTH directions: a declared code with no sentence is TS2741 naming
 * the code, and a sentence for a code nothing declares is TS2353 naming the key.
 * It is the only step in the endpoint path that nothing held before.
 */
const SAYS = {
  PARTY_NAME_TAKEN: 'That name is already in the book.',
  PARTY_NAME_BLANK: 'A party needs a name.',
  PARTY_BALANCE_INVALID: "A balance looks like '1240.00' — two decimals, no separators.",
  PARTY_NOT_FOUND: 'That party is no longer there. Reload the list.',
} satisfies Record<CodeOf<Api, 'listParties' | 'getParty' | 'createParty' | 'renameParty'>, string>;

/**
 * `undefined` is not a mystery: it is what the product's exception filter sends for
 * every transport failure and every ValidationPipe 400, so the envelope's own message
 * is rendered. Rendering is not branching, so HARD RULE 5 holds.
 */
const says = (error: unknown, code: keyof typeof SAYS | undefined): string =>
  error ? (code === undefined ? 'Something went wrong. Try again.' : SAYS[code]) : '';
```

Import `type Api` and `type CodeOf` — `CodeOf` from `@agency/mock`, `Api` from `../api/contract`.

`OverviewPage.tsx` reaches only `overview`, which declares no codes, so `CodeOf<Api, 'overview'>` is `never` and `Record<never, string>` is `{}`. Give it the same `says` helper with no table and a comment saying exactly that — an operation that never refuses has no sentences to write, and the type says so.

- [ ] **Step 4: Compile and commit**

Scaffold, build, remove the scratch mock, then:

```bash
git add templates/mock/src/pages/PartiesPage.tsx templates/mock/src/pages/OverviewPage.tsx templates/mock/src/api/drift.controls.ts
git commit -F - -- templates/mock/src/pages/PartiesPage.tsx templates/mock/src/pages/OverviewPage.tsx templates/mock/src/api/drift.controls.ts <<'MSG'
feat(pages): the screen closes its own message table

`SAYS` was Record<string, string>, so a declared code with no sentence was
invisible and a sentence for a code nothing declares was invisible. `satisfies
Record<CodeOf<Api, K>, string>` closes both directions with one plain operator —
TS2741 naming the missing code, TS2353 naming the strange key — and it is the only
step in the endpoint path that nothing held.

OverviewPage reaches only `overview`, which declares no codes, so its CodeOf is
`never` and there is no table to write. The type says so rather than a comment.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: The memo, the golden, and the phase record

**Files:**
- Modify: `templates/mock/src/api/wire.golden.json` and `wire.golden.helpers.ts` — `exportParties` is a new operation and the golden drives every declared one
- Modify: `CLAUDE.md` — "The contract" section
- Modify: `docs/BUILD-REPORT.md` — the Phase 2 record

- [ ] **Step 1: Regenerate the wire golden and READ THE DIFF**

```bash
AGENCY_GOLDEN=write pnpm exec vitest run templates/mock/src/api/wire.golden.test.ts
git diff templates/mock/src/api/wire.golden.json
```

Expected: exactly one added section, `exportParties`, fingerprinting a `string`. **If any other operation's fingerprint changed, Phase 2 changed the wire and that is a finding** — the fold is supposed to be type-only. Report it rather than accepting the regeneration.

- [ ] **Step 2: Rewrite the memo's contract section**

Four things are now false in `CLAUDE.md`:

1. "One `as const` registry per mock is the API" and "keys every operation by name and carries its method, path, success status, capabilities and closed set of error codes; a sibling `interface Io` carries the request, response and query types" — there is no `as const` and no sibling interface. Rewrite to the one-entry form, and say that `codes` carries each code's status.
2. "`fail(key, status, code, …)`" — it is `fail(key, code, …)` and the status comes from the registry.
3. "The handler map, every call site, every refusal and the error branch a screen reads are all derived from that one literal by type" — still true, and now add the screen's `SAYS` table, which was the one step nothing held.
4. Decision 1's "three tripwires" — there are two, and one of them (`KEEP_LITERAL`) is kept for a reason the design argued against. Record the measurement.

- [ ] **Step 3: Append the Phase 2 record to `docs/BUILD-REPORT.md`**

Follow the existing sections' shape: what was measured, what a check should have caught and didn't, and what is still open. The items still open at the end of Phase 2 are: the two exactness residuals (cast/annotation and subtype-reduced branch) are unchanged; `contract:complete`'s code clause is still reachability by literal and now also never compares a code's declared STATUS to anything; `checks:bite` still covers a minority of rows; and the template's tests still run only in `verify:full` (Phase 3).

- [ ] **Step 4: Run both tiers**

```bash
pnpm verify:write
pnpm verify
pnpm verify:full
```

Expected: 13 PASSED and 16 PASSED, neither narrowed. `verify:full` is the first proof the fold survives a real scaffold-install-build-test.

- [ ] **Step 5: Commit**

```bash
git add templates/mock/src/api/wire.golden.json CLAUDE.md docs/BUILD-REPORT.md
git commit -F - -- templates/mock/src/api/wire.golden.json CLAUDE.md docs/BUILD-REPORT.md <<'MSG'
docs(contract): the memo describes the folded registry

`as const` and `interface Io` are both gone, `fail` takes no status, and the
screen's message table is closed by `satisfies Record<CodeOf<…>, string>` — the
one step in the endpoint path nothing held before.

Decision 1 said "three tripwires". There are two, and KEEP_LITERAL is kept against
the design's own recommendation: measured, it is the only registry-local detector
of an entry written without `op<…>()`, and every other symptom of that mistake
surfaces in a different file.

The wire golden gains exportParties and nothing else changed — which is the claim
that the fold is type-only, checked rather than asserted.

pnpm verify       13 PASSED, exit 0, not narrowed
pnpm verify:full  16 PASSED, exit 0, not narrowed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Self-review

**Spec coverage.** Design §6 Phase 2 lists four steps. Step 8 (`codes` object, `fail(key, code, …)`) → Tasks 1–2. Step 9 (fold `Io`, delete the tripwires) → Tasks 1 and 3, with `PathsAreLiterals` **kept** rather than deleted and the reason measured. Step 10 (`unreached` ratchet, widen reachers) → Task 5. Step 11 (`SAYS … satisfies`) → Task 6. The AST checks are Tasks 4 and 5; the memo and golden are Task 7. No Phase 2 spec item is unimplemented.

**Where this plan contradicts the design, and why.** Three places, each measured:
1. §2.C says `PathsAreLiterals` becomes unnecessary. It does not — it is the only registry-local detector of a forgotten `op()`, and it still fires on three widenings. Kept and renamed.
2. §4's `ReqOf/ResOf/QryOf` do not compile as written (four `TS2536`s — `IoOf<A[K]>` is an unresolved conditional and not indexable). The repaired `extends { res: infer R }` spelling is used, and it is strictly better: a forgotten `op()` then yields `unknown`, which two tripwires refuse, where the alternative yields `never`, which both accept.
3. §2.C treats the `qry` slot check as surviving. It has no successor and needs none — the slot is now a type parameter with a default. That is recorded in the row's `blindSpot` rather than quietly dropped.

**Type consistency.** `ApiSpec = Record<string, Spec>` throughout; `OperationSpec`, `IoSpec` and `IoFor` are deleted in Task 1 and referenced nowhere after. Every generic loses its `I` parameter in Task 1 and every later task uses the one-parameter form: `HandlersOf<Api>`, `Leaks<Api, H>`, `LeakFree<Api, H, Ok>`, `CallArgsOf<Api, K>`, `Contract<Api>`, `AllResJsonSafe<Api>`. `fail` has one signature across Tasks 2, 3 and 5. `operationsOf` returns objects from Task 5 onward and both its other call sites are named in that task's Step 4.

**Known risk, recorded rather than hidden.** Task 3 Step 4 scaffolds, installs and builds a real mock to compile the template, then removes it and restores the lockfile. That is the same `pnpm install` the `build` row performs, and it rewrites `node_modules`. Run it from the main loop only, never from a subagent, and never concurrently with another install in this tree.

## What comes next

Phase 3 gets its own plan, written only after Phase 2 is green, reviewed, and recorded. It cannot be written accurately before then for one concrete reason: it makes the golden exhaustive over `Object.keys(api[key].codes)`, and that object does not exist until Task 1 of this plan lands.
