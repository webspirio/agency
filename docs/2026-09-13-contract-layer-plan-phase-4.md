# Contract Layer Phase 4 — Capability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A malformed request gets the bytes the product's `ValidationPipe` sends, a screen's data layer is derived from the registry rather than hand-written per endpoint, and the golden can be replayed against a live API.

**Architecture:** Three additions, in decreasing order of measured harm. `shape()` runs before the handler and emits the product's validation envelope, closing a divergence that today answers 500 where Nest answers 400. `makeQueries` derives `query`/`mutation`/`keyOf` from the same registry every call site is typed against, so a query key cannot drift from the operation it caches. `AGENCY_LIVE_API` replays the golden's drives against a real backend, SKIPPED when unset — the one migration mechanism SPEC §15 promises and has never had.

**Tech Stack:** TypeScript 6.0.3, node 24, pnpm workspaces, vitest 4, oxlint 1.82, axios 1.20, TanStack Query 5.

**Spec:** `docs/2026-09-13-contract-layer-design.md` §6 steps 16–18, §7.

**Intent:** `docs/intent.md` — this phase closes criterion 5's remaining half and SPEC §15's "exactly one migration mechanism", which the design records as currently unbuilt.

## Global Constraints

Copied verbatim from `CLAUDE.md`; every task's requirements implicitly include them.

- **Node:** major **24**. `export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH`.
- **TDD, always.** Watch the red, quote it, then implement.
- **Never weaken a check to go green.**
- **No new dependencies.** This plan adds none — the approved `pnpm add` was Phase 3's and is spent.
  `shape()` is hand-written for exactly this reason: `zod` is on HARD RULE 6's forbidden list.
- **Money is decimal strings.** Only `packages/dec/src/dec.ts` does the arithmetic.
- **Ids are `seq()` or a ULID, store-assigned.** Never `Math.random()`.
- **Branch on `code` only.** Pagination is `{ data, total, page, limit }`.
- **`reference/` is read-only.**
- **Never `git reset --hard`, `git clean`, or `git checkout .`.** Explicit pathspecs.
- **After editing `scripts/verify/registry.mjs`, run `pnpm verify:write`.**
- **`pnpm verify` green before a turn ends.** Report which of the five statuses you got.

## Precondition

```bash
export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH
pnpm verify        # must be 15 PASSED, not narrowed
pnpm verify:full   # must be 18 PASSED, not narrowed
```

## The thing to watch for in this phase, above the work itself

**Twice in three phases a commit message has asserted work that did not happen** — Phase 2's
`codeRefusals` and Phase 3's `DRIVES`. Both were caught by review, not by a check, and nothing in
this repository can catch the third. Before writing any commit message in this phase, re-read the
diff you are describing and delete every sentence the diff does not support. That instruction is the
only mechanism there is.

## What was measured on 2026-09-13, before this plan was written

Against a freshly scaffolded mock, through the real adapter:

| Request | The mock answers | The product answers | Gap |
|---|---|---|---|
| `POST /parties` with `{}` | **500** `{"statusCode":500,"error":"Internal Server Error","message":"Internal server error"}` | 400 with `message: string[]`, one sentence per failed field | A screen shows "something went wrong" where it should show which fields are missing, and the demo's most common mistake looks like a crash |
| `POST /parties` with a forged `id` and `created_at` | **201**, and the forged values are IGNORED — the store assigned `party-000013` and its own instant | 400, because the global `ValidationPipe` runs `forbidNonWhitelisted: true` | The design says "a forged `id` is accepted with 201". It is accepted but NOT honoured, which is safer than the design implies and still a divergence |

The `forbidNonWhitelisted` fact is `reference/contract/frontend-api-client.ts:94`, which records it
as the reason `paramsSerializer: { indexes: null }` exists.

---

### Task 1: `shape()` — a malformed body gets the product's bytes

