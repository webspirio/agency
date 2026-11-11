# agency — instructions for the agent

A workspace that turns "sales call → clickable CRM mock → sometimes a real NestJS product" into a
repeatable standard. Five packages (`dec`, `synth`, `mock`, `kit`, `cli`), one template, one
scaffolder. `docs/SPEC.md` is the design and its evidence, `docs/PLAN-A.md` the plan,
`docs/BUILD-REPORT.md` what was built and what is still open. `docs/CHECKS.md` says what every
verify row proves and misses; `docs/CONTRACT.md` is the reasoning behind the contract, seam and
money rules below — read it before changing any of them.

> A standard may propagate only as (a) something the deterministic scaffolder writes at t=0, or
> (b) a check that goes red. Never as prose.

This file is prose, so it documents the checks; it does not replace them.

## Verification — run it before a turn ends

```bash
pnpm verify        # fast tier, ~45s: other rows run concurrently, then vitest runs alone
pnpm verify:full   # + renders the template, installs, builds and tests a real mock
pnpm verify:ci     # the CI form: a SKIPPED check counts as a failure
```

`--only <id>` narrows a run (recorded, so the green is not a verdict on the tree), `--no-skip` makes
a skip blocking, `--reuse-if-fresh` serves the last green when no hashed byte changed, `--explain`
prints every row's blind spot. On green the footer is short; the per-row text is in `docs/CHECKS.md`.

When a row goes red: **fix the code.** Do not edit a rule, add an ignore or `it.skip`. If a check is
genuinely wrong, say so and leave it failing — `docs/SPEC.md` §17 names "the operator disables a row
rather than fixing what it caught" as the signal to abandon the whole strategy.

| Status | Means | Blocks? |
|---|---|---|
| `PASSED` | the command ran and exited 0 | no |
| `FAILED` | the command ran and did not succeed | yes |
| `SKIPPED` | a precondition was absent, so nothing was checked | only under `--no-skip` |
| `NOT_RUN` | a dependency did not pass, so this was never started | yes |
| `UNRUNNABLE` | the command could not start at all | yes |

Never fold one into another; when you report, say which you got. **The fast tier does not build**:
no `vite build`, no bundle, no browser, no coverage — the `@source` line and anything else that only
breaks in a bundle is `pnpm verify:full`'s job.

```bash
pnpm test         # vitest, both projects (node + dom)
pnpm typecheck    # tsc -b --force — FORCED: a stale tsbuildinfo once returned 0 over a red tree
pnpm lint         # oxlint --max-warnings=0 over packages templates mocks
pnpm lint:exempt  # the exemption ratchet
pnpm verify:write # regenerate docs/CHECKS.md after editing the registry
```

`.claude/hooks/stop-gate.mjs` runs the fast tier at the end of every turn — with `--reuse-if-fresh`,
so a turn that changed no hashed byte costs nothing — and **blocks** on red, at most twice per
prompt. A message saying the turn is UNVERIFIED is never a green tree. The Stop hook resolves node
from `.nvmrc` via `.claude/hooks/node.sh` (this repo pins 24; the shell default is 22).

### Keeping the loop fast

- **While iterating, run only the tests you touched**: `npx vitest run <file>` (~1–3s per file).
  The whole suite is ~35s and the Stop gate runs it anyway.
- **Subagents do not run `pnpm verify` or the whole suite.** Parallel agents each doing so share the
  CPU: measured, a 3s test file averaged 9s and verify reached 5 min. The orchestrator verifies once.
