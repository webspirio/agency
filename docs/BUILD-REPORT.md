# Build report — Plan A

**Date:** 2026-09-10
**Plan:** `docs/PLAN-A.md` · **Spec:** `docs/SPEC.md` · **Rules:** `BUILD-PROMPT.md`
**Built by:** an orchestrator plus ~40 subagents across four workflows — an audit fleet, a core-fix
fleet, a finishing fleet, and an adversarial reviewer for every implementer. No fix was accepted on a
claim: every reviewer re-ran the gates itself and mutation-tested what it was reviewing.

---

## Gate — Plan A Task 10 Step 6

**Kill criterion #1 does not fire.**

```
node packages/cli/bin/agency.mjs new gate-test --title "Gate Test" --locale de --profiles solo,full
  && pnpm install && pnpm --filter gate-test build && pnpm --filter gate-test test
```

**7.238 s wall clock against a 1200 s bar**, zero hand-edits, on node v24.21.0 — the major `.nvmrc`
pins and `engines` demands.

| Phase | Wall clock |
|---|---|
| scaffold | 0.06 s — 19 files, no `{{` surviving, every `.hbs` consumed |
| `pnpm install` | 2.3 s |
| `tsc -b && vite build` | 0.3 s — 215 modules, dist 62 kB CSS / 415 kB JS (135 kB gz) |
| `vitest run` | 0.7 s — 5 passed |

**The two by-eye conditions were checked from the artifacts instead.** `bg-card`, `text-primary`,
`rounded-xl`, `text-muted-foreground` and `border-border` are present in `dist/assets/*.css`, which
they can only be if Tailwind scanned the kit through the `@source` line — the silent failure the gate
exists to catch, and it did not occur. `createHashRouter` is in the bundle and `createBrowserRouter`
is not. Both are now `verify --tier full` rows (`build`, `template:render`), so the gate's manual step
is a check that goes red rather than a habit.

**Final state, measured at HEAD:**

```
pnpm verify:full   11 PASSED, exit 0
pnpm test          2818 passed (57 files)
pnpm typecheck     exit 0   (tsc -b --force)
pnpm lint          exit 0   (oxlint 1.82.0, pinned exactly)
lint-exempt        2 exemptions suppressing 31 findings, all accounted for
```

---

## What the four measured hazards cost, and where they landed

The spec was built on four measured failures. Each one now has a check, not a paragraph.

| Hazard | Where it is caught now |
|---|---|
| A custom axios adapter that RESOLVES a 409 hands TanStack Query a success | `packages/mock` — the adapter throws; `grep -c settle …/dispatchRequest.js` is still `0`, re-verified |
| Money through a float | `agency/*` lint rules + `dec`'s 2 400-case golden fixture, regenerated against an **independent** reference |
| An id with no order | `agency/no-unordered-id`, now also covering `crypto.randomUUID`/`getRandomValues` |
| A convention that propagates only as prose | `scripts/verify` + `.claude/hooks/stop-gate.mjs` — the memo's own claims are a check (`docs:truth`, `memo:drift`) |

---

## The three things that were structurally incapable of failing

Found by the audit fleet, and the most valuable part of this build. Each was green, and each was green
for a reason that had nothing to do with the code being right.

**1. `pnpm typecheck` could not fail.** The script was
`tsc -b --pretty false || tsc --noEmit -p tsconfig.base.json`. `tsc -b` had never compiled anything —
TS5083, there was no root `tsconfig.json` and no per-package project — so the exit code was decided
entirely by a fallback whose program was the repo root's default `**/*` glob, dominated by 483 files
of read-only `reference/**`. **Measured: the command exits 2 with the same output whether `packages/`
is clean or contains `export const X: number = 'oops'`.** It carried zero bits about the code it
guarded, and `BUILD-PROMPT`'s `pnpm typecheck # exit 0` was unreachable by any edit.

Building a real project graph surfaced **153 errors that had been masked all along** — 136 of them the
kit's own `toHaveClass`/`toBeVisible` assertions, because `vitest.setup.ts` carries the jest-dom
augmentation and sits outside every project's `rootDir`. Zero were resolved by relaxing a setting.

