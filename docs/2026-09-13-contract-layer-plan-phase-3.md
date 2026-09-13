# Contract Layer Phase 3 — The Golden Becomes the Instrument — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every declared `(operation, code)` pair is driven through the real adapter and its `(status, code)` pair asserted — so the one guarantee no type can hold is held by a runtime instrument instead of by prose.

**Architecture:** No type-level scheme survives a cast or a subtype-reduced branch; Phases 1 and 2 measured that twice and wrote both residuals down as live types. The golden is therefore promoted from a record into the ground truth: a `REFUSALS` table with one drive per declared code, an exhaustiveness loop that runs **at runtime** over `Object.keys(api[key].codes)` so a cast in the table cannot evade it, and `DRIVES` rewritten to go through `call()` with typed keys chained on an id captured from `create` — which is also the precondition for a live replay, since the product assigns UUIDs. Once the golden proves a code can actually be emitted, `contract:complete`'s literal clause narrows from "this string appears somewhere under src/" to what it can actually establish.

**Tech Stack:** TypeScript 6.0.3 (`tsc -b --force`), node 24 (`.nvmrc`), pnpm workspaces, vitest 4 (node + dom projects), oxlint 1.82 with a custom JS plugin, axios 1.20 custom adapter.

**Spec:** `docs/2026-09-13-contract-layer-design.md` — §2.G (the golden becomes the instrument), §6 steps 12–15, §8.

**Intent:** `docs/intent.md` — criteria 7 ("every declared `(operation, code)` pair has a refusal drive in the golden, and the exhaustiveness loop runs at runtime") and 8 ("the template's 467 test lines and its type-level tripwires run in the **fast** tier").

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `CLAUDE.md`.

- **Node:** the interpreter must satisfy `.nvmrc` (major **24**). For a manual run: `export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH`.
- **TDD, always.** Failing test, run it, watch it fail *for the stated reason*, then implement.
- **Never weaken a check to go green.** If a check is genuinely wrong, say so and leave it failing.
- **Money is decimal strings.** `packages/dec/src/dec.ts` is the only module allowed to do the arithmetic.
- **Ids are `seq()` or a ULID, store-assigned.** Never `Math.random()`, never implicit array order.
- **Branch on `code` only.** Pagination is `{ data, total, page, limit }`.
- **`reference/` is read-only.**
- **Never `git reset --hard`, `git clean`, or `git checkout .`.** Commit with an explicit pathspec.
- **An oxlint exemption goes on the line it excuses**, never the file.
- **After editing `scripts/verify/registry.mjs`, run `pnpm verify:write`.**
- **`pnpm verify` must be green before a turn ends.**
- **Report the status you got**, one of `PASSED` / `FAILED` / `SKIPPED` / `NOT_RUN` / `UNRUNNABLE`.

### The one constraint this phase is allowed to break, and only here

`CLAUDE.md`'s stop-list says *"you need a dependency that is not installed (do not run `pnpm add`)"*.
Task 5 installs root devDependencies, and **the repository owner authorised that specific install for
this task on 2026-09-13**. It is the only `pnpm add` in the four phases. Nothing else in this plan
adds a dependency, and **no dependency is added to a mock's `dependencies`** — HARD RULE 6 is
untouched, and the forbidden list (`msw`, `@mswjs/data`, `@electric-sql/pglite`, `zod`, `i18next`,
`react-i18next`) gains no member.

## Precondition

```bash
export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH
node -v            # v24.x
pnpm verify        # must be 13 PASSED, not narrowed
pnpm verify:full   # must be 16 PASSED, not narrowed
```

If either is not green, stop and report which of the five statuses you got.

## What this phase must close, in priority order

Three of these are open items this repository wrote down about itself, and they are the reason the
phase exists rather than being a nice-to-have:

1. **A refusal status in the 2xx range resolves as a SUCCESS.** `fail()` reads the status off the
   registry and does not range-check it; the adapter's throwing branch is gated on axios's
   `validateStatus`, which accepts 200–299. `codes: { PARTY_NOT_FOUND: 200 }` therefore delivers the
   error envelope to the screen typed as the declared response, every field `undefined`. Measured in
   the Phase 2 review.
2. **Nothing compares a declared status to the one the wire carries.** The status moved into the
   registry in Phase 2, which is what makes one code answer one status within its operation — and
   the `contract:complete` blind spot says plainly that the value is compared to nothing.
3. **`contract:complete`'s code clause is reachability by LITERAL.** It matches the code string
   anywhere under `src/`, so a `fail()` site is not required to exist; the design records that the
   clause stays green after every `fail()` for a code is deleted.

---

### Task 1: Refusal statuses are a real range, and the type says so

The cheapest of the three, and it belongs first because Task 2's drives would otherwise be written
against a registry that can still declare a 2xx refusal.

**Files:**
- Modify: `packages/mock/src/contract.ts` — `Spec.codes`, and `fail`'s runtime guard
- Modify: `packages/mock/src/contract.controls.ts` — two controls
- Modify: `packages/mock/src/contract.test.ts` — one test
- Modify: `scripts/verify/checks/checks-bite.mjs` — one defect, one fixture
- Modify: `scripts/verify/checks/contract-complete.mjs` — read the status VALUE, not only the name

**Interfaces:**
- Produces: `type RefusalStatus = 400 | 401 | 403 | 404 | 405 | 409 | 410 | 415 | 422 | 423 | 429 | 500 | 501 | 502 | 503 | 504;`
- Produces: `Spec.codes: Readonly<Record<string, RefusalStatus>>`
- Produces: `contract-complete.mjs` reports a declared code whose status is outside 400–599.

- [ ] **Step 1: Write the failing controls and the failing test**

In `packages/mock/src/contract.controls.ts`:

