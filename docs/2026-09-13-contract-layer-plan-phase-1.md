# Contract Layer Phase 1 — Stop the False Greens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every guarantee the contract layer claims either true or deleted — starting with a row that proves each check can actually go red.

**Architecture:** Exactness moves out of every handler body and into one scaffolder-written line at `toRoutes`, where a wide return is a compile error naming the operation. The two AST checks stop passing silently over a mock that has no contract. The adapter stops inventing error codes the real Nest filter never sends, so `codeOf`'s closed set becomes closed. Each of those is introduced by a fixture in a new `checks:bite` row that plants one defect and demands a red — so the check that catches the bug is written and watched failing before the bug is fixed.

**Tech Stack:** TypeScript 6.0.3 (`tsc -b --force`), node 24 (`.nvmrc`), pnpm workspaces, vitest 4 (two projects: node + dom), oxlint 1.82 with a custom JS plugin, axios 1.20 custom adapter.

**Spec:** `docs/2026-09-13-contract-layer-design.md` — the plan argues from it; read §2 (the eight decisions), §4 (the generic core signatures) and §8 (every existing assertion that changes) before Task 1.

**Intent:** `docs/intent.md` — why, and the nine success criteria.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `CLAUDE.md` and `docs/SPEC.md`.

- **Node:** the interpreter must satisfy `.nvmrc` (major **24**). The shell default here is node 22. Hooks resolve it via `.claude/hooks/node.sh`; for a manual run, `export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH`.
- **TDD, always.** Failing test, run it, watch it fail *for the stated reason*, then implement. If you cannot quote the red output, you did not watch it.
- **Never weaken a check to go green.** No editing a rule, no ignore, no `it.skip`. If a check is genuinely wrong, say so in your report and leave it failing. `docs/SPEC.md` §17 names "the operator disables a row rather than fixing what it caught" as the signal to abandon the whole strategy.
- **No new runtime dependencies.** Forbidden in a mock's `dependencies`: `msw`, `@mswjs/data`, `@electric-sql/pglite`, `zod`, `i18next`, `react-i18next`. This plan adds **no** dependency of any kind.
- **Money is decimal strings.** `packages/dec/src/dec.ts` is the only module allowed to do the arithmetic. No `Number()`, `parseFloat`, `toFixed`, no float, no integer minor units.
- **Ids are `seq()` or a ULID, store-assigned.** Never `Math.random()`, never implicit array order.
- **Branch on `code` only** — `error` is the canonical HTTP phrase and is decorative. Pagination is `{ data, total, page, limit }`.
- **`reference/` is read-only**, and the sibling repos under `/Users/oleksandrsecond/Projects/` are live. Read them, cite them, never write to either.
- **Never `git reset --hard`, `git clean`, or `git checkout .`.** Other agents share this tree: commit with an explicit pathspec — `git add <paths> && git commit -F - -- <paths>`.
- **An oxlint exemption goes on the line it excuses, not on the file:** `// oxlint-disable-next-line agency/<rule> -- why`. A whole-file `overrides` entry is the last resort and is ratcheted against `scripts/verify/baselines/lint-exempt.json`.
- **After editing `scripts/verify/registry.mjs`, run `pnpm verify:write`** or `memo:drift` goes red — it compares the CLAUDE.md table byte-for-byte against a digest of the raw `proves`/`blindSpot` strings.
- **`pnpm verify` must be green before a turn ends.** `.claude/hooks/stop-gate.mjs` blocks on red.
- **Report the status you got**, one of `PASSED` / `FAILED` / `SKIPPED` / `NOT_RUN` / `UNRUNNABLE`. They never collapse into each other.

## Precondition — do this before Task 1

Eight symlinks under `node_modules` are self-loops (`@types/{node,react,react-dom}`, `@testing-library/{dom,jest-dom,react,user-event}`, `@vitejs/plugin-react`), so `pnpm verify` is red for reasons unrelated to any file in this repo: 14× TS2883, 2× TS2688, and every DOM test.

```bash
pnpm install --frozen-lockfile --offline
pnpm verify          # must be 12 PASSED before Task 1 begins
```

If it is not 12 PASSED, stop and report which of the five statuses you got. Nothing in this plan can be watched failing against a tree that is already failing.

---

### Task 1: `checks:bite` — a row that proves a check can fail

Fourteen checks exist and none has ever been observed going red. This task builds the harness and proves it on two defects the checks **already** catch, so the harness itself is trusted before it is used to find bugs. Tasks 2, 3, 5 and 7 each add their own fixture as their failing test.

**Files:**
- Create: `scripts/verify/checks/checks-bite.mjs`
- Create: `packages/cli/src/checks-bite.contract.test.ts`
- Modify: `scripts/verify/registry.mjs` (add one row; see step 6)

**Interfaces:**
- Produces: `plant(root: string, defectId: string): void` — mutates a copied tree in place, throws on an unknown id.
- Produces: `FIXTURES: ReadonlyArray<{ id: string, check: string, expect: string }>` — `check` is a path relative to the repo root, `expect` a substring required in the failing output.
- Produces: `runFixture(fixture, opts?: { check?: string }): Promise<{ ok: boolean, report: string }>` — `opts.check` overrides the check binary, used only by the test.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/checks-bite.contract.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES, runFixture } from '../../../scripts/verify/checks/checks-bite.mjs';