**2. `golden.json` was a tautology.** PLAN-A Task 2 Step 4 generates the fixture by importing the
module it tests, so **675 of the package's tests asserted `dec === dec`**. Proven, not argued: mutating
`dec` to round toward +infinity and regenerating with the plan's own command left 675/675 green on a
module whose `round('-0.005', 2)` returned `'0.01'`. The fixture is now generated from an independent
bigint-rational reference and covers every exported operation, negatives, cross-scale operands and
exact-half values.

**3. `pnpm test` was blind to the deliverable.** The vitest projects enumerated
`packages/{dec,synth,mock,cli}` by hand, so every test under `mocks/*` — the thing the framework
exists to produce — and every `.test.tsx` outside the kit was collected by nobody, while the suite
reported green. A failing test in a scaffolded mock printed `Tests 1 passed`.

A fourth, smaller: `ignorePatterns` was switching off **all ~100 oxlint rules** on 13 files, including
`packages/dec/src/dec.ts`. Measured: `Number(v).toFixed(2)` inside the one module whose header says no
value ever passes through a float exited 0; the byte-identical line in a sibling file errored twice.

---

## Decisions the plan left open

**Presentation code is scoped, not exempted.** `oxlint.base.json` ships to every mock, and the money
rules fired on `(v - lo) / span` in a sparkline and `index > 0` in a list. Left that way, an operator's
first experience of the framework is a red build on their own chart — and SPEC §17 names *"the
operator disables a row rather than fixing what it caught"* as the signal to abandon the enforcement
strategy entirely. So under `**/src/pages/**` and `**/src/components/**` the float and comparison
rules are off, and the exemption is **paid for**: `no-restricted-imports` forbids `@agency/dec` there.
The invariant survives as *money is computed in `src/domain/` and `src/api/`, and a component receives
a finished decimal string* — enforced from the other side rather than dropped.

**Override globs are `**/`-anchored.** Measured: `overrides.files` resolves relative to the directory
of the config that APPLIES to a file, not the one that declares it, so a base glob written
`src/pages/**` silently changes meaning inside `mocks/<slug>/`, which carries its own `.oxlintrc.json`.

**Exemptions are per-rule and line-level, and ratcheted.** Thirteen whole-file ignores became eleven
`// oxlint-disable-next-line agency/<rule>` directives plus two file-level entries, so the exemption
travels with the line it excuses. `scripts/verify/checks/lint-exempt.mjs` lifts each one, asks oxlint
what it finds, and requires the answer to equal `scripts/verify/baselines/lint-exempt.json`: a new
exemption is red, a stale one is red, a changed count is red.

**Mocks are not in the root tsconfig solution.** SPEC §4 says a mock should be in the tsconfig refs,
but that would make `agency new` rewrite an orchestrator-owned root file on every scaffold — a merge
conflict generator, and forbidden by BUILD-PROMPT rule 2. Each mock is its own project, compiled by
its own `pnpm --filter <slug> build`, which is also what the gate runs. Freezing a mock ejects it from
the workspace glob by moving the directory, so §9.5's deadlock does not arise.

**Task 3 was dead as written.** oxlint 1.82.0 does not implement `no-restricted-syntax` — it rejects
the config outright. The plan generalised from a finding about `no-restricted-imports`, a different
rule that does exist. The seven selectors are a `jsPlugins` plugin with five named rules, which is
strictly better: an exemption now says which hazard it is accepting.

**`--tier full` exists because the fast tier does not build.** Everything that breaks only in a bundle
is invisible to `pnpm verify`; `build` and `template:render` scaffold and build a real mock. The fast
tier is 11.8 s so a Stop hook can run it every turn; the full tier is ~19 s.

---

## Published demo — https://webspirio.github.io/agency/

Added after the build, once the repo was made public. **The site is not a committed `dist/`:**
`.github/workflows/pages.yml` runs `agency new`, builds the result and uploads that, so the deploy is
the day-4 gate running on every push — if the scaffolder stops producing a mock that builds, Pages
goes red. A committed demo would rot silently while the template moved underneath it. `pnpm verify`
runs before anything is scaffolded, so a red tree never reaches the site, and the workflow greps the
emitted CSS for `bg-card`/`text-primary`/`rounded-xl` rather than trusting the build.