```ts
/* ── A REFUSAL IS A 4xx OR A 5xx, AND THE TYPE SAYS SO ──────────────────── *
 *
 * MEASURED in the Phase 2 review: `codes: { PARTY_NOT_FOUND: 200 }` typechecked,
 * `fail()` threw `DomainError(200, …)`, and the adapter's throwing branch is gated on
 * axios's `validateStatus` — which accepts 200. So the ERROR ENVELOPE was returned as
 * a success and `call()` handed it to the screen typed as the declared response, with
 * every field `undefined` and no error branch ever taken.
 */
export const refusalStatusIsNarrow = {
  method: 'GET', path: '/x', status: 200, caps: [],
  // @ts-expect-error 200 is not a refusal status.
  codes: { WHATEVER: 200 },
} satisfies Spec;

export const refusalStatusAllowsA5xx = {
  method: 'GET', path: '/x', status: 200, caps: [],
  codes: { UPSTREAM_DOWN: 503 },
} satisfies Spec;
```

and in `packages/mock/src/contract.test.ts`:

```ts
it('refuses to throw a refusal whose status is not an error status', () => {
  // Reachable only through a cast, which is exactly why the runtime guard exists.
  const strayApi = { x: { method: 'GET', path: '/x', status: 200, caps: [], codes: { S: 200 } } };
  const stray = makeContract(strayApi as never);
  expect(() => stray.fail('x' as never, 'S' as never, 'no')).toThrow(/not a refusal status/);
});
```

- [ ] **Step 2: Run both and watch them fail**

```bash
pnpm typecheck
pnpm exec vitest run packages/mock/src/contract.test.ts
```

Expected: `typecheck` FAILS with `TS2578: Unused '@ts-expect-error' directive` at
`refusalStatusIsNarrow` — `codes` is `Record<string, number>` today, so 200 is accepted. The test
FAILS with `expected [Function] to throw error matching /not a refusal status/ but it didn't`. Quote
both.

- [ ] **Step 3: Narrow the type and add the runtime guard**

In `packages/mock/src/contract.ts`, above `Spec`:

```ts
/**
 * The statuses a REFUSAL may answer with. Not `number`, and the narrowing is not
 * pedantry: a 2xx here makes the adapter return the error envelope as a success,
 * because its throwing branch is gated on axios's `validateStatus`. A screen then
 * receives `{ statusCode, error, message, … }` typed as the declared response and
 * renders `undefined` in every field, with no error branch taken and no row red.
 *
 * The list is the set a Nest exception filter can actually produce from an
 * `HttpException`, not every integer in 400..599 — a refusal is a decision the
 * domain made, and the domain does not make 418s.
 */
export type RefusalStatus =
  | 400 | 401 | 403 | 404 | 405 | 409 | 410 | 415 | 422 | 423 | 429
  | 500 | 501 | 502 | 503 | 504;
```

and change `Spec.codes` to `readonly codes: Readonly<Record<string, RefusalStatus>>;`.

In `makeContract`'s `fail`, after the `status === undefined` guard:

```ts
      if (status < 400 || status > 599) {
        // Reachable only through a cast — the type refuses it — and worth a loud
        // throw rather than a silent 2xx that the adapter returns as a SUCCESS.
        throw new Error(
          `fail(${String(key)}): the code '${String(code)}' declares status ${status}, which is ` +
            `not a refusal status — the adapter would resolve the error envelope as a success`,
        );
      }
```

`status` is `number` inside the implementation (the generic `A` is unconstrained there), so the
comparison needs no cast. **`status < 400` is a relational comparison on a number, which
`agency/no-decimal-comparison` may flag** — if `pnpm lint` fires, put
`// oxlint-disable-next-line agency/no-decimal-comparison -- an HTTP status, not money` on the line,
with that reason. Do not disable the rule for the file.

- [ ] **Step 4: Run both and watch them pass**

```bash
pnpm typecheck && pnpm exec vitest run packages/mock/src/contract.test.ts && pnpm lint
```

- [ ] **Step 5: Make it a fast-tier row, not only a type**

A mock author may have a registry the root solution never compiles — `mocks/<slug>` is its own
project. In `scripts/verify/checks/contract-complete.mjs`'s `registryOf`, capture the status as well
as the name inside the `codes` loop:

```ts
              if (ts.isPropertyAssignment(c) && (ts.isIdentifier(c.name) || ts.isStringLiteral(c.name))) {
                codes[key].push(c.name.text);
                if (ts.isNumericLiteral(c.initializer)) {
                  const status = Number(c.initializer.text);
                  if (status < 400 || status > 599) badStatus.push(`${key}.${c.name.text}=${status}`);
                } else {
                  unreadableCodes.push(key);
                }
              } else {
```

Declare `const badStatus = [];` beside the others, return it, and push in `checkMock`:

```js
  for (const bad of badStatus) {
    problems.push(
      `${label}: ${bad} is not a refusal status. A 2xx there makes the adapter RETURN the error ` +
        `envelope as a success, so the screen receives it typed as the declared response.`,
    );
  }
```

- [ ] **Step 6: A `checks:bite` fixture, written and watched failing FIRST**

Add this to `DEFECTS` and `FIXTURES` **before** Step 5's edit if you have not made it yet; if you
have, revert Step 5 temporarily to watch the red, or run the fixture against
`git show HEAD:scripts/verify/checks/contract-complete.mjs` written to `.verify/tmp/` (node resolves
`typescript` by walking up from the module, so it must live under the repo).

```js
  'refusal-status-2xx': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'contract.ts');
    const src = readFileSync(file, 'utf8');
    const bad = src.replace('codes: { PARTY_NOT_FOUND: 404 },\n  }),\n  createParty:',
                            'codes: { PARTY_NOT_FOUND: 200 },\n  }),\n  createParty:');
    if (bad === src) throw new Error('refusal-status-2xx: the getParty codes object moved');
    writeFileSync(file, bad);
  },
```

```js
  { id: 'refusal-status-2xx', check: 'scripts/verify/checks/contract-complete.mjs', expect: 'not a refusal status' },
```

- [ ] **Step 7: Run everything and commit**

```bash
node scripts/verify/checks/checks-bite.mjs
pnpm verify:write && pnpm verify
```