describe('checks:bite tells a biting check from a green one', () => {
  it('FAILS a check that cannot fail', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bite-stub-'));
    const alwaysGreen = path.join(dir, 'always-green.mjs');
    writeFileSync(alwaysGreen, 'process.exit(0)\n');

    const fixture = FIXTURES.find((f) => f.id === 'handler-removed');
    expect(fixture).toBeDefined();

    const result = await runFixture(fixture!, { check: alwaysGreen });

    expect(result.ok).toBe(false);
    expect(result.report).toContain('did not go red');
  });

  it('PASSES a check that goes red on its own defect', async () => {
    const fixture = FIXTURES.find((f) => f.id === 'handler-removed');
    const result = await runFixture(fixture!);

    expect(result.ok).toBe(true);
  });

  it('refuses an unknown defect id rather than planting nothing', async () => {
    await expect(runFixture({ id: 'no-such-defect', check: 'scripts/verify/checks/contract-complete.mjs', expect: 'x' }))
      .rejects.toThrow(/unknown defect/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail for the stated reason**

```bash
export PATH=/Users/oleksandrsecond/.nvm/versions/node/v24.21.0/bin:$PATH
pnpm exec vitest run packages/cli/src/checks-bite.contract.test.ts
```

Expected: FAIL — `Failed to resolve import ".../checks-bite.mjs"`. That is the correct red: the module does not exist yet. Quote it in your report.

- [ ] **Step 3: Write the harness**

Create `scripts/verify/checks/checks-bite.mjs`:

```js
/**
 * Every check must be able to go red. This row derives a tree from templates/mock,
 * plants exactly ONE defect, runs one check against it, and requires exit 1 with an
 * expected substring. A check that stays green on its own defect is the artifact this
 * whole layer exists to prevent — packages/dec/golden.json asserted `dec === dec` for
 * 675 cases and was green throughout.
 *
 * Usage:
 *   node scripts/verify/checks/checks-bite.mjs [--only <fixture-id>]
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** Each defect is ONE edit. Two edits and a green no longer names a cause. */
const DEFECTS = {
  'handler-removed': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'routes.ts');
    const src = readFileSync(file, 'utf8');
    const cut = src.replace(/\n {4}getParty: \(c\) => \{[\s\S]*?\n {4}\},\n/, '\n');
    if (cut === src) throw new Error('handler-removed: the getParty handler shape moved; update this defect');
    writeFileSync(file, cut);
  },
  'tautological-control': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'drift.controls.ts');
    writeFileSync(
      file,
      `${readFileSync(file, 'utf8')}\nexport type Tautology = Expect<Equal<{ a: string }, { a: string }>>;\n`,
    );
  },
};

export const FIXTURES = [
  {
    id: 'handler-removed',
    check: 'scripts/verify/checks/contract-complete.mjs',
    expect: 'getParty',
  },
  {
    id: 'tautological-control',
    check: 'scripts/verify/checks/contract-controls.mjs',
    expect: 'tautolog',
  },
];

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    child.on('close', (code) => resolve({ code, out }));
  });
}

export async function runFixture(fixture, opts = {}) {
  const plant = DEFECTS[fixture.id];
  if (!plant) throw new Error(`checks:bite: unknown defect '${fixture.id}'`);

  const dir = mkdtempSync(path.join(tmpdir(), `bite-${fixture.id}-`));
  try {
    cpSync(path.join(ROOT, 'templates'), path.join(dir, 'templates'), { recursive: true });
    plant(dir);

    const check = path.resolve(ROOT, opts.check ?? fixture.check);
    const { code, out } = await run(process.execPath, [check, '--root', dir], ROOT);

    if (code === 0) {
      return { ok: false, report: `${fixture.id}: ${fixture.check} did not go red on a planted defect` };
    }
    if (!out.includes(fixture.expect)) {
      return {
        ok: false,
        report: `${fixture.id}: went red, but the output never mentions '${fixture.expect}' — it may be red for an unrelated reason:\n${out}`,
      };
    }
    return { ok: true, report: `${fixture.id}: red, and names '${fixture.expect}'` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const at = process.argv.indexOf('--only');
  const only = at === -1 ? null : process.argv[at + 1];
  const fixtures = only ? FIXTURES.filter((f) => f.id === only) : FIXTURES;

  const results = await Promise.all(fixtures.map((f) => runFixture(f)));
  for (const r of results) process.stderr.write(`${r.report}\n`);

  const bad = results.filter((r) => !r.ok).length;
  if (bad > 0) {
    process.stderr.write(`checks:bite: ${bad} of ${results.length} check(s) did not bite\n`);
    process.exit(1);
  }
  process.stderr.write(`checks:bite: ${results.length} check(s) went red on a planted defect\n`);
}

if (import.meta.filename === process.argv[1]) await main();
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm exec vitest run packages/cli/src/checks-bite.contract.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Run the harness directly and read every line**

```bash
node scripts/verify/checks/checks-bite.mjs
```

Expected: exit 0, two lines each reading `red, and names '…'`. **If either fixture reports "did not go red", stop and report it — that is a real finding about an existing check, not a bug in this harness.**

- [ ] **Step 6: Add the registry row**

In `scripts/verify/registry.mjs`, add this row **after** `contract:controls` (`after` is positional in this runner, not a dependency graph — a row declared above its dependency is reported NOT_RUN even when the dependency passes; `docs/BUILD-REPORT.md:279` records that measurement):

```js
  {
    id: 'checks:bite',
    tier: 'fast',
    cmd: 'node scripts/verify/checks/checks-bite.mjs',
    proves:
      'Each check named in the fixture table exits non-zero, and mentions the planted symbol, when ' +
      'run against a tree derived from templates/mock with exactly ONE defect planted in it. Every ' +
      'other row in this table asserts that something is true when the check passes; this is the ' +
      'only row that establishes the check could ever have failed.',
    blindSpot:
      'It proves a check is red on THE ONE defect its fixture plants, never that the check is red on ' +
      'every defect of that class, and a check with no fixture here is entirely unexamined. The ' +
      'fixture derives from templates/mock only, so nothing is established about mocks/<slug>. It ' +
      'matches a substring of the output, so a check that goes red for an unrelated reason while ' +
      'happening to print that substring is counted as biting.',
  },
```

- [ ] **Step 7: Regenerate the memo table and run the tier**

```bash
pnpm verify:write
pnpm verify
```

Expected: 13 PASSED (the twelve that passed before, plus `checks:bite`), exit 0. `memo:drift` must be PASSED — if it is FAILED you did not run `verify:write`.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify/checks/checks-bite.mjs packages/cli/src/checks-bite.contract.test.ts scripts/verify/registry.mjs CLAUDE.md
git commit -F - -- scripts/verify/checks/checks-bite.mjs packages/cli/src/checks-bite.contract.test.ts scripts/verify/registry.mjs CLAUDE.md <<'MSG'
feat(verify): checks:bite — a row that proves a check can go red

Fourteen checks existed and not one had ever been observed failing. The row
derives a tree from templates/mock, plants exactly one defect, and requires the
check to exit non-zero AND name the planted symbol.

Two fixtures to start, both on defects the checks already catch, so the harness
is trusted before it is used to find bugs: a removed handler (contract:complete)
and a tautological Equal<X, X> (contract:controls).

This is the packages/dec/golden.json failure one level up — 675 cases asserting
dec === dec, green throughout.

pnpm verify  13 PASSED, exit 0
MSG
```

---

### Task 2: An absent contract is red, and `checked` counts what it parsed

Both AST checks return early with no problem pushed when `src/api/contract.ts` is absent, and increment `checked` anyway. A fabricated root with a contract-less mock exits 0 from both, reporting "2 contract(s)". This makes **CLAUDE.md decision 4 false**: hoisting the registry into a shared package does not turn two rows red.

**Files:**
- Modify: `scripts/verify/checks/api-bound.mjs:127` (the early return), `:167-186` (the `checked` counter and the `checked === 0` guard)
- Modify: `scripts/verify/checks/contract-complete.mjs:139` (the early return), `:194-214` (same two)
- Modify: `scripts/verify/checks/checks-bite.mjs` (add the `contract-deleted` defect and two fixtures)
- Modify: `CLAUDE.md` (decision 4)

**Interfaces:**
- Consumes: `DEFECTS`, `FIXTURES`, `runFixture` from Task 1.
- Produces: both checks push `"<label>: no src/api/contract.ts — every mock owns its registry (CLAUDE.md decision 4); a hoisted or missing contract cannot be bound"` and return 0 instead of returning silently.

- [ ] **Step 1: Write the failing test — add the fixture**

In `scripts/verify/checks/checks-bite.mjs`, add to `DEFECTS`:

```js
  'contract-deleted': (root) => {
    rmSync(path.join(root, 'templates', 'mock', 'src', 'api', 'contract.ts'));
  },
```

and add two entries to `FIXTURES`:

```js
  {
    id: 'contract-deleted',
    check: 'scripts/verify/checks/api-bound.mjs',
    expect: 'no src/api/contract.ts',
  },
  {
    id: 'contract-deleted',
    check: 'scripts/verify/checks/contract-complete.mjs',
    expect: 'no src/api/contract.ts',
  },
```

Two fixtures share an id, so change `runFixture`'s temp-dir name to include an index, and `--only` to match on `id`:

```js
  const dir = mkdtempSync(path.join(tmpdir(), `bite-${fixture.id}-${path.basename(fixture.check, '.mjs')}-`));
```

- [ ] **Step 2: Run it and watch it fail for the stated reason**

```bash
node scripts/verify/checks/checks-bite.mjs --only contract-deleted
```

Expected: exit 1, with **both** lines reading `did not go red on a planted defect`. That is the bug, reproduced by the harness. Quote both lines.

- [ ] **Step 3: Fix `api-bound.mjs`**

Replace line 127:

```js
  if (!existsSync(contractFile)) return 0;
```

with:

```js
  if (!existsSync(contractFile)) {
    problems.push(
      `${label}: no src/api/contract.ts — every mock owns its registry (CLAUDE.md decision 4); ` +
        `a hoisted or missing contract cannot be bound`,
    );
    return 0;
  }
```

In `main()`, remove the `existsSync` pre-guard at line 170 so the template goes through the same path as a mock, and make `checked` count registries actually parsed rather than directories visited. The `checked === 0` guard at line 184 stays as empty-root protection, but can no longer be the only thing standing between a contract-less tree and a green.

- [ ] **Step 4: Fix `contract-complete.mjs` the same way**

Replace line 139 with the same pushed problem, remove the pre-guard at line 197, and apply the same `checked` change at `:194-214`.

- [ ] **Step 5: Run the fixture and watch it pass**

```bash
node scripts/verify/checks/checks-bite.mjs
pnpm verify
```

Expected: `checks:bite` exit 0 with four lines; `pnpm verify` 13 PASSED. The counts in the success lines must now read `1 contract(s)` for a template-only run, not 2.

- [ ] **Step 6: Correct decision 4 in `CLAUDE.md`**

In "Decisions, recorded", decision 4 currently claims the two rows fail when a registry is absent. That was untrue until this task. Leave the sentence as-is — **it is now true** — and append the measurement:

```markdown
   into a shared package turns two rows red. *(Measured false on 2026-09-13 and made true in the
   same commit: both checks returned early with no problem pushed when `src/api/contract.ts` was
   absent, and counted the directory as checked anyway. `checks:bite`'s `contract-deleted` fixture
   is what holds it now.)*
```

- [ ] **Step 7: Commit**

```bash
git add scripts/verify/checks/api-bound.mjs scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs CLAUDE.md
git commit -F - -- scripts/verify/checks/api-bound.mjs scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs CLAUDE.md <<'MSG'
fix(verify): a mock with no contract.ts is red, not silently counted

Both checks returned early with no problem pushed when src/api/contract.ts was
absent, and incremented `checked` regardless. A fabricated root with a
contract-less mock doing a raw httpClient.get exited 0 from both, reporting
"2 contract(s)" where one existed.

CLAUDE.md decision 4 — "hoisting the registry into a shared package turns two
rows red" — was therefore false. It is true as of this commit, and the
checks:bite contract-deleted fixture is what holds it.

pnpm verify  13 PASSED, exit 0
MSG
```

---

### Task 3: `call` must resolve to this mock's own contract

`api-bound.mjs:86` accepts any import specifier ending in `/api/contract`, so `@agency/contracts/api/contract` is treated as the mock's own registry — the second half of decision 4's hole.

**Files:**
- Modify: `scripts/verify/checks/api-bound.mjs:83-98` (the binding table)
- Modify: `scripts/verify/checks/checks-bite.mjs` (one defect, one fixture)

**Interfaces:**
- Consumes: the pushed-problem pattern from Task 2.
- Produces: a specifier is accepted only when it is relative (`./`, `../`) and resolves to the mock's own `src/api/contract.ts`.

- [ ] **Step 1: Write the failing test — add the fixture**

```js
  'bare-specifier-contract': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'pages', 'PartiesPage.tsx');
    const src = readFileSync(file, 'utf8');
    const swapped = src.replace("from '../api/contract'", "from '@agency/contracts/api/contract'");
    if (swapped === src) throw new Error('bare-specifier-contract: the contract import moved; update this defect');
    writeFileSync(file, swapped);
  },
```

```js
  { id: 'bare-specifier-contract', check: 'scripts/verify/checks/api-bound.mjs', expect: 'does not resolve to this mock' },
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node scripts/verify/checks/checks-bite.mjs --only bare-specifier-contract
```

Expected: exit 1, `did not go red on a planted defect`. Quote it.

- [ ] **Step 3: Anchor the binding on a resolved path**

In `api-bound.mjs`, where the import specifier is matched (around line 86), replace the suffix test with a resolution against the file being scanned:

```js
const OWN_CONTRACT = ['./contract', '../api/contract', '../../api/contract'];

function importsOwnContract(specifier, fromFile, mockRoot) {
  if (!specifier.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return resolved === path.join(mockRoot, 'src', 'api', 'contract');
}
```

Use it where the binding table is built, and when a `call` binding comes from a specifier that is not the mock's own contract, push:

```js
problems.push(
  `${label}: ${rel}: imports \`call\` from '${specifier}', which does not resolve to this mock's ` +
    `src/api/contract — the registry is per-mock (CLAUDE.md decision 4)`,
);
```

- [ ] **Step 4: Run the fixture and the tier**

```bash
node scripts/verify/checks/checks-bite.mjs
pnpm verify
```

Expected: `checks:bite` exit 0 with five lines; 13 PASSED. **`OWN_CONTRACT` above is illustrative of the shapes that must pass — the resolution test is the mechanism; delete the constant if you do not use it rather than leaving it unread.**

- [ ] **Step 5: Commit**

```bash
git add scripts/verify/checks/api-bound.mjs scripts/verify/checks/checks-bite.mjs
git commit -F - -- scripts/verify/checks/api-bound.mjs scripts/verify/checks/checks-bite.mjs <<'MSG'
fix(verify): api:bound resolves `call` to this mock's own contract

The binding table matched any specifier ending in '/api/contract', so
'@agency/contracts/api/contract' was accepted as the mock's own registry — the
other half of the hole decision 4 describes. It now resolves the specifier
against the importing file and requires the mock's own src/api/contract.

pnpm verify  13 PASSED, exit 0
MSG
```

---

### Task 4: Exactness at the sink — `LeakFree`, and `wire()` is deleted

`wire()` is opt-in: `getParty: () => stored` compiles clean against the real `HandlersOf`, in the exact shape `routes.ts` uses, because excess-property checking never fires on a contextually typed arrow's return. The guarantee CLAUDE.md calls the design's centre is a convention.

**Files:**
- Modify: `packages/mock/src/contract.ts:153-176` (add `Leaks`/`LeakFree`, primitive-guard `DeepExact`, delete `wire`), `:186` (`HandlersOf`), `:215` and `:274` (`toRoutes` signature and impl)
- Modify: `packages/mock/src/contract.controls.ts:127-139` (replace the two `wire()` controls)
- Modify: `templates/mock/src/api/routes.ts` (six `wire()` calls → plain returns; annotation → `satisfies`; add the `routes` sink)
- Modify: `templates/mock/src/api/drift.controls.ts:106-108`
- Modify: `packages/mock/src/index.ts` (stop exporting `wire`)

**Interfaces:**
- Produces: `Leaks<A, I, H>`, `LeakFree<A, I, H, Ok>`, `toRoutes<H extends HandlersOf<A, I>>(handlers: H): LeakFree<A, I, H, Route[]>`.
- Produces: `templates/mock/src/api/routes.ts` exports `routes: Route[]`, built by `toRoutes(makeHandlers())`, where `makeHandlers()` has **no** return-type annotation and ends in `satisfies HandlersOf<Api, Io>`.
- Removes: `wire` from `@agency/mock`'s public surface.

- [ ] **Step 1: Write the failing controls**

In `packages/mock/src/contract.controls.ts`, replace `leaksAPrivateField` and `leaksThroughTheListEnvelope` with four controls that assert the **sink** refuses a leak, plus the two that must stay green:

```ts
/* EXACTNESS: a wider row may not reach the client. The check is at the SINK, not at
   each return — measured 2026-09-13: `wire()` was opt-in, and `() => storedWideRow`
   compiled clean in the exact shape routes.ts uses. */

// @ts-expect-error a top-level wide row is refused at toRoutes, naming the operation
export const leakTopLevel: Route[] = toRoutes({ ...ok, getParty: () => wideRow } satisfies HandlersOf<Api, Io>);

// @ts-expect-error a wide row nested in data[] is refused — the check is DEEP
export const leakNested: Route[] = toRoutes({ ...ok, listParties: () => ({ data: [wideRow], total: 1, page: 1, limit: 20 }) } satisfies HandlersOf<Api, Io>);

// @ts-expect-error a wide row behind `async` is refused — Awaited<R> strips the Promise
export const leakAsync: Route[] = toRoutes({ ...ok, getParty: async () => wideRow } satisfies HandlersOf<Api, Io>);

/** A narrow map is accepted, with no wire() call anywhere. */
export const noLeak: Route[] = toRoutes(ok);

/** `satisfies`, not an annotation: an annotation widens H and the sink sees nothing. */
export type FactoryNotWidened = Expect<
  Equal<Equal<ReturnType<typeof makeOkHandlers>, HandlersOf<Api, Io>>, false>
>;
```

And in `templates/mock/src/api/drift.controls.ts`, the residual, **with no directive** — it compiles, and that is the point:

```ts
/* THE HONEST RESIDUAL. No type-level scheme survives an annotated widening or a cast —
   measured against wire(), a branded return and LeakFree alike. The wire golden is the
   ground truth for this, which is why it drives every declared code (see the Phase 3 plan). */
export const annotatedWideningIsGreen: HandlersOf<Api, Io>['getParty'] = () => {
  const out: Party = wideRow;   // assignability, not exactness
  return out;
};
```

- [ ] **Step 2: Run typecheck and watch it fail for the stated reason**

```bash
pnpm typecheck
```

Expected: FAIL. Every `@ts-expect-error` above is **unused** (`TS2578: Unused '@ts-expect-error' directive`), because `toRoutes` currently accepts any assignable handler map. That unused-directive error *is* the proof that exactness is not held today. Quote all four.

- [ ] **Step 3: Implement `Leaks`, `LeakFree`, and the primitive guard**

In `packages/mock/src/contract.ts`, add above `HandlersOf`:

```ts
/**
 * Exactness, checked ONCE, where the handler map meets the route table. Measured
 * 2026-09-13 on tsc 6.0.3: top-level, nested-in-data[] and behind-async leaks are each
 * red here and the diagnostic names the operation; a `string` and a `string[]` response
 * stay green (the branded-return variant broke both).
 */
export type Leaks<A extends ApiSpec, I extends IoFor<A>, H> = {
  [K in keyof A]: [I[K]['res']] extends [void]
    ? never
    : K extends keyof H
      ? H[K] extends (c: never) => infer R
        ? [Awaited<R>] extends [DeepExact<Awaited<R>, I[K]['res']>]
          ? never
          : K
        : never
      : never;
}[keyof A];

export type LeakFree<A extends ApiSpec, I extends IoFor<A>, H, Ok> = [Leaks<A, I, H>] extends [never]
  ? Ok
  : { 'these handlers return keys the contract does not declare': Leaks<A, I, H> };
```

Add the primitive guard as the **first** branch of `DeepExact` (line 153), so a branded `Decimal2` or `Instant` compares as itself instead of expanding into ~50 `String.prototype` members in every diagnostic:

```ts
export type DeepExact<A, T> = [A] extends [string | number | boolean | null | undefined]
  ? A
  : /* …the existing array and object branches, unchanged… */
```

Change the `toRoutes` signature (line 215) and its implementation (line 274):

```ts
  toRoutes<H extends HandlersOf<A, I>>(handlers: H): LeakFree<A, I, H, Route[]>;
```

The implementation body is unchanged; it returns `as never`.

Delete `wire` (lines 172-176) and header notes 3 and 4 — note 4's claim that `NoInfer` is load-bearing twice is measured false and is corrected properly in Task 8.

- [ ] **Step 4: Update the template to plain returns**

In `templates/mock/src/api/routes.ts`: drop the `HandlersOf<Api, Io>` return annotation from `makeHandlers`, end the returned literal with `} satisfies HandlersOf<Api, Io>;`, replace all six `wire(x)` with `x`, drop the `wire` import, and add the sink:

```ts
/** The check site. A handler that returns more than its operation declares is red HERE,
    and the diagnostic names the operation. Scaffolder-written; never edited. */
export const routes: Route[] = toRoutes(makeHandlers());
```

Remove `wire` from `packages/mock/src/index.ts`.

- [ ] **Step 5: Run typecheck and the tier**

```bash
pnpm typecheck && pnpm verify
```

Expected: typecheck PASSED (all four directives now used), 13 PASSED. Add a `wire-still-exported` grep to your own review: `grep -rn "\bwire(" packages templates` must return **only** `wire.golden` matches.

- [ ] **Step 6: Add a checks:bite fixture for the sink**

```js
  'handler-leaks-a-field': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'routes.ts');
    const src = readFileSync(file, 'utf8');
    const leaky = src.replace('createStore<Party>', 'createStore<Party & { internal_note: string }>');
    if (leaky === src) throw new Error('handler-leaks-a-field: the store construction moved; update this defect');
    writeFileSync(file, leaky);
  },
