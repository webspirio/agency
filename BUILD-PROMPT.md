# Build the agency mock framework — autonomous, phased, one session

Repo: `/Users/oleksandrsecond/Projects/agency` — a fresh pnpm 11.5.2 workspace, Node 24.
Root config, `node_modules` and `reference/` are already in place. **Nothing in `packages/` exists yet.**
Push the the webspirio gh org.

Read first, in this order: `docs/SPEC.md` (the design and why every part of it is the way it is),
then `docs/PLAN-A.md` (ten tasks, 62 TDD steps, real code in every one). This file is the operating
manual that sits above both.

**Your job:** execute everithing but well planned and very well verified like in the /Users/oleksandrsecond/Projects/yagoda-crm project with good verification layer an i want you to always run verification and put these instuction into the claude.md file.
Build a good stable infrastructure first then build the actuall project on it.
---

# HARD RULES

1. **TDD, always.** Write the failing test. Run it. Watch it fail for the *stated* reason. Only then
   implement. A test that passes the first time you run it is a broken test — fix it before moving on.
2. **Never edit a root file from a parallel task.** `package.json`, `pnpm-lock.yaml`,
   `vitest.config.ts`, `vitest.setup.ts`, `tsconfig.base.json` and `pnpm-workspace.yaml` are owned by
   the orchestrator. If you need a dependency, **stop and say so** — do not run `pnpm add`,
   `pnpm install`, or `npm i`.
3. **No new runtime dependencies.** Everything Plan A needs is already installed. Specifically
   forbidden in any `dependencies`: `msw`, `@mswjs/data`, `@msw/data`, `@electric-sql/pglite`, `zod`,
   `i18next`, `react-i18next`. Each was rejected with a recorded reason in `docs/SPEC.md` §14.
4. **Never weaken a check to go green.** If a lint rule or a test catches you, fix the code. If the
   rule is genuinely wrong, say so in your report and leave it failing — do not edit the rule, do not
   add an ignore, do not `it.skip`.
5. **Money is decimal strings.** No `Number()`, `parseFloat`, `toFixed`, no float, no integer minor
   units. `packages/dec/src/dec.ts` is the only module allowed to do the arithmetic.
6. **Ids are `seq()` or a ULID, store-assigned.** Never `Math.random()`. Never depend on array
   insertion order.
7. **Do not touch `reference/`.** It is read-only snapshots from other repos. Read it, cite it, never
   import from it and never edit it.
8. **Do not touch the sibling repos.** `/Users/oleksandrsecond/Projects/{yagoda-starter,yagoda-crm,logistic,lab-crm,order-pharm}`
   are live. Read them; write nothing.
9. **Do not ask the user anything.** Decide, write the decision down in your report, keep going.
10. **Never run `git reset --hard`, `git clean`, or `git checkout .`.** To undo, revert only the
    specific files you touched, by name.
11. **Commit per task**, with the message given in the plan.

---

# THE PROPAGATION DOCTRINE

The one rule the whole framework is built on, and the reason so much is missing from it:

> **A standard may propagate only as (a) something the scaffolder writes at t=0, or (b) a check that
> goes red. Never as prose.**

This is the only inference the evidence licenses: 0% inheritance between two mocks written 16 days
apart by the same author, and 0% compliance with the one committed skill — `nest-module-conventions`
mandates `commands/` and `queries/` directories, and `find backend/src -type d` returns **0 across 23
modules**, in a repo where the skill's author wrote 68 of the commits.

So: if you are tempted to write a convention into a comment, a README or a CLAUDE.md as its
*enforcement*, don't. Either the scaffolder emits it, or a check fails on it, or it does not exist.

---

# HOW TO WORK

Tasks run in four waves. Within a wave, tasks touch disjoint directories and run in parallel.

| Wave | Tasks | Directories owned |
|---|---|---|
| 1 | `dec` (Plan A tasks 1–2), `synth` (4), `mock` (5–7), `kit` (8) | `packages/dec`, `packages/synth`, `packages/mock`, `packages/kit` |
| 2 | lint config (3) | `oxlint.base.json`, `.oxlintrc.json`, one fixture test |
| 3 | template (9) | `templates/mock` |
| 4 | cli (10) + **the gate** | `packages/cli` |

Wave 1's `mock` task owns Plan A tasks 5, 6 and 7 together because all three write
`packages/mock/src/index.ts`; splitting them across agents is a guaranteed conflict.

**Gate after every task:**

```bash
cd /Users/oleksandrsecond/Projects/agency
pnpm vitest run packages/<yours>     # your package only, while others are still being written
```

**Gate at the end of each wave** (orchestrator runs this, not you):

```bash
pnpm test && pnpm lint
```

---

# THE GATE — Plan A, Task 10, Step 6

This is a **measurement**, not a build step, and it can end the project.

```bash
cd /Users/oleksandrsecond/Projects/agency
time (node packages/cli/bin/agency.mjs new gate-test --title "Gate Test" --locale de --profiles solo,full \
  && pnpm install \
  && pnpm --filter gate-test build \
  && pnpm --filter gate-test test)
```

**Pass:** a built, green, clickable mock in under **20 minutes** of wall clock, **zero hand-edits**.
Then open `pnpm --filter gate-test preview` and confirm two things by eye:
the Overview screen renders with kit styling — if `bg-card` is unstyled the `@source` line is wrong,
and that is precisely the silent failure this gate exists to catch — and `#/` deep-links work.

**Fail:** **stop.** Do not start Plan B. Report what consumed the time, per phase. The spec's named
fallback applies: drop to a plain GitHub template repo plus `agency check` as the only shared artifact.

---

# STOP CONDITIONS — these matter more than finishing

Stop and report if any of these happen. Do not work around them.

- A test you did not write starts failing.
- You need a dependency that is not installed.
- Two tasks want the same file.
- A rule in `oxlint.base.json` fires on code you believe is correct.
- The kit extraction produces a component that imports something above `shared/` — the whole lift is
  premised on that set being empty, and it was measured empty on 2026-09-09.
- `grep -c settle node_modules/axios/lib/core/dispatchRequest.js` returns anything other than `0`.
  The adapter's throwing branch depends on it; if axios changed, the seam needs re-examining.

---

# WHAT "DONE" LOOKS LIKE

```bash
cd /Users/oleksandrsecond/Projects/agency
pnpm test        # green, both projects (node + dom)
pnpm lint        # exit 0
pnpm typecheck   # exit 0
node packages/cli/bin/agency.mjs new demo-x --locale de --profiles solo
pnpm install && pnpm --filter demo-x build   # green
rm -rf mocks/demo-x
```

Plus: one commit per task, and a report naming every decision you took that the plan did not make for
you, every deferral, and the measured gate time.

---

# REPORT FORMAT

At the end, write `docs/BUILD-REPORT.md`:

- **Gate:** pass/fail, wall-clock time, what dominated it.
- **Decisions taken** that the plan left open, with the reason.
- **Deferred**, with what triggered the deferral.
- **Deviations from the plan**, with why — the plan was written before the code existed and is
  allowed to be wrong.
- **Anything a check should have caught and didn't.** This is the most valuable section: it is the
  input to Plan B's registry rows.