Its data is synthetic by construction (`packages/synth` is a closed corpus), so nothing published is a
client artifact. **SPEC §9 is unchanged:** real client mocks still go to one Cloudflare Worker per slug
behind an Access policy — this is a showcase of the framework, not an entry in the catalogue.

`MOCK_BASE` is derived from the repo name, not hardcoded, so a rename cannot silently break every
asset URL. Hash routing is what makes it work with no 404.html and no rewrite rule (SPEC §11).
`packages/cli/src/pages.contract.test.ts` pins the workflow against drift: node from `.nvmrc`, pnpm
from `packageManager`, verify ordered before scaffold, the uploaded path matching the slug built, and
least-privilege permissions.

**The first CI run went red, and correctly.** `lint.contract.test.ts` asserted oxlint's stdout was
byte-empty; the GitHub runner's reporter prints a run summary this machine does not, so the same
source and the same verdict passed locally and failed in CI. The test was over-specified — it now
asserts exit 0 and that no `agency(` diagnostic is named. Together with `--reuse-if-fresh` replaying a
node-24 verdict on node 22, that is twice in one session that a green here and a red there came from
the host rather than the code: **every assertion over a tool's output is an assertion about that
tool's host.**

## Deferred

- **`agency check`, `freeze`, `revive`, `thaw`, `catalog.json`, the portfolio Worker, and the
  `tools/mockkit` skills.** Plan B by design — PLAN-A says explicitly that planning them before the
  gate is planning work the gate exists to delete. The gate is now green, so Plan B can be written.
- **Seven of SPEC §10's twelve freeze-tier rows** (`codes:closed`, `caps:exhaustive`, `synth:names`,
  `scaffold:hash`, `numbers:frozen`, `links:truth` for `demo/*`, `viewport`). They need `agency
  freeze`, a Playwright run or a committed `demo/`. They are **absent rather than
  present-and-permanently-SKIPPED**, because a row that can only skip reads as coverage.
- **The four `yagoda-starter` fixes in SPEC §12.** Independent of this framework, tracked separately,
  and the sibling repo is read-only under HARD RULE 7.
- **English onboarding docs and a second-operator workflow.** Deferred to the day-45 test per A5.

---

## Deviations from the plan

1. **`Ctx.query` is `Record<string, string | string[]>`**, not the plan's `Record<string, string>`.
   `config.params` was being flattened with `String(v)`, so `paramsSerializer: { indexes: null }` —
   the thing the reference client spends fifteen lines of doc comment on — was ignored and
   `{ tagIds: ['a','b'] }` reached a handler as the string `'a,b'`. `Record<string, string>` cannot
   represent what express delivers.
2. **`Ctx` carries `now`.** `MockAdapterOptions.now` looked like the clock seam but reached only the
   error envelope, so every handler needing a timestamp reached for `new Date()` and the demo became
   clock-dependent. One instant per request, which is also the request-scoped-clock semantics
   conversion wants.
3. **`ApiError` and the interceptor live in `packages/mock`, not the template.** SPEC §6.3 claims
   everything above the seam is byte-identical to the product; the template had no interceptor at all.
   A copy in the template is a copy per mock and cannot be fixed centrally.
4. **`golden.json` is ~2 400 cases, not 300** — the plan's `if (cases.length >= 300) break` breaks the
   inner loop only.
5. **The template ships a render smoke test.** Not in the plan. The gate proves a mock *builds*; a
   mock whose `OverviewPage` throws on mount passes `tsc -b && vite build` and `vitest run`, and
   BUILD-PROMPT's answer to that is "confirm by eye". Mounting it in jsdom turns the one manual step
   into a check. Guarded by an assertion that the template must contain a test that mounts and
   asserts — `tests.length > 0` did not hold it up, because `calc.test.ts` satisfies that alone.

---

## What a check should have caught and didn't

The most valuable section, and the input to Plan B's registry rows. All nine of the previous round's
ranked defects are now closed; these are the ones that reached a commit.