```

This one needs a compiler, so its `check` is `scripts/verify/checks/typecheck.mjs` — **only add this fixture if that check accepts `--root`. If it does not, record the fixture as deliberately absent in the row's `blindSpot` rather than inventing a root flag for it in this task.**

- [ ] **Step 7: Commit**

```bash
git add packages/mock/src/contract.ts packages/mock/src/contract.controls.ts packages/mock/src/index.ts templates/mock/src/api/routes.ts templates/mock/src/api/drift.controls.ts scripts/verify/checks/checks-bite.mjs
git commit -F - -- packages/mock/src/contract.ts packages/mock/src/contract.controls.ts packages/mock/src/index.ts templates/mock/src/api/routes.ts templates/mock/src/api/drift.controls.ts scripts/verify/checks/checks-bite.mjs <<'MSG'
feat(contract): exactness at the sink; wire() is deleted

wire() was opt-in. Measured on tsc 6.0.3 in the exact shape routes.ts uses:
`getParty: () => storedWideRow`, its async twin, and a wide row nested in data[]
all compiled clean, because excess-property checking never fires on a
contextually typed arrow's return.

Handlers now end in `satisfies HandlersOf<Api, Io>` and return plain values;
toRoutes returns LeakFree<...>, so a wide return is red at `export const routes`
and the diagnostic names the operation. Handler bodies are now byte-identical to
the Nest service bodies they become.