- **Never poll** (`sleep` loops waiting for another agent's file). Wait for the agent's completion.
- Pipe long output through `tail`/`grep`; do not read a 3000-test report into context.

## Hard rules

Each is downstream of a measured failure recorded in `docs/SPEC.md`.

1. **TDD, always.** Failing test, watch it fail *for the stated reason*, then implement.
2. **Never weaken a check to go green.**
3. **Money is decimal strings.** `packages/dec/src/dec.ts` is the only module allowed to do the
   arithmetic. No `Number()`, `parseFloat`, `toFixed`, no float, no integer minor units.
4. **Ids are `seq()` or a ULID, store-assigned.** Never `Math.random()`, never implicit array order.
5. **Branch on `code` only** — `error` is the HTTP phrase and is decorative. Pagination is
   `{ data, total, page, limit }`.
6. **No new runtime dependencies.** Forbidden in a mock's `dependencies`: `msw`, `@mswjs/data`,
   `@electric-sql/pglite`, `zod`, `i18next`, `react-i18next`. Reasons in `docs/SPEC.md` §14.
7. **`reference/` is read-only**, and the sibling repos under `/Users/oleksandrsecond/Projects/` are
   live. Read them, never write to either.
8. Never `git reset --hard`, `git clean`, or `git checkout .`. Other agents share this tree: commit
   with an explicit pathspec, `git add <paths> && git commit -F - -- <paths>`.

## Money and pixels

`oxlint.base.json` ships to every mock. The money rules are on everywhere except `**/src/pages/**`
and `**/src/components/**` (chart coordinates), and those paths may not import `@agency/dec`:
**money is computed in the domain and api layers; a component receives a finished string.**
`packages/kit` is held to the rule.

An exemption goes **on the line**: `// oxlint-disable-next-line agency/<rule> -- why`.
`reportUnusedDisableDirectives` in `.oxlintrc.json` turns a stale one red. Exactly two whole-file
per-rule overrides exist — `packages/dec/src/dec.ts` and `packages/kit/src/sparkline.tsx` — ratcheted
against `scripts/verify/baselines/lint-exempt.json`.

## The seam

One `axios.create`, one adapter, one line of difference between a mock and the product. A custom
axios adapter owns status handling, so **the mock adapter must throw on a refusal** — one that
resolves a 409 hands it to TanStack Query as a success. The `seam:settle` row holds the premise.

## The contract

One registry per mock, **one entry per operation**: `templates/mock/src/api/contract.ts` carries
method, path, success status and `codes: { CODE: status }`, with request/response/query types on the
same entry via `op<Req, Res, Qry>()`. Handlers, call sites, refusals and each screen's message table
are derived from it by type; the generic half is `packages/mock/src/contract.ts`.

- A screen never writes a URL: `call(httpClient, '<operation>', { params, body, qry })`, and cache
  keys come from `queries.query('<operation>', args)` in `templates/mock/src/api/queries.ts`.
- `fail(key, code, …)` takes no status — it is read off the registry. A refusal status is 4xx/5xx.
- Handlers end in `satisfies HandlersOf<Api, Io>` (never a return-type annotation); exactness is
  checked once, at `toRoutes`. A cast or an actor branch evades it; the wire golden is the ground truth.
- A malformed body answers 400 with `message: string[]` and no `code`. A shape declaration must not
  duplicate a domain rule — rules live in `templates/mock/src/domain/rules.ts` and carry the codes.
- Live type-level weaknesses are pinned in `templates/mock/src/api/drift.controls.ts` and
  `packages/mock/src/contract.controls.ts`.
- The contract file is deliberately NOT `@scaffold-owned`; the registry is never hoisted into a
  shared package (`api:bound` and `contract:complete` go red).

Why each of these holds, with the measurements: `docs/CONTRACT.md`.

## Scaffolding a mock

`agency new` is the **only** supported entry point. Do not hand-copy the template.

```bash
node packages/cli/bin/agency.mjs new <slug> --title "Title" --locale de --profiles solo,full
pnpm install && pnpm --filter <slug> build && pnpm --filter <slug> test
```

Five files carry `@scaffold-owned` because they fail *silently* when rewritten: `src/app/router.tsx`,
`src/api/client.ts`, the persist config in `src/main.tsx`, `src/profiles.ts`, and the `@source` line
in `src/index.css` — without it `bg-card` and `text-primary` are absent from the built CSS.

## The reference library

`reference/` is read-only prior art; `reference/CLAUDE.md` is the index. Tracked snapshots are
present on a fresh checkout; the gitignored clones are not, so never backtick a clone path here.
Read clones for structure, never for an API call, and never as a `package.json` candidate.

## Stop and say so, rather than working around it

A test you did not write starts failing · you need a dependency that is not installed (do not run
`pnpm add`) · two pieces of work want the same root file · a lint rule fires on code you believe is
correct · `seam:settle` goes red.
