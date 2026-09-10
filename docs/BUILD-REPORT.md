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