DeepExact gains a primitive guard so a branded Decimal2 compares as itself rather
than expanding into ~50 String.prototype members in every diagnostic.

The residual is pinned as a LIVE type with no directive: an annotated widening
(`const out: Party = wide; return out`) is green under wire(), under a brand and
under LeakFree alike. The wire golden is the ground truth for it.

CHECK CHANGES (HARD RULE 2 disclosure): contract.controls.ts's leaksAPrivateField
and leaksThroughTheListEnvelope asserted that wire() bites WHEN CALLED — the
positive direction only, which is the gap. Replaced by four toRoutes-sink
controls plus FactoryNotWidened.

pnpm verify  13 PASSED, exit 0
MSG
```

---

### Task 5: The page-side client becomes an opaque `Transport`

`api:bound`'s raw-transport clause is `/httpClient|axios/i` against the callee text. Measured: **13 of 19 spellings evade it**, including the *unaliased* `httpClient({ url })` (an AxiosInstance is callable, so the callee is an Identifier and the regex branch never runs) and `httpClient.postForm`. It also false-reds `httpClientCache.get`.

**Files:**
- Modify: `packages/mock/src/contract.ts` (add `Transport`, `transport()`; `call`'s first parameter)
- Modify: `packages/mock/src/index.ts` (export both)
- Modify: `templates/mock/src/api/client.ts` (wrap the instance)
- Modify: `scripts/verify/checks/api-bound.mjs:110-117` (delete the regex clause)
- Modify: `oxlint.base.json` (two entries under the existing pages/components override)
- Modify: `packages/mock/src/contract.test.ts` (the `client()` helper wraps)

**Interfaces:**
- Produces: `interface Transport { readonly [TRANSPORT]: true }`, `transport(http: AxiosInstance): Transport`.
- Produces: `call(http: Transport, key, args)` — was `AxiosInstance`.
- Consumes: nothing from Task 4 beyond a green tree.

- [ ] **Step 1: Write the failing control**

In `templates/mock/src/api/drift.controls.ts`:

```ts
/* A screen cannot go around the contract: the page-side client is opaque and only
   call() unwraps it. This replaces api:bound's /httpClient|axios/i text match, which
   13 of 19 measured spellings evaded — including the unaliased `httpClient({ url })`,
   because an AxiosInstance is callable and the callee is then an Identifier. */