| Missed | Where it landed | Now caught by |
|---|---|---|
| Build output emitted into a mock's own `src/` — eleven `.d.ts` files | I introduced it: the `composite` base a mock inherits | `emit:clean` |
| A stale `tsbuildinfo` returning exit 0 over a tree `--force` rejected with 3 errors | the root `typecheck` script | `typecheck` now runs `tsc -b --force` |
| The gate running on node 22 while `engines` demanded `>=24` | the environment | `engines` — FAILED, not skipped |
| A reviewer's mutation artifact (`export const mutationTypeError: number = "not a number"`) committed into the money module | my own `git add -A`, staged after I ran verify rather than before | nothing new — `typecheck` catches the class immediately; **the gap was the sequence, not the tooling** |
| `CLAUDE.md` naming a file that did not exist | the memo | `docs:truth` |
| A hand-edited memo table drifting from the registry | the memo | `memo:drift`, checksummed over the RAW registry strings |
| A `.d.ts` committed beside the `.ts` it was generated from | `packages/synth/src/corpus.d.ts` | `emit:clean` |

**Two that remain uncaught, and are the honest input to Plan B:**

- **A flaky red is worse than no gate**, and this layer produced two of its own before it produced
  any real ones.

  *First:* three contract assertions shelled out to a repo-wide 12-thread oxlint from inside parallel
  vitest workers and produced an intermittent false `no-unused-vars` on a constant demonstrably used
  26 lines later. They moved into the registry, where the runner is sequential.

  *Second, and mine:* the `build` row scaffolds a throwaway mock at `mocks/verify-build-<pid>/`, and
  `mocks/*` is in the root vitest glob — so a `pnpm test` overlapping that window collects a directory
  that vanishes underneath it. Measured: a full-suite run reported `1 failed | 58 passed` while every
  one of its 2 820 tests passed. The prefix is now reserved on **both** sides — excluded from the
  vitest projects and skipped by `test:parity`'s disk walk — because reserving it on one side only
  would have made the parity check the flaky one instead. It is not a hole: a transient mock's tests
  are run, by its own vitest, by the very row that creates it.

  Nothing prevents the next author from reintroducing either pattern.
- **Nothing measures whether a test can fail.** No coverage, no mutation testing. The golden fixture
  asserted `dec` against itself for 675 cases and was green throughout; it was caught by an agent
  mutating the module by hand, not by a check. Every `proves` sentence in `scripts/verify/registry.mjs`
  is an unverified claim in exactly this sense.

---

## Process note

Several subagents exceeded their briefs — an audit fleet instructed to be strictly read-only committed
Task 3, and later agents implemented Tasks 9 and 10 unprompted. Every result was verified rather than
trusted: across three review rounds, **36 of 37 and then 33 of 33 mutations went red**, and the gaps
that did not are recorded above. The one defect that reached a commit and stayed there (the mutation
artifact) was mine, and it was a sequencing error: I ran `pnpm verify:full`, then staged with
`git add -A`, and did not re-run verification against what I had staged. The rule that prevents it is
the one this whole layer is about — verify what you are about to claim, at the moment you claim it.

---

# The contract layer — 2026-09-12

The contract lab (`packages/mock/src/lab/`, three competing styles over one domain) is combined into
one shipped standard and deleted. A is the spine; B's `NoInfer` and registry-keyed `fail()` and C's
wire golden are grafted on. The lab was never tracked by git, so its deletion is a working-tree
removal, not a commit diff — what it contributed is recorded below instead.

## The design was measured, not reasoned

Fourteen type-level probes were run before any of this was written. **Three overturned a design that
looked right**, and each would have shipped as a check that could not fail:

| Assumption | What tsc 6.0.3 actually does |
|---|---|
| `JsonSafe<T>` can constrain a declaration (`Res extends JsonSafe<Res>`) | **TS2313, circular constraint** — on a type alias *and* on a function type parameter. It has to be a conditional tripwire. |
| A shallow `Exact` stops a wide store row reaching the client | It compares TOP-LEVEL keys only. The wide row nested in `data[]` — the list endpoint, i.e. the one that matters — sailed through. |
| `wire()` can read its target from the handler's return type | The contextual type is `Res \| Promise<Res>`, and `keyof (A \| Promise<A>)` is empty, so **every property mapped to `never`** and the check was noise until `Awaited<T>` was added. |

Three more findings that are not in any document I could have read:

- **`NoInfer` is load-bearing twice.** Without it the actual type collapses into the declared one and
  the exactness check evaporates — a second, unadvertised reason beyond the one the lab recorded.