**Files:**
- Create: `packages/mock/src/shape.ts`, `packages/mock/src/shape.test.ts`
- Modify: `packages/mock/src/contract.ts` — `makeContract(api, bodies?)`, `toRoutes` runs the check
- Modify: `packages/mock/src/index.ts`
- Modify: `templates/mock/src/api/contract.ts` — one `bodies` literal
- Modify: `templates/mock/src/api/wire.golden.test.ts` — two REFUSALS-adjacent drives
- Modify: `scripts/verify/checks/checks-bite.mjs`

**Interfaces:**
- Produces: `shape` — a tiny combinator set, NOT a schema library. `s.str()`, `s.dec2()`, `s.opt(x)`.
- Produces: `BodiesOf<A> = { [K in keyof A]?: Shape<ReqOf<A, K>> }`
- Produces: `makeContract<A>(api: A, bodies?: BodiesOf<A>): Contract<A>`
- Produces: on failure, `DomainError(400, undefined, messages)` where `messages` is `string[]` — no
  `code`, exactly as the product's filter emits for a `ValidationPipe` rejection.

- [ ] **Step 1: Write the failing tests**

In `packages/mock/src/shape.test.ts`, the behaviours that matter, each stated as the product's:

```ts
describe('shape emits what a Nest ValidationPipe emits, not what is convenient', () => {
  const body = shape({ name: s.str(), balance: s.dec2(), note: s.opt(s.str()) });

  it('accepts a body that satisfies every field', () => {
    expect(check(body, { name: 'A', balance: '1.00' })).toEqual([]);
  });

  it('reports ONE SENTENCE PER FAILED FIELD, as message: string[]', () => {
    // `message` is an ARRAY for a validation failure and a STRING for everything
    // else — packages/mock/src/api-error.ts already reads exactly that shape into
    // `details`, so a screen mapping field errors works unchanged after conversion.
    expect(check(body, {})).toEqual(['name must be a string', 'balance must be a string']);
  });

  it('refuses an unknown property, because forbidNonWhitelisted is on in the product', () => {
    expect(check(body, { name: 'A', balance: '1.00', id: 'forged' })).toEqual([
      'property id should not exist',
    ]);
  });

  it('accepts an absent optional and refuses a present-but-wrong one', () => {
    expect(check(body, { name: 'A', balance: '1.00' })).toEqual([]);
    expect(check(body, { name: 'A', balance: '1.00', note: 4 })).toEqual(['note must be a string']);
  });

  it('says a decimal string is a string, never a number', () => {
    expect(check(body, { name: 'A', balance: 1 })).toEqual(['balance must be a string']);
  });

  it('refuses a non-object body outright', () => {
    expect(check(body, null)).toEqual(['body must be an object']);
  });
});
```

The exact sentences must be copied from what class-validator actually emits, not invented. Read
`reference/contract/` first; if the corpus does not fix a wording, say so in the commit and pick the
class-validator default (`<property> must be a <type>`, `property <name> should not exist`).

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm exec vitest run packages/mock/src/shape.test.ts
```

Expected: `Cannot find module './shape'`. Quote it.

- [ ] **Step 3: Implement `shape`**

Under 60 lines. It is a combinator set, not a schema library: SPEC §14 rejected `zod` on dependency
grounds and the point is to emit *the product's bytes*, which a general validator would not.

- [ ] **Step 4: Thread it through `toRoutes`**

`makeContract(api, bodies?)` stores the map; `toRoutes` wraps each handler so the body is checked
**before** the handler runs:

```ts
        handler: (c: Ctx) => {
          const declared = bodies?.[key];
          if (declared) {
            const problems = check(declared, c.body);
            if (problems.length > 0) {
              /* 400, `message` as an ARRAY, and NO code — that is what the product's
                 ValidationPipe produces and what AllExceptionsFilter puts on the wire.
                 A code here would be a discriminator the product never sends, which is
                 exactly what Phase 1 removed from the adapter. */
              throw new DomainError(400, undefined, problems);
            }
          }
          return (handlers[key] as (ctx: Ctx) => unknown)(c);
        },