// @ts-expect-error a raw verb on the transport is not callable
export const rawVerb = httpClient.get('/parties');

// @ts-expect-error the instance itself is not callable either
export const rawCall = httpClient({ url: '/parties' });

// @ts-expect-error a verb absent from RAW_HTTP is refused by the same mechanism
export const rawPostForm = httpClient.postForm('/parties', {});
```

- [ ] **Step 2: Run typecheck and watch it fail**

```bash
pnpm typecheck
```

Expected: FAIL with three `TS2578: Unused '@ts-expect-error' directive` — `httpClient` is still an `AxiosInstance`, so all three compile. Quote them.

- [ ] **Step 3: Implement `Transport`**

In `packages/mock/src/contract.ts`:

```ts
/**
 * The page-side client, opaque. Only `call()` unwraps it, so `httpClient.get(...)` is
 * TS2339 in EVERY file a mock compiles — hooks, components and helpers included, which
 * no single-file AST walk could reach.
 */
declare const TRANSPORT: unique symbol;
export interface Transport {
  readonly [TRANSPORT]: true;
}
export const transport = (http: AxiosInstance): Transport => http as never;
```

Change `call`'s first parameter to `Transport` and unwrap once inside:

```ts
    async call(client, key, args) {
      const http = client as unknown as AxiosInstance;
      /* …unchanged… */
    },
