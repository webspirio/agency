# Build report — Plan A

**Date:** 2026-09-10
**Built by:** 15 subagents in four waves (one builder plus one independent reviewer per task), then a
gate agent that built none of it.
**Plan:** `docs/PLAN-A.md` · **Spec:** `docs/SPEC.md` · **Rules:** `BUILD-PROMPT.md`

---

## Gate

**Kill criterion #1 does not fire.** `agency new` → `pnpm install` → build → test produced a built,
green, clickable mock in **7.342 s** against a 1200 s bar — clearing it by ~163×, with zero
hand-edits.

| Phase | Wall clock | Note |
|---|---|---|
| scaffold | 0.06 s | 22 files, zero unsubstituted handlebars, all `.hbs` consumed |
| `pnpm install` | 3.33 s | 977 ms of it is pnpm's lockfile supply-chain scan — fixed overhead |
| build (`tsc -b && vite build`) | 2.93 s | vite 583 ms / 215 modules; dist 62 kB CSS, 415 kB JS (135 kB gz) |
| test | 0.97 s | 3 tests green |

**Styling verified from the emitted CSS**, not by eye: `bg-card`, `text-primary` and `rounded-xl` are
present in `dist/assets/*.css`, which they can only be if Tailwind scanned the kit through the
`@source` line. That was the silent failure the gate existed to catch, and it did not occur.

The gate agent nonetheless reported `passed: false`, correctly, because `BUILD-PROMPT`'s definition of
pass includes green tests and two contract checks were red. Both were meta-layer and neither touched
the scaffolder; both are now fixed (below). **The spec's §17 Day-4 fallback is not invoked.**

---

## Final state

```
pnpm test        2764 passed (55 files)
pnpm lint        exit 0 — 147 files, 0 diagnostics, oxlint 1.82.0
tsc -b --force   exit 0
node scripts/verify/checks/lint-exempt.mjs   6 exemptions suppressing 31 findings, all accounted for
```

Nineteen commits. Packages: `dec` (7 files), `synth` (5), `mock` (13), `kit` (102), `cli` (8), plus
`templates/mock` (18) and `scripts/verify`.

---

## Deviations from the plan, and why

**1. Task 3 was dead as written. `oxlint` does not implement `no-restricted-syntax`.**
Verified independently: oxlint 1.82.0 rejects the config outright with *"Rule 'no-restricted-syntax'
not found in plugin 'eslint'"*, and `grep -c '"no-restricted-syntax"' node_modules/oxlint/configuration_schema.json`
returns 0. The plan generalised from a research finding about `no-restricted-imports` — a different
rule that does exist. The lint agent replaced it with a **JS plugin** exposing five custom rules
(`agency/no-float-arithmetic`, `no-decimal-comparison`, `no-numeric-coercion`, `no-implicit-sort`,
`no-random-id`). This is strictly better than planned: the rules are named, so an exemption says which
hazard it is accepting.

That agent then did the verification the plan did not ask for. Against a **copy** of
`yagoda-starter/backend/src/intakes` (14 real files, sibling repo untouched): `return a.amount > b.amount`
now errors where the original probe measured exit 0; `return a * b` errors; and the 14 real files
produce **zero** findings — no false positives on real backend code. They mutation-tested the fixture
— deleting any one of the five rules turns exactly one test red — and probed the silent-failure path:
deleting the plugin makes oxlint exit 1 with "Failed to load JS plugin", not exit 0.

**2. `golden.json` is 675 cases, not the plan's 300.** The plan's `if (cases.length >= 300) break` is
ordered a-major, so it truncates at pair 100 of 225: eight of fifteen values never appear as a left
operand, and `mul('100.00', '47.8032')` — the one case the entire scale-generic design exists for — is
absent from the fixture. The dec agent measured this before generating and dropped the cap.

They also refused to let the fixture be circular: all 675 rows were cross-checked against an
**independently formulated oracle** (half-added-then-floored, reproduced from reading
`backend-money.ts` rather than importing it) where `dec.ts` compares twice the remainder to the
divisor. 675 rows, 0 mismatches. And the guard-digit division was checked exhaustively over 20,826
`(value, divisor)` pairs against exact rational half-up-away-from-zero: 0 mismatches.

**3. `packages/synth`'s mulberry32 needed no lint exemption.** The plan predicted `Math.imul` plus
division would trip the rules. The synth agent had already rewritten it to stop short of
`/ 4294967296` and reduce with `%`, citing this rule set as the reason — before the rules existed. The
doctrine propagated ahead of the check.