```

`bodies` is **optional per operation**, so an existing mock keeps working and a GET declares nothing.

- [ ] **Step 5: Declare the template's two bodies, and drive them in the golden**

`createParty` and `renameParty` are the only operations with a request body. Add a `VALIDATION`
section to the golden with two drives — `{}` and a forged `id` — and fingerprint both. They are NOT
`REFUSALS`: a validation failure declares no code, so it forms no `(operation, code)` pair, and the
exhaustiveness loop must keep passing. **Check that it does** — if adding these to `REFUSALS` is
tempting, it is because the loop would then demand a code that does not exist.

- [ ] **Step 6: A `checks:bite` fixture**

Delete the `bodies` argument from the template's `makeContract` call, and require `template:check` to
go red on the golden's validation drives.

- [ ] **Step 7: Run both tiers and commit**

Disclose: the `createParty`/`renameParty` 500-on-empty-body behaviour changes to 400. Any test
asserting the 500 must change, and each change named.

---

### Task 2: `makeQueries` — the data layer comes from the registry too

Today each screen hand-writes `useQuery({ queryKey: ['parties', page], queryFn: () => call(...) })`.
The key and the operation are two declarations that have to agree, which is the exact shape the
contract exists to remove one layer down.

**Files:**
- Create: `packages/mock/src/queries.ts`, `packages/mock/src/queries.test.ts`
- Modify: `packages/mock/src/index.ts`
- Modify: `templates/mock/src/pages/*.tsx`
- Modify: `scripts/verify/checks/api-bound.mjs` — learn the factory surface

**Interfaces:**
- Produces: `makeQueries<A>(contract: Contract<A>, http: Transport) => { keyOf, query, mutation }`
- Produces: `keyOf<K>(key: K, args?: CallArgsOf<A, K>): readonly unknown[]` — the operation name is
  the first element, so two operations can never share a key.

- [ ] **Step 1: Write the failing tests**

```ts
describe('makeQueries derives the cache key from the operation, never from a string', () => {
  it('puts the operation name first, so two operations cannot collide', () => {
    expect(keyOf('getParty', { params: { id: 'p1' }, body: undefined })[0]).toBe('getParty');
  });

  it('includes the params and the query, so two pages are two entries', () => {
    const a = keyOf('listParties', { params: {}, body: undefined, qry: { page: '1' } });
    const b = keyOf('listParties', { params: {}, body: undefined, qry: { page: '2' } });
    expect(a).not.toEqual(b);
  });

  it('does NOT include the body, so a mutation does not fragment its own cache', () => {
    const a = keyOf('createParty', { params: {}, body: { name: 'A' } });
    const b = keyOf('createParty', { params: {}, body: { name: 'B' } });
    expect(a).toEqual(b);
  });

  it('is stable across key ORDER in qry, so two equal queries are one entry', () => {
    const a = keyOf('listParties', { params: {}, body: undefined, qry: { page: '1', limit: '8' } });
    const b = keyOf('listParties', { params: {}, body: undefined, qry: { limit: '8', page: '1' } });
    expect(a).toEqual(b);
  });
});
```

That last one needs `byCodepoint` over the qry keys — the comparator Phase 3 added, used for the
reason it exists.

- [ ] **Step 2–4: red, implement, green.**

- [ ] **Step 5: `api:bound` learns the factory surface**

A screen calling `q.query('listParties', …)` reaches `listParties` exactly as `call(...)` does. The
row must count it, or converting a screen to `makeQueries` makes every operation read as unreached —
a false red, which is the fastest route to a row somebody switches off.

**Write the `checks:bite` fixture first**: a screen that reaches an operation only through the
factory must NOT be reported unreached.

- [ ] **Step 6: Convert both template screens, run both tiers, commit**

The wire golden must be unchanged — this is a caller-side refactor. If a fingerprint moves, stop.

---

### Task 3: `AGENCY_LIVE_API` — the golden replays against a real backend

SPEC §15 promises "exactly one migration mechanism" and the design records it as unbuilt. Phase 3's
store-captured ids are what make it possible: the product assigns UUIDs, so a golden hard-coding
`party-000001` could not be replayed at all.

**Files:**
- Modify: `templates/mock/src/api/wire.golden.test.ts`
- Modify: `scripts/verify/registry.mjs` — the `wire:frozen` row's blindSpot

**Interfaces:**
- Produces: when `AGENCY_LIVE_API` is set, the drives run against that base URL through the SAME
  `call()` and the SAME fingerprint, with a one-entry equivalence map `{ 'seq-id': ['uuid'] }`.

- [ ] **Step 1: Write the failing test**

```ts
const LIVE = process.env.AGENCY_LIVE_API;

/**
 * The equivalence map is ONE entry and should stay that way. `seq-id` and `uuid` are
 * the same THING — a store-assigned identifier — fingerprinted differently because the
 * mock's allocator is a sequence and the product's is a UUID. Every other token must
 * match exactly: if a second entry is ever needed, the wire has genuinely diverged and
 * that is the finding, not an inconvenience to configure away.
 */