```

- [ ] **Step 4: Wrap the scaffolded client**

In `templates/mock/src/api/client.ts`, wrap the `axios.create` call in `transport(...)`. **Everything that needs the raw instance — `attachErrorInterceptor` if a mock adds it — attaches inside this file, before the wrap.** Add that sentence as a comment: the file is `@scaffold-owned` and the next author must know where the seam is.

- [ ] **Step 5: Delete the regex clause and add the lint entries**

In `api-bound.mjs`, delete the raw-transport branch at lines 110-117 and the now-unused `RAW_HTTP` set at line 27. This is a **deletion, not a weakening**: all 13 measured evasions are red elsewhere with a better message, and its two measured false reds disappear.

In `oxlint.base.json`, under the existing `**/src/pages/**` / `**/src/components/**` override (the one that already bans `@agency/dec`), add `axios` to `no-restricted-imports` and `fetch` to `no-restricted-globals` — for the two paths the type cannot see.

- [ ] **Step 6: Run typecheck, lint and the tier**

```bash
pnpm typecheck && pnpm lint && pnpm verify
```

Expected: all three green, 13 PASSED. `lint:exempt` must stay PASSED — these are additions to an existing override, not a new exemption, so the baseline is unchanged.

- [ ] **Step 7: Commit**

```bash
git add packages/mock/src/contract.ts packages/mock/src/index.ts packages/mock/src/contract.test.ts templates/mock/src/api/client.ts templates/mock/src/api/drift.controls.ts scripts/verify/checks/api-bound.mjs oxlint.base.json
git commit -F - -- packages/mock/src/contract.ts packages/mock/src/index.ts packages/mock/src/contract.test.ts templates/mock/src/api/client.ts templates/mock/src/api/drift.controls.ts scripts/verify/checks/api-bound.mjs oxlint.base.json <<'MSG'
feat(contract): the page-side client is an opaque Transport

api:bound's raw-transport clause was /httpClient|axios/i against the callee text.
Measured: 13 of 19 spellings evaded it, including the UNALIASED
`httpClient({ url })` — an AxiosInstance is callable, so the callee is an
Identifier and the regex branch never ran — and `httpClient.postForm`. It also
false-red `httpClientCache.get`.

httpClient is now an opaque Transport that only call() unwraps, so a raw verb is
TS2339 in every file a mock compiles: hooks, components and helpers included,
which no single-file AST walk could reach. axios and fetch in a page are held by
two entries added to the oxlint override that already bans @agency/dec there.

CHECK CHANGES (HARD RULE 2 disclosure): the /httpClient|axios/i clause and its
RAW_HTTP set are DELETED, not weakened — every input it caught is red elsewhere
with a better message, and its two measured false reds go away.

pnpm verify  13 PASSED, exit 0
MSG
```

---

### Task 6: The adapter stops minting transport codes

The adapter mints `NOT_FOUND` and `INTERNAL`; the router mints `BAD_REQUEST`. No operation declares them, and the reference `AllExceptionsFilter` never emits a `code` on those paths. So `const code: undefined = codeOf('listParties', err)` typechecks and equals `'NOT_FOUND'` at runtime — and a screen branching on it works in the demo and silently stops after conversion.

**Files:**
- Modify: `packages/mock/src/errors.ts` (`DomainError.code` optional; `envelopeOf` omits it when absent)
- Modify: `packages/mock/src/adapter.ts:151`, `:189`, `:209`
- Modify: `packages/mock/src/router.ts:137`
- Modify: `packages/mock/src/contract.ts:264` (`codeOf` filters at runtime)
- Modify: `packages/mock/src/adapter.test.ts:104`, `:192`, `:209`, `:261`, `:422`; `packages/mock/src/router.test.ts:89`
- Modify: `packages/mock/src/contract.test.ts` (four new red-first cases)

**Interfaces:**
- Produces: `new DomainError(status: number, code: string | undefined, message: string, ctx?)` — `code` is now nullable in the envelope.
- Produces: `codeOf(key, error)` returns a declared code or `undefined`, filtered at runtime against `api[key].codes`.

- [ ] **Step 1: Write the failing tests**

In `packages/mock/src/contract.test.ts`:

```ts
describe('codeOf returns the declared set, and nothing else', () => {
  it('returns undefined for a capability-gated 404', async () => {
    const err = await rejection(() => call(gatedClient, 'listParties', { params: {}, body: undefined }));
    expect(codeOf('listParties', err)).toBeUndefined();
  });

  it('returns undefined for an unmatched route', async () => {
    const err = await rejection(() => rawGet(client, '/no-such-path'));
    expect(codeOf('listParties', err)).toBeUndefined();
  });

  it('returns undefined for an unhandled throw in a handler', async () => {
    const err = await rejection(() => call(throwingClient, 'getParty', { params: { id: 'p1' }, body: undefined }));
    expect(codeOf('getParty', err)).toBeUndefined();
  });

  it('returns undefined for a code the operation does not declare', async () => {
    const err = await rejection(() => call(strayClient, 'listParties', { params: {}, body: undefined }));
    expect(codeOf('listParties', err)).toBeUndefined();
  });

  it('puts no `code` key on the wire for a transport failure', async () => {
    const err = await rejection(() => rawGet(client, '/no-such-path'));
    expect(err.response?.data).not.toHaveProperty('code');
  });
});
```

- [ ] **Step 2: Run and watch them fail for the stated reason**

```bash
pnpm exec vitest run packages/mock/src/contract.test.ts
```

Expected: FAIL — the first four read `expected 'NOT_FOUND' to be undefined` (and `'INTERNAL'` for the throwing case); the fifth reads `expected { … code: 'NOT_FOUND' … } not to have property "code"`. Quote at least the first and the last.

- [ ] **Step 3: Make `code` optional and omit it from the envelope**

In `packages/mock/src/errors.ts`, make the `code` constructor parameter `string | undefined`, and have `envelopeOf` write the `code` key only when it is present — **exactly as it already handles `requestId`**; follow that existing branch rather than inventing a second style.

- [ ] **Step 4: Stop minting codes**

- `adapter.ts:151` → `new DomainError(500, undefined, 'Internal server error')`
- `adapter.ts:189` → `new DomainError(404, undefined, 'Not found')`
- `adapter.ts:209` → `new DomainError(500, undefined, 'Internal server error')`
- `router.ts:137` → `new DomainError(400, undefined, 'Malformed URL')`

- [ ] **Step 5: Make `codeOf` closed at runtime as well as in the type**

In `contract.ts:264`, filter against the operation's declared set, so a stray `new DomainError(409, 'ANYTHING')` in a handler cannot widen what a screen sees:

```ts
    codeOf(key, error) {
      const raw = readCodeFromEnvelope(error);
      if (raw === undefined) return undefined;
      if (!api[key].codes.includes(raw)) {
        console.error(`[mock] ${String(key)} produced an undeclared code '${raw}' — it is not in the registry`);
        return undefined;
      }
      return raw as never;
    },
```

- [ ] **Step 6: Update the six assertions — HARD RULE 2 disclosure**

Each becomes **more** specific: it keeps the status it already asserted and adds that no code is present.

| File:line | Today | After |
|---|---|---|
| `adapter.test.ts:104` | `toMatchObject({ code: 'NOT_FOUND' })` | `toMatchObject({ statusCode: 404 })` + `not.toHaveProperty('code')` |
| `adapter.test.ts:261` | same | same |
| `adapter.test.ts:192` | `{ statusCode: 500, code: 'INTERNAL' }` | `{ statusCode: 500 }` + `not.toHaveProperty('code')` |
| `adapter.test.ts:209` | same | same |
| `adapter.test.ts:422` | `'BAD_REQUEST'` | status 400 + `not.toHaveProperty('code')` |
| `router.test.ts:89` | `'BAD_REQUEST'` | status 400 + `not.toHaveProperty('code')` |

- [ ] **Step 7: Run the tier**

```bash
pnpm verify
```

Expected: 13 PASSED.

- [ ] **Step 8: Commit**

```bash
git add packages/mock/src/errors.ts packages/mock/src/adapter.ts packages/mock/src/router.ts packages/mock/src/contract.ts packages/mock/src/adapter.test.ts packages/mock/src/router.test.ts packages/mock/src/contract.test.ts
git commit -F - -- packages/mock/src/errors.ts packages/mock/src/adapter.ts packages/mock/src/router.ts packages/mock/src/contract.ts packages/mock/src/adapter.test.ts packages/mock/src/router.test.ts packages/mock/src/contract.test.ts <<'MSG'
fix(contract): the adapter stops minting codes the product never sends

The adapter minted NOT_FOUND and INTERNAL, the router BAD_REQUEST. No operation
declares them, and reference/contract/all-exceptions.filter.ts emits no `code` on
404/400/500 — so the mock was MORE informative than the product, and a screen
branching on NOT_FOUND worked in the demo and silently stopped after conversion.
Measured: `const code: undefined = codeOf('listParties', err)` typechecks and
equals 'NOT_FOUND' at runtime for a capability-gated 404.

DomainError.code is now optional and the envelope omits it exactly as it already
omits requestId. codeOf additionally filters at runtime against api[key].codes,
so CodeOf<A,K> | undefined is true by construction rather than by discipline.

CHECK CHANGES (HARD RULE 2 disclosure): six assertions in adapter.test.ts
(:104, :192, :209, :261, :422) and router.test.ts (:89) change from asserting an
invented code to asserting the status they already checked PLUS the absence of a
code key. Each is strictly more specific than what it replaced.

pnpm verify  13 PASSED, exit 0
MSG
```

---

### Task 7: The dead loop, the handler-map anchor, and the unreal `after`

`contract-complete.mjs:180-185` is a loop whose whole body is `continue`, under a comment describing a check. `handlersOf` at `:96` harvests any `return {…}` in the file, so an unrelated helper returning `{ getParty: 1 }` turns a red green. And `api:bound` declares `after: ['typecheck']` while consuming no tsc output, which hid the one fast-tier signal for an undeclared operation whenever anything in `packages/*` was red.

**Files:**
- Modify: `scripts/verify/checks/contract-complete.mjs:96-111` (anchor), `:180-185` (delete)
- Modify: `scripts/verify/registry.mjs` (drop `after` from the `api:bound` row)
- Modify: `packages/mock/src/contract.ts` (`toRoutes` refuses an undeclared handler key)
- Modify: `packages/mock/src/contract.test.ts` (one new test)
- Modify: `scripts/verify/checks/checks-bite.mjs` (one defect, one fixture)

**Interfaces:**
- Consumes: `toRoutes` from Task 4.
- Produces: `toRoutes` throws `toRoutes: handler '<k>' names no operation in the registry — it can never be routed`.

- [ ] **Step 1: Write the two failing tests**

A unit test in `packages/mock/src/contract.test.ts`:

```ts
it('REFUSES a handler for an operation the registry does not declare', () => {
  const wide = { ...makeHandlers(), archiveParty: () => undefined };
  expect(() => toRoutes(wide as never)).toThrow(/names no operation in the registry/);
});
```

And a `checks:bite` fixture for the anchor:

```js
  'handler-map-decoy': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'routes.ts');
    const src = readFileSync(file, 'utf8');
    const cut = src.replace(/\n {4}getParty: \(c\) => \{[\s\S]*?\n {4}\},\n/, '\n');
    if (cut === src) throw new Error('handler-map-decoy: the getParty handler shape moved');
    writeFileSync(file, `${cut}\nfunction decoy() { return { getParty: 1, overview: 2 }; }\n`);
  },
```

```js
  { id: 'handler-map-decoy', check: 'scripts/verify/checks/contract-complete.mjs', expect: 'getParty' },
```

- [ ] **Step 2: Run both and watch them fail**

```bash
pnpm exec vitest run packages/mock/src/contract.test.ts
node scripts/verify/checks/checks-bite.mjs --only handler-map-decoy
```

Expected: the unit test FAILs with `expected [Function] to throw error matching /names no operation/ but it didn't`; the fixture exits 1 with `did not go red` — the decoy restored the harvested key even though the real handler is gone. Quote both.

- [ ] **Step 3: Refuse an undeclared handler key at runtime**

In `toRoutes`, before building the table:

```ts
      for (const k of Object.keys(handlers)) {
        if (!Object.hasOwn(api, k)) {
          throw new Error(`toRoutes: handler '${k}' names no operation in the registry — it can never be routed`);
        }
      }
```

This holds the direction the dead loop pretended to, for every construction — including the spread and the cast that tsc's excess-property check misses.

- [ ] **Step 4: Anchor `handlersOf` and delete the dead loop**

In `contract-complete.mjs`, scope `handlersOf` (line 96) to the object literal returned by the function whose `satisfies HandlersOf<…>` clause identifies it — resolving a returned local const — and fail loudly when no anchor is found, rather than harvesting every `return {…}` in the file. Delete lines 180-185 entirely, and move the reverse-direction claim into the row's `blindSpot`, naming `toRoutes` as its holder.

- [ ] **Step 5: Drop the unreal `after`**

In `scripts/verify/registry.mjs`, delete `after: ['typecheck'],` from the `api:bound` row. The row parses; it consumes no tsc output. Add one sentence to its `blindSpot` recording that it parses and never typechecks, so the row's verdict is understood as syntactic.

- [ ] **Step 6: Run everything**

```bash
pnpm verify:write
pnpm verify
```

Expected: 13 PASSED, and `api:bound` now reports a verdict even on a run where `typecheck` failed.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs packages/mock/src/contract.ts packages/mock/src/contract.test.ts CLAUDE.md
git commit -F - -- scripts/verify/checks/contract-complete.mjs scripts/verify/checks/checks-bite.mjs scripts/verify/registry.mjs packages/mock/src/contract.ts packages/mock/src/contract.test.ts CLAUDE.md <<'MSG'
fix(verify): delete a loop that could not fire; anchor the handler map

contract-complete.mjs:180-185 was a loop whose whole body was `continue`, under a
comment describing a check — in a repo whose thesis is that checks are the control
surface, that is the wrong artifact to leave behind. The direction it pretended to
hold now lives in toRoutes, where it fires for every construction including the
spread and the cast tsc's excess-property check misses.

handlersOf harvested any `return {…}` in routes.ts, so an unrelated helper
returning { getParty: 1 } turned a red green — reproduced by the new
handler-map-decoy fixture. It is now anchored on the annotated handler map.

api:bound's `after: ['typecheck']` is dropped: the row parses and consumes no tsc
output, and gating it hid the one fast-tier signal for an undeclared operation
whenever anything in packages/* was red.

pnpm verify  13 PASSED, exit 0
MSG
```

---

### Task 8: Correct the memo where it is measurably wrong

Four statements in `CLAUDE.md` are false or overstated. `memo:drift` cannot see them — it compares the generated table against the registry, never either against reality — so this is the one task with no automated red, and it must be done deliberately.

**Files:**
- Modify: `CLAUDE.md` — "The contract" section, "Decisions, recorded" #5
- Modify: `packages/mock/src/contract.ts:28-34` (header notes)
- Modify: `packages/mock/src/contract.controls.ts` (two new controls)
- Modify: `docs/BUILD-REPORT.md` (append the Phase 1 record)

**Interfaces:**
- Consumes: every change from Tasks 1-7.
- Produces: no code surface.

- [ ] **Step 1: Write the controls that pin what `NoInfer` actually does**

The claim "`NoInfer` is load-bearing twice" did not reproduce: stripping **both** occurrences left every diagnostic byte-identical. The load-bearing token is the constraint `A extends Awaited<T>`, and nothing pinned it. In `contract.controls.ts`:

```ts
/** wire() is gone; what survives of its lesson is that a target read from context only
    needs no NoInfer. Measured 2026-09-13: stripping both NoInfer occurrences left every
    diagnostic byte-identical. What was load-bearing is the CONSTRAINT. */