Update the `contract:complete` row: its `blindSpot` currently ends "and the STATUS each code declares
is compared to nothing at all." That sentence becomes false — replace it with what is still true,
which is that the status is checked to be *a refusal status* and never compared to what the wire
actually carries (Task 2 closes that half).

```bash
git add packages/mock/src/contract.ts packages/mock/src/contract.controls.ts packages/mock/src/contract.test.ts scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs CLAUDE.md
git commit -F - -- packages/mock/src/contract.ts packages/mock/src/contract.controls.ts packages/mock/src/contract.test.ts scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs CLAUDE.md <<'MSG'
fix(contract): a refusal status is a 4xx or a 5xx, in the type and at runtime

MEASURED in the Phase 2 review: `codes: { PARTY_NOT_FOUND: 200 }` typechecked,
fail() threw DomainError(200, …), and the adapter's throwing branch is gated on
axios's validateStatus — which accepts 200. So the ERROR ENVELOPE was returned as
a success, and call() handed it to the screen typed as the declared response with
every field undefined and no error branch taken. No row noticed for any code the
template's page tests do not drive.

Three mechanisms, because each catches what the others cannot: `RefusalStatus`
refuses it at declaration; fail() throws loudly on the cast that evades the type;
and contract:complete reads the status VALUE off the AST, so a mocks/<slug> the
root solution never compiles is covered too.

CHECK CHANGES (HARD RULE 2 disclosure): contract:complete's blindSpot said "the
STATUS each code declares is compared to nothing at all". Half of that is now
false — the range IS checked. The other half stands and is restated: nothing
compares a declared status to the one the wire carries.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: `REFUSALS` — one drive per declared `(operation, code)` pair

This is `docs/intent.md` criterion 7 and the centre of the phase.

**Files:**
- Modify: `templates/mock/src/api/wire.golden.test.ts` — a `REFUSALS` table, a runtime exhaustiveness loop, and a `refusals` section in the fingerprint
- Modify: `templates/mock/src/api/wire.golden.json` — regenerate
- Modify: `scripts/verify/registry.mjs` — the `wire:frozen` row

**Interfaces:**
- Produces: `REFUSALS: { key: keyof typeof api; code: string; run: (c: AxiosInstance) => Promise<AxiosError> }[]`
- Produces: the golden JSON gains a `refusals` object keyed `"<operation>.<code>"`.

- [ ] **Step 1: Write the failing exhaustiveness test**

In `templates/mock/src/api/wire.golden.test.ts`, add above the existing describe:

```ts
/**
 * ONE DRIVE PER DECLARED (operation, code) PAIR.
 *
 * This is the half of the golden that makes it an INSTRUMENT rather than a record.
 * No type-level scheme survives a cast or a subtype-reduced branch — both residuals
 * are written down as live types in drift.controls.ts — so the only thing that can
 * establish what a refusal actually puts on the wire is driving it.
 */
const REFUSALS: { key: keyof typeof api; code: string; run: (c: AxiosInstance) => Promise<unknown> }[] = [
  {
    key: 'getParty',
    code: 'PARTY_NOT_FOUND',
    run: (c) => c.get('/parties/party-999999').then(() => null, (e: unknown) => e),
  },
  {
    key: 'createParty',
    code: 'PARTY_NAME_TAKEN',
    run: (c) =>
      c
        .post('/parties', { name: 'Anna Albrecht', company: 'x', address: 'y', balance: '1.00' })
        .then(() => null, (e: unknown) => e),
  },
  {
    key: 'createParty',
    code: 'PARTY_NAME_BLANK',
    run: (c) =>
      c.post('/parties', { name: '  ', company: 'x', address: 'y', balance: '1.00' })
        .then(() => null, (e: unknown) => e),
  },
  {
    key: 'createParty',
    code: 'PARTY_BALANCE_INVALID',
    run: (c) =>
      c.post('/parties', { name: 'Neu', company: 'x', address: 'y', balance: '1.5' })
        .then(() => null, (e: unknown) => e),
  },
  {
    key: 'renameParty',
    code: 'PARTY_NOT_FOUND',
    run: (c) => c.patch('/parties/party-999999', { name: 'X' }).then(() => null, (e: unknown) => e),
  },
  {
    key: 'renameParty',
    code: 'PARTY_NAME_TAKEN',
    run: (c) => c.patch('/parties/party-000001', { name: 'Bernd Cordes' }).then(() => null, (e: unknown) => e),
  },
  {
    key: 'renameParty',
    code: 'PARTY_NAME_BLANK',
    run: (c) => c.patch('/parties/party-000001', { name: '  ' }).then(() => null, (e: unknown) => e),
  },
  {
    key: 'removeParty',
    code: 'PARTY_NOT_FOUND',
    run: (c) => c.delete('/parties/party-999999').then(() => null, (e: unknown) => e),
  },
];
```

and, inside the existing `describe`:

```ts
  it('drives EVERY declared (operation, code) pair — the loop runs at RUNTIME', () => {
    /* AT RUNTIME, over Object.keys, and that is the point. A mapped type would name a
       missing pair earlier but a cast in the table evades it; Object.keys reads the
       registry object that actually ships. */
    const declared: string[] = [];
    for (const key of Object.keys(api)) {
      for (const code of Object.keys((api as Record<string, { codes: Record<string, number> }>)[key]!.codes)) {
        declared.push(`${key}.${code}`);
      }
    }
    const driven = REFUSALS.map((r) => `${String(r.key)}.${r.code}`);
    expect([...driven].sort(byCodepoint)).toEqual([...declared].sort(byCodepoint));
  });

  it('answers each declared code with the STATUS its registry entry names', async () => {
    for (const refusal of REFUSALS) {
      const err = (await refusal.run(client())) as { response?: { status?: number; data?: { code?: string } } };
      const declaredStatus = (api as Record<string, { codes: Record<string, number> }>)[
        String(refusal.key)
      ]!.codes[refusal.code];
      expect(err.response?.status).toBe(declaredStatus);
      expect(err.response?.data?.code).toBe(refusal.code);
    }
  });