const EQUIVALENT: Record<string, readonly string[]> = { 'seq-id': ['uuid'] };

describe.skipIf(!LIVE)('the golden replays against a live API', () => { … });
```

`describe.skipIf` is vitest's own mechanism, so the suite reports SKIPPED rather than passing
vacuously — **the whole point, and the distinction this repo is built on.** Do not use `if (!LIVE)
return`, which reports a pass.

- [ ] **Step 2: Verify it SKIPS, and that the skip is visible**

```bash
pnpm exec vitest run --reporter=verbose   # the live block must read "skipped", not "passed"
```

Then set `AGENCY_LIVE_API` to a URL that does not answer and confirm the suite FAILS rather than
skipping — a replay that silently passes when the backend is unreachable is the same defect as a
check that cannot fail.

- [ ] **Step 3: Implement, add a `UUID` token to the fingerprint, run both tiers, commit**

---

### Task 4: The memo, the record, and what four phases leave open

- [ ] **Step 1: Rewrite what Phase 4 made false in `CLAUDE.md`.**
- [ ] **Step 2: Append the Phase 4 record to `docs/BUILD-REPORT.md`.**
- [ ] **Step 3: Write the closing assessment against `docs/intent.md` §5** — all nine criteria, each
  marked met or not met **with the mechanism or the reason**. Criterion 2 ("every check has been
  observed going red") will NOT be met; say so plainly and list the rows that still have no fixture.
- [ ] **Step 4: Both tiers, then commit.**

---

## Self-review

**Spec coverage.** §6 Phase 4 lists three steps: 16 → Task 1, 17 → Task 2, 18 → Task 3. Task 4 is the
record, as in every phase.

**Ordering, and why.** Task 1 first because it is the only one closing a measured behavioural
divergence — 500 where the product sends 400. Task 2 is ergonomics and touches the most files. Task 3
depends on Phase 3's captured ids and will SKIP in every run this repository can perform, so it is
last: it is the task whose value is entirely in a future someone else has.

**Type consistency.** `BodiesOf<A>` and `Shape<T>` are introduced in Task 1 and used only there.
`makeQueries` consumes `Contract<A>` and `Transport`, both Phase 1 surface. `keyOf` uses
`CallArgsOf<A, K>`, which has been stable since Phase 2.

**Known risk.** Task 1 changes what a malformed request returns, and the template's page tests assert
rendered error text. If any asserts the 500 path, that assertion changes and must be disclosed. Task 2
touches both screens and `api:bound`; if the row cannot be taught the factory surface cheaply, **stop
and report rather than converting the screens** — a screen the row cannot see is worse than a
hand-written query key.