- **A never-returning `fail()` narrows only from a function declaration or an explicitly-typed
  const.** A destructured `const { fail } = makeContract(...)` does not narrow, and neither does
  `contract.fail(...)`. Vitest strips types, so this would have passed the suite and surfaced later
  as a red `pnpm typecheck`.
- **`after` in the verify runner is POSITIONAL, not a dependency graph.** `wire:frozen` declared
  `after: ['build']` but sat above `build` in the array and was reported NOT_RUN — correctly. A row
  that depends on another must be declared below it.

## Measured defects fixed, with the evidence

| Defect | Measured |
|---|---|
| `call()` with an empty path param | `params: { id: '' }` built `/parties/`, the adapter absorbed the one trailing slash, **the LIST route answered 200** and its envelope was cast to the detail type. Now a throw. |
| A 204 carrying a body | A handler returning `null` puts literal JSON `null` on a 204; returning nothing yields `''`, which is what axios gives against a real Nest 204. The DELETE operation declares `res: void`. |
| Unclamped paging | `limit:-1` returned rows and echoed `-1`; `'12abc'` became 12; `'0x10'` became 0. Now strict `/^\d+$/` then `Math.max`/`Math.min`, and the CLAMPED values are what the envelope echoes. |
| Module-scope stores | `vitest run packages/mock/src/lab --sequence.shuffle.tests --sequence.seed=99` gave **2 failed / 36 passed**. Stores are per-caller factories; the new suite passes at three seeds with files and tests both shuffled. |
| A tautological control | `Equal<{generatedAt:string}, {generatedAt:string}>` in the lab — caught by `contract:controls` on its first run. |
| A malformed balance | Reached `asDecimal2` and threw, so the adapter returned a 500 where a 400 with a code belongs. |

## What the lab contributed, and where it lives now

`shared/store.ts` → `packages/mock/src/store.ts` (a factory) · `shared/query.ts` →
`packages/mock/src/query.ts` (clamped) · `shared/type-assert.ts` → `packages/mock/src/contract.ts` ·
A's registry → the spine plus `KEEP_AS_CONST` · B → `NoInfer`, registry-keyed `fail()`, and the idiom
of asserting a WEAKNESS as a live type · C → the wire golden, rebuilt from the route table, and
`bind.ts`'s regex replaced by `api:bound` on the TypeScript AST.

**Three of the lab README's claims were false and are corrected in the code comments**: a path rename
does NOT go red on both sides (only param renames do), A's `codes` were inert (B's `fail()` was the
mechanism), and C's "a check that goes red" did not exist.

## Final state, measured at HEAD

```
pnpm verify        12 PASSED, exit 0        (fast tier)
pnpm verify:full   15 PASSED, exit 0        (adds template:render, build, wire:frozen)
```

Four new rows: `api:bound`, `contract:complete`, `contract:controls` (fast) and `wire:frozen` (full).
A scaffolded mock builds, and its dist CSS carries `bg-card`, `text-primary` and `rounded-xl`, so
Tailwind still reaches the kit.

## What is still open

- **`contract:complete`'s code clause is reachability by LITERAL.** `routes.ts` passes rule-returned
  codes (`blank.code`), so the check matches the literal anywhere under `src/` rather than proving a
  `fail()` site for that operation can emit it. The opposite direction is held by the type system.
- **The template's drift controls are compiled only inside a scaffolded mock.** `contract:controls`
  proves the packages' controls are in the tsc program and that the template's sit where a mock's
  tsconfig will find them; that they still bite is established by the `build` row.
- **The wire golden drives each operation once**, with one set of arguments, against the seeded
  store. Error envelopes, second pages and every refusal path are unfingerprinted.
- **The scaffold is bigger at t=0 than SPEC 5's "one placeholder screen"** — two screens and six
  operations, because modelling a PATCH and a DELETE/204 was required and `api:bound` insists every
  operation is reached by a screen.
- **Nothing measures whether these new tests can fail.** No coverage, no mutation testing. Every
  `proves` sentence in the four new rows is an unverified claim in exactly that sense.

### One blind spot found in an existing check, while writing the memo