**4. The adapter honours `config.validateStatus` instead of hardcoding `status >= 400`.** Since
`validateStatus` is settle()'s own test, `validateStatus: () => true` now behaves in the mock exactly
as it does against the product. This removed one comparison and the exemption ratchet fired on the
improvement — which is the direction it is allowed to move.

**5. `--like <slug>` was removed from the CLI's usage string.** It is advertised in the plan but
implemented in neither `newMock`'s signature nor the bin, and an existing mock has no `.hbs` files —
so it would copy one client's slug, title and locale into another. Shipping a flag that silently does
the wrong thing is worse than not having it.

**6. The template ships a neutral palette, not yagoda's berry.** Re-theming is "swap the hex values in
`:root` and `.dark`"; shipping one client's identity as the scaffold default invites it into the next
client's demo.

**7. The plan's step counts are wrong throughout** — they count `describe` blocks, not `it` blocks
(Task 1 predicts 7, actual 10). No code implication; recorded so nobody reads the mismatch as a missing
test.

---

## Fixed after the gate

- **`docs/BUILD-REPORT.md`** — this file. `docs.contract.test.ts` was red because `CLAUDE.md` named a
  file that did not exist. The check was right.
- **`lint-exempt` baseline** for `packages/mock/src/adapter.ts`, 2 → 1, with the reason rewritten to
  describe the `validateStatus` change rather than the deleted `status >= 400`.

---

## Open, ranked

**1. Thirteen lint exemptions are whole-file, and should be line-level.** `packages/mock/src/adapter.ts`
and nine kit components are now permanently unchecked for real money bugs because of one
`status >= 500` or one `index > 0`. oxlint supports `// oxlint-disable-next-line agency/<rule>`, which
keeps the rest of each file covered and is the doctrine-correct shape: the exemption travels with the
line it excuses, not with the file. All 24 suppressed findings were independently enumerated and read
by the reviewer; every one is a genuine false positive (SVG geometry, rAF easing, CSS width %, array
lengths, HTTP status integers, and two tests where the bare `.sort()` *is* the assertion). The code is
defensible; the granularity is not.

**2. `render()`'s nested `{{#each}}` regex is broken.** `/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g`
is non-greedy, so an outer block terminates at the inner `{{/each}}` and each item renders as
`[object Object]`. Reproduced independently by two agents against the plan's own `profiles.ts.hbs`.
The template was restructured so nothing depends on the broken path and a test forbids nesting — but
the regex is still wrong.

**3. `newMock()`'s `cpSync` copies the template directory blind**, including anything gitignored. It
should filter `node_modules`, `dist`, `*.tsbuildinfo`, `.DS_Store`.

**4. The generated mock emits build output into its source tree** — eleven `.d.ts` files and a
`tsconfig.tsbuildinfo` land in `mocks/<slug>/src/`. Nothing failed on it. First thing to confuse a
client-facing repo; a natural `agency check` row.

**5. `pnpm typecheck` can lie.** The root script is incremental `tsc -b`, and a stale `tsbuildinfo`
returned exit 0 over a tree that `tsc -b --force` rejected with 3 errors. `workspace.contract.test.ts`
— written precisely because typecheck once shipped red for eight commits while tests stayed green —
invokes the same incremental form and inherits the blind spot it was built to close. Both are green
under `--force` now; the check needs the `--force` variant or a freshness assertion.

**6. The `@source` glob is `*.tsx` only** and misses class names in kit `.ts` files. Today exactly one
exists (`focusRing` in `lib/cn.ts`) and every utility in it also appears in eight `.tsx` files, so
nothing is missing from dist CSS. It is a live silent-failure seam.

**7. `oxlint` is pinned `^1.77.0` and resolved to 1.82.0.** The rule set moved under the linter once
already. Pin it exactly.

**8. Node is v22.23.1 while `engines` demands >= 24**, so every pnpm call warns. The gate ran on an
unsupported configuration.

**9. The kit's theme key is a hardcoded `web-starter:theme`**, shared by every mock on one origin.
Harmless in production (one Worker per slug) but two mocks on `localhost:5173` share a theme.

---

## What a check should have caught and didn't

This is the input to the verification layer's registry rows.

| Missed | Would-be row |
|---|---|
| Build output committed inside `mocks/<slug>/src/` | `no-emit-in-src` |
| A stale `tsbuildinfo` handing the workspace a false green | `typecheck:forced` |
| Whole-file lint exemptions where a line-level one would do | `exempt:granularity` |
| A template placeholder in a file type with no escaper | already caught — the CLI refuses it |
| `@source` missing class names in `.ts` | `source-glob:coverage` |
| The gate running on the wrong Node major | `engines:actual` |