export type ExactnessTargetComesFromTheRegistry = Expect<
  Equal<Leaks<Api, Io, { getParty: () => Party }>, never>
>;

// @ts-expect-error a handler returning less than declared is refused by the constraint, not by inference
export type TooLittleIsRefused = Expect<Equal<Leaks<Api, Io, { getParty: () => { id: string } }>, never>>;
```

- [ ] **Step 2: Run typecheck and watch the second one fail if it is wrong**

```bash
pnpm typecheck
```

Expected: PASSED. If `TooLittleIsRefused`'s directive is unused, `Leaks` is not catching a narrow return — **that is a finding about Task 4, not a reason to delete the control.** Report it and stop.

- [ ] **Step 3: Rewrite the four false statements**

1. **The `DeepExact` paragraph** in "The contract" — replace "It is DEEP: a shallow exact compares only top-level keys…" with the sink mechanism, and add the sentence the whole design turns on: *nothing type-level survives an annotated widening or a cast, so the wire golden is the ground truth for that residual, and `annotatedWideningIsGreen` in `drift.controls.ts` is where that is written down as a live type.*
2. **The `NoInfer` bullet** — keep only the half that reproduces; name the constraint as the load-bearing token; cite the two controls from step 1.
3. **Decision 5** — "`api:bound` now fails any raw `httpClient` verb in a screen, which is the only way to reintroduce it" is false; the type holds it now, and the regex is deleted. Rewrite to name `Transport`.
4. **`wire()`** — every mention, including the one in "Five things are load-bearing", which is now four.

- [ ] **Step 4: Append the Phase 1 record to `docs/BUILD-REPORT.md`**

Follow the existing sections' shape: what was measured, what a check should have caught and didn't, and what is still open. The five items still open at the end of Phase 1 are: the cast residual (permanent); `contract:complete`'s literal code clause (Phase 3); the template's tests outside the fast tier (Phase 3); no coverage or mutation testing; and `checks:bite`'s own `proves` being an unverified claim in exactly the sense the row exists to fix.

- [ ] **Step 5: Regenerate and run both tiers**

```bash
pnpm verify:write
pnpm verify
pnpm verify:full
```

Expected: 13 PASSED and 16 PASSED. `verify:full` scaffolds and installs a real mock, so this is the first proof that the Phase 1 changes survive a scaffold — **if `template:render`, `build` or `wire:frozen` is red here, that is the real verdict on this phase.**

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md packages/mock/src/contract.ts packages/mock/src/contract.controls.ts docs/BUILD-REPORT.md
git commit -F - -- CLAUDE.md packages/mock/src/contract.ts packages/mock/src/contract.controls.ts docs/BUILD-REPORT.md <<'MSG'
docs(contract): correct four statements the memo could not check

memo:drift compares the generated table against the registry, never either
against reality, so none of these could go red:

- the DeepExact paragraph presented exactness as following from the type. It
  follows from the sink, and not past an annotated widening or a cast — the wire
  golden is the ground truth for that, and drift.controls.ts now says so as a
  live type.
- "NoInfer is load-bearing twice" did not reproduce: stripping both occurrences
  left every diagnostic byte-identical. The load-bearing token is the constraint
  `A extends Awaited<T>`, which nothing pinned. Two controls now do.
- decision 5's "the only way to reintroduce it" is false; the opaque Transport
  holds it and the regex clause is deleted.
- wire() is gone, so "five things are load-bearing" is four.

pnpm verify       13 PASSED, exit 0
pnpm verify:full  16 PASSED, exit 0
MSG
```