```

`byCodepoint` is Task 4's comparator; until then use `(a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)` inline and replace it in Task 4.

- [ ] **Step 2: Run the template's tests and watch them fail**

The template compiles only inside a scaffolded mock until Task 5:

```bash
node packages/cli/bin/agency.mjs new p3a --title "Phase 3a" --locale de --profiles solo,full
pnpm install
pnpm --filter p3a test
```

Expected: FAIL. The exhaustiveness test fails first if any pair is missing from `REFUSALS`; the
status test fails if any refusal answers a status its entry does not name. **Quote the exact
mismatch** — the arrays it prints are the specification for what the table must contain.

- [ ] **Step 3: Fix the table until both pass, then fingerprint the envelope**

Add a `refusals` section to the committed shape, so the envelope's own structure is pinned the way
every success response already is:

```ts
  it('emits the committed wire shape for every route AND every refusal', async () => {
    const seen: Record<string, string[]> = {};
    for (const drive of DRIVES) {
      seen[drive.key] = shapeOf(await drive.run(client()));
    }
    const refusals: Record<string, string[]> = {};
    for (const refusal of REFUSALS) {
      const err = (await refusal.run(client())) as { response?: { data?: unknown } };
      refusals[`${String(refusal.key)}.${refusal.code}`] = shapeOf(err.response?.data);
    }

    if (WRITING) {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify({ ...seen, refusals }, null, 2)}\n`);
      return;
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, unknown>;
    expect({ ...seen, refusals }).toEqual(golden);
  });
```

Replace the existing "emits the committed wire shape for every route" test with this one — it is the
same assertion with the refusal half added. **Disclose that replacement in the commit.**

- [ ] **Step 4: Regenerate and READ THE DIFF**

```bash
cp templates/mock/src/api/wire.golden.test.ts mocks/p3a/src/api/
AGENCY_GOLDEN=write pnpm --filter p3a test
diff templates/mock/src/api/wire.golden.json mocks/p3a/src/api/wire.golden.json
```

Expected: one added `refusals` object with eight entries and **no change to any existing operation's
fingerprint**. If a success fingerprint moved, this task changed the wire and that is a finding.

Then copy the regenerated golden back into the template, remove the scratch mock, restore the
lockfile:

```bash
cp mocks/p3a/src/api/wire.golden.json templates/mock/src/api/wire.golden.json
rm -rf mocks/p3a && git checkout -- pnpm-lock.yaml
pnpm install --frozen-lockfile --offline
```

- [ ] **Step 5: Update the `wire:frozen` row and commit**

Its `blindSpot` says "an error envelope, a second page and every refusal path are unfingerprinted."
Two thirds of that is now false. Rewrite it to say the refusal paths ARE driven, one per declared
pair, with the `(status, code)` pair asserted — and that what remains unfingerprinted is a second
page, a transport failure (which declares no code and so has no pair), and the VALUES inside any
envelope.

```bash
pnpm verify:write && pnpm verify && pnpm verify:full
git add templates/mock/src/api/wire.golden.test.ts templates/mock/src/api/wire.golden.json scripts/verify/registry.mjs CLAUDE.md
git commit -F - -- templates/mock/src/api/wire.golden.test.ts templates/mock/src/api/wire.golden.json scripts/verify/registry.mjs CLAUDE.md <<'MSG'
feat(golden): one refusal drive per declared (operation, code) pair

docs/intent.md criterion 7. The golden stops being a record of the success paths
and becomes the instrument the design says it is: every declared code is driven
through the REAL adapter, its (status, code) pair asserted against the registry
entry that declared it, and its envelope fingerprinted.

THE EXHAUSTIVENESS LOOP RUNS AT RUNTIME, over Object.keys(api[key].codes), and
that is the whole point. A mapped type would name a missing pair earlier, but a
cast in the table evades it — and a cast is exactly the residual no type-level
scheme in this repo survives. Object.keys reads the object that actually ships.

This is what closes the gap the Phase 2 record named as the most likely site of
the next false green: a declared status is now compared to the one the wire
carries, for every declared code.

CHECK CHANGES (HARD RULE 2 disclosure): the golden's "emits the committed wire
shape for every route" test is REPLACED by one that fingerprints routes AND
refusals. Its route half is unchanged assertion-for-assertion; the refusal half is
new. wire:frozen's blindSpot said "an error envelope, a second page and every
refusal path are unfingerprinted" — two thirds of that is now false and it is
rewritten to what remains true.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: `DRIVES` go through `call()`, chained on a captured id

`DRIVES` uses raw verbs and the hard-coded `party-000001`. Going through `call()` makes the drives
typed against the same registry every screen is typed against, and chaining on an id captured from
`create` is the precondition for the live replay in Phase 4 — the product assigns UUIDs, so
`party-000001` does not exist there.

**Files:**
- Modify: `templates/mock/src/api/wire.golden.test.ts`
- Modify: `templates/mock/src/api/wire.golden.helpers.ts` if it needs to expose `transport`

**Interfaces:**
- Consumes: `call` and `transport` from Task 1's unchanged contract surface.
- Produces: `DRIVES` entries take a `Transport` and an id captured earlier in the chain.

- [ ] **Step 1: Write the failing test**

```ts
  it('drives every operation through call(), never a hand-written URL', () => {
    /* A raw verb in a drive is a second copy of the path, which is the thing the
       whole contract exists to remove — and the golden is the last place a URL
       could hide, because it is the one file that legitimately talks to the wire. */
    const source = readFileSync(`${HERE}/wire.golden.test.ts`, 'utf8');
    const drivesBlock = source.slice(source.indexOf('const DRIVES'), source.indexOf('const REFUSALS'));
    expect(drivesBlock).not.toMatch(/\.(get|post|patch|put|delete)\(/);
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter p3b test    # scaffold p3b as in Task 2 Step 2
```

Expected: FAIL — `expected '…c.get(\'/overview\')…' not to match /\.(get|post|patch|put|delete)\(/`.
Quote it.

- [ ] **Step 3: Rewrite `DRIVES` through `call()`**

```ts
const DRIVES: { key: keyof typeof api; run: (t: Transport, ids: Ids) => Promise<unknown> }[] = [
  { key: 'overview', run: (t) => call(t, 'overview', { params: {}, body: undefined }) },
  { key: 'listParties', run: (t) => call(t, 'listParties', { params: {}, body: undefined, qry: { page: '1', limit: '3' } }) },
  { key: 'exportParties', run: (t) => call(t, 'exportParties', { params: {}, body: undefined }) },
  { key: 'getParty', run: (t, ids) => call(t, 'getParty', { params: { id: ids.seeded }, body: undefined }) },
  {
    key: 'createParty',
    run: (t) =>
      call(t, 'createParty', {
        params: {},
        body: { name: 'Neu Angelegt', company: 'Neu GmbH', address: 'Hauptstrasse 1, Fulda', balance: '10.00' },
      }),
  },
  { key: 'renameParty', run: (t, ids) => call(t, 'renameParty', { params: { id: ids.seeded }, body: { name: 'Umbenannt' } }) },
  { key: 'removeParty', run: (t, ids) => call(t, 'removeParty', { params: { id: ids.removable }, body: undefined }) },
];

/**
 * The ids come from the STORE, not from a literal. `party-000001` is what this
 * mock's `seq()` assigns; the product assigns UUIDs, so a golden that hard-codes the
 * sequence id cannot be replayed against a live API — which is exactly what Phase 4's
 * AGENCY_LIVE_API replay needs.
 */
type Ids = { seeded: string; removable: string };

async function idsFrom(t: Transport): Promise<Ids> {
  const page = await call(t, 'listParties', { params: {}, body: undefined, qry: { limit: '99' } });
  const [first, second] = page.data;
  if (!first || !second) throw new Error('the seed must carry at least two rows for the golden to chain');
  return { seeded: first.id, removable: second.id };
}
```

and each drive gets a fresh client plus its own `ids`, exactly as it gets a fresh client today.

- [ ] **Step 4: Run, regenerate, read the diff**

The fingerprints must be **byte-identical** to before: `call()` returns `res.data`, which is what the
raw verbs returned. If any fingerprint moves, `call()` is doing something the raw verb did not, and
that is a finding worth stopping on.

- [ ] **Step 5: Commit**

```bash
git add templates/mock/src/api/wire.golden.test.ts templates/mock/src/api/wire.golden.json
git commit -F - -- templates/mock/src/api/wire.golden.test.ts templates/mock/src/api/wire.golden.json <<'MSG'
refactor(golden): drives go through call(), chained on a captured id

A raw verb in a drive is a second copy of the path — the thing the contract exists
to remove — and the golden was the last place one could hide. Every drive now goes
through call() with a typed operation key, so the golden is typed against the same
registry every screen is.

The ids come from the store rather than from `party-000001`. That literal is what
this mock's seq() assigns; the product assigns UUIDs, so a golden hard-coding it
cannot be replayed against a live API. This is the precondition for Phase 4's
AGENCY_LIVE_API replay, done now because the drives were being rewritten anyway.

Every fingerprint is byte-identical to before, which is the check that this is a
refactor: call() returns res.data, which is what the raw verbs returned.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: The codepoint comparator, and the ICU tripwire

`localeCompare` is ICU-dependent: the same array sorts differently on a machine with a different ICU
build, and node can be compiled `small-icu`. A golden that sorts with it is a golden that can differ
between a developer's machine and CI for reasons that have nothing to do with the code — which is the
host-not-code failure `docs/BUILD-REPORT.md` already records twice.

**Files:**
- Modify: `templates/mock/src/api/wire.golden.test.ts` — replace `localeCompare`
- Create: `packages/mock/src/order.ts` — `byCodepoint`
- Create: `packages/mock/src/order.test.ts`
- Modify: `packages/mock/src/index.ts` — export it

**Interfaces:**
- Produces: `export const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);`

- [ ] **Step 1: Write the failing test**

`packages/mock/src/order.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { byCodepoint } from './order';

describe('byCodepoint is the comparator a SQL ORDER BY can reproduce', () => {
  it('orders by code point, not by locale collation', () => {
    // MEASURED: with the default ICU collation 'a'.localeCompare('B') is -1;
    // by code point 'B' (0x42) precedes 'a' (0x61). A Postgres ORDER BY under the
    // C collation agrees with the code point, not with ICU.
    expect(['a', 'B'].sort(byCodepoint)).toEqual(['B', 'a']);
  });

  it('is stable for equal strings', () => {
    expect(byCodepoint('x', 'x')).toBe(0);
  });

  it('does not depend on the ICU build node was compiled with', () => {
    // The tripwire. If this ever fails, node's ICU is being consulted somewhere it
    // should not be, and every golden that sorts is host-dependent.
    expect(['ä', 'z'].sort(byCodepoint)).toEqual(['z', 'ä']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec vitest run packages/mock/src/order.test.ts
```

Expected: FAIL — `Cannot find module './order'`. Quote it.

- [ ] **Step 3: Implement, export, and replace every `localeCompare` in a golden**

```ts
/**
 * Order by CODE POINT, never by locale. `localeCompare` consults ICU, and node can
 * be compiled `small-icu` — so the same array sorts differently on two machines and
 * a golden that sorts with it differs between a laptop and CI for reasons that have
 * nothing to do with the code. That is the host-not-code failure docs/BUILD-REPORT.md
 * records twice already.
 *
 * It is also what a SQL `ORDER BY` under the C collation does, so an ordering the
 * mock demonstrates is one the product can reproduce.
 */
// oxlint-disable-next-line agency/no-decimal-comparison -- ordering two strings, not comparing money
export const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
```

Then `grep -rn "localeCompare" templates packages | grep -v node_modules` must return nothing, and
every site uses `byCodepoint`.

- [ ] **Step 4: Run everything and commit**

```bash
pnpm verify
git add packages/mock/src/order.ts packages/mock/src/order.test.ts packages/mock/src/index.ts templates/mock/src/api/wire.golden.test.ts
git commit -F - -- packages/mock/src/order.ts packages/mock/src/order.test.ts packages/mock/src/index.ts templates/mock/src/api/wire.golden.test.ts <<'MSG'
fix(golden): sort by code point, never by ICU collation

`localeCompare` consults ICU and node can be compiled small-icu, so a golden that
sorts with it can differ between a laptop and CI for reasons that have nothing to
do with the code — the host-not-code failure docs/BUILD-REPORT.md records twice.

byCodepoint is also what a SQL ORDER BY under the C collation does, so an ordering
the mock demonstrates is one the product reproduces. Three tests, one of them a
tripwire that goes red if ICU is ever consulted again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: The template's tests and tripwires run in the FAST tier

`docs/intent.md` criterion 8. Today the template's 467 test lines and every `@ts-expect-error` in
`drift.controls.ts` are compiled and run **only** by the full tier's `build` row, on a scaffolded
mock — so every Phase 1 and Phase 2 task in this rework had to scaffold, install and build a mock by
hand to see whether a control still bit. That is a two-minute feedback loop on the files that carry
the most guarantees.

**THIS IS THE APPROVED `pnpm add`.** See the constraint note at the top.

**Files:**
- Modify: `package.json` (root) — devDependencies
- Modify: `vitest.config.ts` — collect `templates/mock/src/**`
- Modify: `tsconfig.json` / a new `templates/mock/tsconfig.check.json` — put the template in the solution
- Create: `packages/cli/src/template-deps.contract.test.ts` — the range-parity assertion
- Modify: `scripts/verify/registry.mjs` — `test:parity`'s walk, and the row descriptions

**Interfaces:**
- Produces: a root devDependency set that is a superset of `templates/mock/package.json.hbs`'s
  devDependencies, with **identical ranges**, asserted by a test.

- [ ] **Step 1: Write the range-parity test FIRST**

This is the guard that makes the install safe to keep. Without it the root and the template drift and
a mock is built against a different `vitest` than the one that vetted its tests.

`packages/cli/src/template-deps.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The root installs what the template needs so the template's tests can run in the
 * FAST tier. That is only safe while the RANGES agree: a mock built against a
 * different vitest than the one that vetted its tests is a mock whose tests proved
 * something about a different program.
 */
describe('the root and the template agree about every shared dependency', () => {
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>;
  };
  const template = JSON.parse(
    readFileSync(join(ROOT, 'templates', 'mock', 'package.json.hbs'), 'utf8'),
  ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

  const shipped = { ...template.dependencies, ...template.devDependencies };

  it('installs every non-workspace dependency the template declares', () => {
    const missing = Object.keys(shipped)
      .filter((name) => !shipped[name]!.startsWith('workspace:'))
      .filter((name) => root.devDependencies[name] === undefined);
    expect(missing).toEqual([]);
  });

  it('installs it at the SAME range, so the tests vet the program the mock gets', () => {
    const drifted = Object.entries(shipped)
      .filter(([, range]) => !range.startsWith('workspace:'))
      .filter(([name, range]) => root.devDependencies[name] !== range)
      .map(([name, range]) => `${name}: template ${range}, root ${root.devDependencies[name]}`);
    expect(drifted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm exec vitest run packages/cli/src/template-deps.contract.test.ts
```

Expected: FAIL, listing every name the root lacks. **That list is the exact install command** —
quote it, and install nothing the list does not name.

- [ ] **Step 3: Install exactly what the list named**

```bash
pnpm add -Dw <every name the test listed, at the template's range>
```

The measurement on 2026-09-13 was that the root already carries `@testing-library/*`, `@types/*`,
`@vitejs/plugin-react`, `axios`, `jsdom`, `react`, `react-dom`, `typescript` and `vitest`, so the
list should be short — `@tanstack/react-query`, `react-router`, `zustand`, `@tailwindcss/vite`,
`tailwindcss`, `tw-animate-css`, `vite` — plus the four `@agency/*` workspace links
(`pnpm add -Dw @agency/dec@workspace:* @agency/kit@workspace:* @agency/mock@workspace:* @agency/synth@workspace:*`).

**If the list is longer than that, stop and report it before installing.** A surprise there means the
template gained a dependency nobody recorded, and installing it silently is how a `dependencies` entry
HARD RULE 6 forbids would enter the root unnoticed.

- [ ] **Step 4: Collect the template's tests, and compile its controls**

In `vitest.config.ts`, add `templates/mock/src/**/*.test.{ts,tsx}` to the DOM project's include (the
pages are React) and `templates/mock/src/**/*.test.ts` to node — **or**, simpler and less error-prone,
add it to `DOM` and let `test:parity` tell you if the partition is wrong. Run `pnpm verify` and read
`test:parity`'s verdict; it exists exactly to catch a file collected zero or twice.

Add a `templates/mock/tsconfig.check.json` that includes `src` and is referenced from the root
solution, so `tsc -b --force` compiles `drift.controls.ts` in the fast tier. It must set
`"noEmit": true` and an `outDir` under `node_modules/.cache/tsc/` — `emit:clean` is red the moment a
`.d.ts` lands beside a source, and that row already caught a subagent doing exactly this.

- [ ] **Step 5: Run both tiers**

```bash
pnpm verify
pnpm verify:full
```

Expected: fast tier now runs the template's tests and compiles its controls; `test` and `test:parity`
counts both rise; `typecheck` compiles more files. **`build` must still pass** — the scaffolded mock
compiles the same files with its own tsconfig, and if the two disagree that is a finding.

- [ ] **Step 6: Update the rows and commit**

`typecheck`'s `blindSpot` says "Says nothing about mocks/<slug>, which are their own projects outside
the solution". Still true. But `contract:controls`'s says "The template half is structural only:
nothing here compiles templates/mock" — that becomes **false** and must be rewritten. So does the
fast tier's own gap list in `CLAUDE.md`: "It says nothing about a mock you have already scaffolded"
stays, but the template is no longer in that category.

```bash
pnpm verify:write && pnpm verify
git add package.json pnpm-lock.yaml vitest.config.ts tsconfig.json templates/mock/tsconfig.check.json packages/cli/src/template-deps.contract.test.ts scripts/verify/registry.mjs CLAUDE.md
git commit -F - -- package.json pnpm-lock.yaml vitest.config.ts tsconfig.json templates/mock/tsconfig.check.json packages/cli/src/template-deps.contract.test.ts scripts/verify/registry.mjs CLAUDE.md <<'MSG'
feat(verify): the template's tests and tripwires run in the fast tier

docs/intent.md criterion 8. The template carries the most guarantees in this repo —
467 test lines and every @ts-expect-error in drift.controls.ts — and until now the
only thing that compiled or ran them was the full tier's `build` row, on a mock
scaffolded and installed from scratch. Every task in this rework that touched a
control had to scaffold, install and build by hand to find out whether it still
bit: a two-minute loop on the files that matter most.

THE APPROVED pnpm add. CLAUDE.md's stop-list says not to install; the repository
owner authorised this specific install on 2026-09-13, and it is the only one in the
four phases. Root devDependencies only — no mock gains a dependency, and HARD
RULE 6's forbidden list gains no member.

The range-parity test was written and watched failing FIRST, and its failure
output IS the install list. It is what keeps the install safe to have: a mock built
against a different vitest than the one that vetted its tests is a mock whose
tests proved something about a different program.

CHECK CHANGES (HARD RULE 2 disclosure): contract:controls' blindSpot said "The
template half is structural only: nothing here compiles templates/mock". That is
now false and is rewritten. CLAUDE.md's fast-tier gap list is corrected the same
way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: `seam:settle` — the memo's one shell command becomes a row

`CLAUDE.md` carries `grep -c settle node_modules/axios/lib/core/dispatchRequest.js # must be 0` as
*prose with an instruction to run it*. The governing rule at the top of that same file says a standard
propagates as a check or not at all. This is the clearest violation of it in the repo, and it guards
the single fact the whole seam rests on: a custom adapter owns status handling, so **an adapter that
resolves a 409 delivers it to TanStack Query as a success**.

**Files:**
- Create: `scripts/verify/checks/seam-settle.mjs`
- Modify: `scripts/verify/registry.mjs`
- Modify: `CLAUDE.md` — the prose becomes a reference to the row
- Modify: `scripts/verify/checks/checks-bite.mjs` — one defect, one fixture

- [ ] **Step 1: Write the fixture first**

The defect: a fabricated `node_modules/axios/lib/core/dispatchRequest.js` that DOES reference
`settle`. `checks:bite` derives `templates/` only, so this fixture needs the check to accept `--root`
and look under `<root>/node_modules/...`; write the defect to create that file in the derived tree.

```js
  'axios-settles-itself': (root) => {
    const dir = path.join(root, 'node_modules', 'axios', 'lib', 'core');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'dispatchRequest.js'), 'import settle from "./settle.js";\n');
  },
```

```js
  { id: 'axios-settles-itself', check: 'scripts/verify/checks/seam-settle.mjs', expect: 'settle' },
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node scripts/verify/checks/checks-bite.mjs --only axios-settles-itself
```

Expected: exit 1 — the harness cannot even run the check, because `seam-settle.mjs` does not exist.
Quote it.

- [ ] **Step 3: Write the check**

```js
#!/usr/bin/env node
/**
 * A CUSTOM AXIOS ADAPTER OWNS STATUS HANDLING, and the whole seam rests on it.
 *
 * Verified in axios 1.20.0: dispatchRequest.js calls `adapter(config).then(...)` and
 * contains ZERO references to `settle` — which is where `validateStatus` lives and
 * which each BUILT-IN adapter calls itself. So the mock adapter must throw on a
 * refusal, and one that resolves a 409 delivers it to TanStack Query as a SUCCESS:
 * the error branch never runs, the screen renders undefined, nothing is red.
 *
 * This was prose in CLAUDE.md with an instruction to run it by hand. The governing
 * rule in that same file says a standard propagates as a check or not at all.
 *
 *   node scripts/verify/checks/seam-settle.mjs [--root DIR]
 */
```

It must report SKIPPED (exit `skipExit`) when `node_modules/axios` is absent — a fresh checkout
before `pnpm install` has no axios, and reporting FAILED there would assert something about axios that
was never read. Use the registry's `skipExit` so the status is `SKIPPED`, never folded into a pass.

- [ ] **Step 4: Add the row, delete the prose, run everything**

The row's `proves` must be falsifiable by this exact command: that `dispatchRequest.js` exists and
contains no `settle` reference. Its `blindSpot` must say it greps ONE file for ONE token — it does not
read what the adapter does with the status, and a refactor that moves `settle` into a differently
named module is invisible.

In `CLAUDE.md`, the shell block becomes a sentence naming the row, so the memo documents a check
instead of substituting for one.

- [ ] **Step 5: Commit**

```bash
pnpm verify:write && pnpm verify
git add scripts/verify/checks/seam-settle.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs CLAUDE.md
git commit -F - -- scripts/verify/checks/seam-settle.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs CLAUDE.md <<'MSG'
feat(verify): seam:settle — the memo's one shell command becomes a row

CLAUDE.md carried `grep -c settle … # must be 0` as prose with an instruction to
run it by hand, in a file whose first rule is that a standard propagates as
something the scaffolder writes or a check that goes red, never as prose. It was
the clearest violation of that rule in the repo, and it guards the single fact the
seam rests on: a custom adapter owns status handling, so one that resolves a 409
delivers it to TanStack Query as a success.

SKIPPED, not FAILED, when node_modules/axios is absent: a fresh checkout before
install has no axios, and reporting FAILED there asserts something about axios
that was never read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: Narrow `contract:complete`'s literal clause

Now — and only now — that the golden drives every declared code, the literal clause can say what it
actually establishes.

**Files:**
- Modify: `scripts/verify/checks/contract-complete.mjs`
- Modify: `scripts/verify/registry.mjs`

- [ ] **Step 1: Decide, and write the decision down**

Two options, and this step is choosing between them **with a reason**, not implementing both:

- **(a) Delete the clause.** The golden now proves each code can be emitted, by emitting it. A
  literal match under `src/` proves strictly less and can be satisfied by a comment.
- **(b) Keep it, narrowed to `fail()` call sites.** The golden covers `templates/mock` and every
  scaffolded `mocks/<slug>` only through the full tier; a mock whose golden nobody runs still gets
  the fast-tier literal clause.

**Choose (b) unless measurement says otherwise**, because `wire:frozen` is a FULL-tier row and this is
a FAST-tier one — deleting a fast signal because a slow one covers it is how `api:bound`'s
`after: ['typecheck']` hid an undeclared operation for a whole phase. Narrow the match from "anywhere
under src/" to "an argument of a `fail()` call whose first argument is that operation" — which is
what the clause has always claimed and never done.

- [ ] **Step 2: Write the fixture first**

```js
  'code-declared-but-never-failed': (root) => {
    // The code stays in the registry; its fail() site is deleted. A comment
    // mentioning the literal remains, so only a call-site-anchored clause catches it.
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'routes.ts');
    const src = readFileSync(file, 'utf8');
    const gutted = src.replace(
      "      if (!row) fail('getParty', 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });",
      "      // PARTY_NOT_FOUND used to be raised here.\n      if (!row) throw new Error('gone');",
    );
    if (gutted === src) throw new Error('code-declared-but-never-failed: the getParty refusal moved');
    writeFileSync(file, gutted);
  },
```

```js
  { id: 'code-declared-but-never-failed', check: 'scripts/verify/checks/contract-complete.mjs', expect: 'PARTY_NOT_FOUND' },
```

- [ ] **Step 3: Watch it fail, then anchor the clause**

Expected: `did not go red on a planted defect` — the comment satisfies the literal match. That IS the
defect the design recorded and nobody had reproduced. Quote it.

Then anchor: collect, per operation, the codes that appear as an argument of a `fail(...)` call whose
FIRST argument is that operation's key — plus the codes a rule returns, which reach `fail` as
`blank.code`. The rules declare singleton literal types (`Refusal<'PARTY_NAME_BLANK'>`), so a
call-site-anchored clause must still accept an identifier argument and fall back to the literal
search for that one case. **Say so in the `blindSpot`** rather than pretending the anchor is total.

- [ ] **Step 4: Run everything and commit, updating both rows**

---

### Task 8: The memo and the phase record

- [ ] **Step 1: Rewrite what Phase 3 made false in `CLAUDE.md`**

At minimum: the fast tier's gap list (the template is now in it), the `grep -c settle` block (now a
row), the contract section's account of what the golden does, and `docs/intent.md`'s criteria 7 and 8
are now met — say so, with the mechanism that meets them.

- [ ] **Step 2: Append the Phase 3 record to `docs/BUILD-REPORT.md`**

Same shape as Phases 1 and 2: what was measured, what a check should have caught and didn't, and what
is still open. The items still open at the end of Phase 3 are: both exactness residuals (permanent);
the golden drives each operation ONCE with one actor, so a capability-gated branch is fingerprinted
only for the actor it uses; `checks:bite` still covers a minority of rows; and no coverage or mutation
testing.

- [ ] **Step 3: Run both tiers, then commit**

```bash
pnpm verify:write && pnpm verify && pnpm verify:full
```

---

## Self-review

**Spec coverage.** Design §6 Phase 3 lists four steps. Step 12 (`DRIVES` through `call()`, chained) →
Task 3. Step 13 (`REFUSALS` + runtime exhaustiveness; narrow the literal clause) → Tasks 2 and 7,
split because the golden must prove emission before the clause that duplicates it can be narrowed, and
a reviewer could accept one and reject the other. Step 14 (fast tier + the approved `pnpm add`) →
Task 5. Step 15 (codepoint comparator + ICU tripwire, `.verify` run-id nonce, `seam:settle`) → Tasks
4 and 6. **Task 1 is not in the design**: it comes from the Phase 2 review, which measured that a 2xx
refusal status resolves as a success, and it is first because Task 2's drives would otherwise be
written against a registry that still permits one. **The `.verify` run-id nonce is deliberately not
implemented**: `--reuse-if-fresh` already hashes every file that could change a verdict, and nothing
measured says the nonce closes a gap that hashing leaves — building it would be a mechanism with no
recorded failure behind it, which is the thing SPEC §14 rejects. Recorded here rather than silently
dropped.

**Type consistency.** `RefusalStatus` is introduced in Task 1 and `Spec.codes` uses it from then on.
`byCodepoint` is introduced in Task 4 and Task 2 explicitly uses an inline comparator until then.
`Transport` and `call` are Phase 1 surface and unchanged. `Ids` is local to the golden.

**Known risk, recorded rather than hidden.** Task 5 changes what the fast tier compiles and runs, so
it changes the meaning of every green after it. If the template's tests are slow the Stop hook gets
slower on every turn, and a slow gate is a gate someone switches off — SPEC §17's abandon signal. If
the fast tier goes past ~30s, say so in the report and propose moving the page tests (the jsdom ones)
back out rather than accepting it silently.

## What comes next

Phase 4 gets its own plan, written only after Phase 3 is green, reviewed and recorded. Its three
steps — `shape()` body validation, `makeQueries`, and the `AGENCY_LIVE_API` replay — each depend on
something this phase builds: the replay in particular needs Task 3's captured ids, because the product
assigns UUIDs and a golden that hard-codes `party-000001` cannot be replayed at all.