`packages/cli/src/docs.contract.test.ts` asserts that every backticked `src/...` path in `CLAUDE.md`
names a template file carrying `@scaffold-owned`. Its test is `toMatch(/@scaffold-owned/)` — which a
sentence saying **NOT** `@scaffold-owned` satisfies just as well. Writing decision 1 into the memo
produced exactly that: a backticked `src/api/contract.ts` whose file denies the marker, and the test
went green on the denial.

The memo no longer backticks that path, so nothing currently depends on the weakness. It is recorded
rather than fixed because the fix is a judgement about the check's intent — presence of a marker, or
absence of a negation — and that belongs with whoever owns the scaffold-owned list. It is the same
species as the defects in "what a check should have caught and didn't": the check compares a string
against a file rather than against the claim.

---

# The contract layer, second pass — Phase 1, 2026-09-13

Plan: `docs/2026-09-13-contract-layer-plan-phase-1.md`. Design:
`docs/2026-09-13-contract-layer-design.md`. Intent and the nine success criteria: `docs/intent.md`.

Phase 1's premise was that **three guarantees the memo stated as enforced were not enforced**, and
underneath them a pattern: fourteen checks existed and not one had ever been observed going red.
That is `packages/dec/golden.json` asserting `dec === dec` for 675 cases, one level up.

## What was measured, and what the measurement changed

| Claim as it stood | Measured | Now held by |
|---|---|---|
| A wider store row cannot reach the client (`wire()`, "it is DEEP") | `wire()` was OPT-IN. `getParty: () => stored` compiled clean against the real `HandlersOf`, in the exact shape `routes.ts` uses — excess-property checking never fires on a contextually typed arrow's return | `satisfies HandlersOf` + `toRoutes` returning `LeakFree<…>`; three sink controls whose directives were all `TS2578: Unused` before the change |
| Hoisting the registry into a shared package turns two rows red (decision 4) | Both checks returned early with **no problem pushed** when `src/api/contract.ts` was absent, and counted the directory anyway | Both checks push a problem; a mock is identified by its DIRECTORY; `checks:bite`'s `mock-without-contract` |
| `api:bound` fails any raw `httpClient` verb in a screen (decision 5) | `/httpClient\|axios/i` against the callee text; 13 of 19 spellings evaded it, the unaliased `httpClient({ url })` above all — an AxiosInstance is callable, so the callee is an Identifier and the branch never ran. Two false reds (`httpClientCache.get`, `axiosLike.get`) | An opaque `Transport` only `call()` unwraps: TS2339 in every file a mock compiles. The regex clause is DELETED |
| `codeOf(key, e)` returns the operation's closed set | The adapter minted `NOT_FOUND` and `INTERNAL`, the router `BAD_REQUEST`; no operation declares them. `const code: undefined = codeOf('listParties', err)` typechecked and equalled `'NOT_FOUND'` | `DomainError.code` optional, envelope omits it, `codeOf` filters against `api[key].codes` at runtime |
| `NoInfer` is load-bearing twice | Did not reproduce — stripping both occurrences left every diagnostic byte-identical. The word now appears nowhere in `packages/mock` | Deleted from the memo. `Awaited<R>` IS load-bearing, but not where it looked — see below |

## What a check should have caught and didn't

- **`contract-complete.mjs` harvested every `return {…}` in `routes.ts`.** Measured against the
  pre-anchor pair (check and template at `eb6259f`): with the `getParty` handler deleted and only
  `function decoy() { return { getParty: 1, overview: 2 }; }` appended, it exits **0** and prints
  "6 operation(s) — each has a handler". Now anchored on `satisfies HandlersOf<…>`, which also makes
  the annotated-factory spelling a LOUD red rather than a silent loss of exactness.
- **A loop whose entire body was `continue`**, under a comment describing a check. Deleted; the
  direction it pretended to hold is now `toRoutes` throwing at runtime, which fires for the spread
  and the cast that tsc's excess-property check does not see.
- **`api:bound` declared `after: ['typecheck']` while consuming no tsc output.** Measured after the
  drop: with `typecheck` FAILED, `api:bound` now reports PASSED rather than NOT_RUN.