---

## Self-review

**Spec coverage.** §6 Phase 1 lists seven steps; this plan has eight tasks. The mapping: spec 1 → Task 1; spec 2 → Tasks 2 and 3 (split because the absence hole and the specifier hole have different fixtures and different fixes, and a reviewer could accept one while rejecting the other); spec 3 → Task 4; spec 4 → Task 5; spec 5 → Task 6; spec 6 → Task 7; spec 7 → Task 8. No Phase 1 spec item is unimplemented.

**Type consistency.** `Leaks<A, I, H>` and `LeakFree<A, I, H, Ok>` carry the `I` parameter in every task that names them, because `HandlersOf` is still `HandlersOf<A, I>` until Phase 2 folds `Io` into the registry. The spec's §4 shows the *post-Phase-2* two-parameter form; **this plan deliberately uses the three-parameter form throughout**, and Phase 2's plan is where they converge. `toRoutes` has one signature across Tasks 4, 7 and 8. `transport`/`Transport` appear only in Task 5 and after.

**Known gap, recorded rather than hidden.** Task 4 step 6 makes its fixture conditional on whether `typecheck.mjs` accepts `--root`. That is the one step in this plan whose exact content cannot be written without reading that file first. It is bounded — either the fixture lands or the row's `blindSpot` gains a sentence — and both branches are written out.

## What comes next

Phases 2, 3 and 4 get their own plans. Phase 2 cannot be written accurately until Phase 1 lands, for two reasons: `checks:bite` may find that other checks do not bite, which is a finding that changes the work; and Phase 2's registry reshape is defined against the post-Phase-1 `contract.ts`, which Tasks 4-6 rewrite substantially.