- **`contract-deleted` did not reproduce the bug the plan wrote it for.** Removing the only contract
  in a tree leaves `checked === 0`, so both checks went red down the empty-root guard — a path with
  nothing to do with the hole. The harness said so in its own words ("went red, but the output never
  mentions …"), which is the first time this layer has caught a *fixture* being wrong.
- **`checks:bite` itself could not tell FAILED from SKIPPED, and never checked its own baseline.**
  Found by an adversarial review of the row *after* it was written, which is the point of running
  one. It counted any non-zero exit as a bite — so a check that SKIPPED because a precondition was
  absent, or was UNRUNNABLE because it could not start, would have passed as one that failed, and
  `engines` is exactly where that bites: the registry maps its exit 2 to SKIPPED. Worse, it never
  ran the derived tree WITHOUT the defect: measured, a templates-only tree already exits 2 from
  `engines` before anything is planted, so the "red" would not have been caused by the plant at all.
  Both are fixed — a control run that must be green, and an exit code that must be 1 — and both were
  measured biting on a stub that goes green on a clean tree and exit-2 on a planted one. That is the
  `dec === dec` shape a third time: the row written to prove checks can fail could itself not fail
  correctly.
- **`Awaited<R>` is load-bearing in the other direction from the one assumed.** Strip it and an
  async LEAK is still reported — `keyof Promise<Party>` is `then | catch | finally`, none of which
  the response declares, so the comparison fails for the wrong reason. What breaks is that every
  CORRECT async handler reads as a leak. The first four controls written for this were all green
  with the unwrap removed; `AsyncExactIsNotALeak` is the one that goes red.
- **The `api:bound` registry row's `proves` string was false for four commits** — it still claimed a
  raw `httpClient` verb in a screen was red after that clause was deleted. `memo:drift` cannot catch
  this: it compares the registry to the memo, never either to reality.

## Final state, measured at HEAD

```
pnpm verify       13 PASSED, exit 0, not narrowed
pnpm verify:full  16 PASSED, exit 0, not narrowed
checks:bite        8 fixtures, every one red and naming its planted symbol
```

## What is still open

- **The cast residual is permanent.** `const out: Party = wideRow; return out;` is green under
  `wire()`, under a brand and under `LeakFree` alike. `annotatedWideningIsGreen` pins it as a live
  type and the wire golden is the ground truth — which is why Phase 3 makes the golden exhaustive.
  If a future reader takes `LeakFree` for a guarantee the way `DeepExact` was taken, the same error
  recurs one layer over. This is the weakest point in the design.
- **`checks:bite` covers 5 of 13 rows.** `intent.md` §5 criterion 2 asks that EVERY check be
  observed going red; Phase 1 delivers the row and ten fixtures across `contract:complete`,
  `contract:controls`, `api:bound`, `engines` and `emit:clean`. Criterion 2 is therefore **not yet
  met**, and saying so is the point of the row. The other eight were each measured on 2026-09-13:
  none is impossible, all need a harness or check change first, and the two largest — `build` and
  `wire:frozen` — would each need `pnpm install` inside a fixture, which is the cost that keeps them
  out of the fast tier in the first place.
- **A fixture can only exist for a check that takes `--root`.** `typecheck` takes none and does not
  compile `templates/mock` at all, so the leak-at-the-sink defect has no fixture and is recorded as
  deliberately absent in the row's `blindSpot` rather than faked.
- **`contract:complete`'s code clause is still reachability by LITERAL** — Phase 3.
- **The template's 467 test lines and its type-level tripwires still run only in `verify:full`** —
  Phase 3 step 14.
- **No coverage, no mutation testing.** Every `proves` sentence written for `checks:bite` is itself
  an unverified claim in exactly the sense the row exists to fix.
- **The `@scaffold-owned` memo blind spot recurred, and nothing stopped it.** The note above records
  that `docs.contract.test.ts`'s `toMatch(/@scaffold-owned/)` is satisfied by a sentence saying
  **NOT** `@scaffold-owned`, and that the memo no longer backticked the one path that exploited it.
  Task 2 of this phase reintroduced a backticked `` `src/api/contract.ts` `` in an ordinary
  explanatory sentence and the suite stayed green — the property was restored by rewriting the
  sentence to the full `templates/mock/…` form, but nothing would have caught it. A convention that
  an ordinary sentence can re-break, silently, is the same species of defect as the rest of this
  section.
