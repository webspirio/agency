# `reference/` — prior art, and where to look for what

Nothing here ships. Nothing here is imported. HARD RULE 7 makes all of it read-only, and the
sibling repos it was copied from keep moving, so every snapshot is dated rather than current.

**Read a reference to settle a question, then convert the answer into a test or a registry row.**
A reference that only produces prose has not propagated — that is the doctrine at the top of the
root `CLAUDE.md`, and it applies to this directory more than anywhere else.

## Two shapes, and the difference is load-bearing

| | Tracked snapshots | Gitignored clones |
|---|---|---|
| What | a handful of files copied from a sibling repo | a full `--depth 1` git clone |
| Which | `money/`, `contract/`, `profiles/`, `verify/`, `print/` | the nine directories listed below |
| On a fresh checkout | **present** | **absent** |
| In CI | present | absent |

The clones are gitignored because `git add reference/` would record them as gitlinks pointing at
commits this repo does not contain, and a fresh clone would get nine empty directories.

**The consequence that bites:** a clone path is not a durable citation. `docs:truth` checks every
backticked path in the root `CLAUDE.md`, and CI runs `pnpm verify` on a fresh checkout — so a path
into a clone would be green on this machine and red in CI. Cite clone paths *here* (this file is
tracked but unchecked) and in each clone's own `CLAUDE.md`, never in the root memo.

Each clone carries a `CLAUDE.md` at its root: what it is, where to look, and what not to trust.
Those files live *inside* an ignored directory, so they are invisible to git and **a re-clone
destroys them**. That nearly happened on 2026-09-11. If you re-clone one, restore its guide.

## Which reference answers which question

### Money — the rule 3 surface

| Question | Go to |
|---|---|
| Split an amount N ways so the parts sum to the whole | `dinero/` — `src/core/utils/distribute.ts`, `src/core/api/allocate.ts`. `packages/dec` has no allocator: `div('10.00', 3)` is the scalar `'3.33'`. |
| What rounding modes exist, and what does each do on a negative tie | `decimal-js/` — `decimal.d.ts` names nine `ROUND_*`. `dec.ts` hardwires one. |
| Is `dec` actually correct, per an oracle it cannot produce | `decimal-dectest/dectest/quantize.decTest` — 776 fixed-point cases from IBM/Cowlishaw |
| What the three prior money modules did, and why they disagreed | `money/` (tracked) — the semantics `packages/dec` reproduces |
| Why `'1.2'` and `'1.20'` must not both exist on the wire | `money/canonical-decimal.ts` (tracked) |
| Which direction an FX rate multiplies, and where the base currency is named | `dinero/src/core/api/convert.ts`; contrast with `money/logistic-money.ts`, which divides |

### Determinism — the rule 4 surface

| Question | Go to |
|---|---|
| How to draw a bounded integer without modulo bias | `pure-rand/src/distribution/internals/uniformIntInternal.ts` |
| How to fork a second stream from one seed (and why `SEED + k` is wrong) | `pure-rand/README.md`, "Independent simulations" |
| How to draw n distinct items from a closed corpus | `faker/src/modules/helpers/unique-array.ts`, `shuffle.ts`, `array-elements.ts` |
| How to build names instead of listing them (trademark risk) | `faker/src/locales/de/company/name_pattern.ts`, and `faker/CONTRIBUTING.md` § "Sourcing data for definitions" |

### The seam, the app, and the product

| Question | Go to |
|---|---|
| The error envelope as it ACTUALLY is | `contract/all-exceptions.filter.ts` (tracked) |
| `{ data, total, page, limit }` | `contract/paginated.ts` (tracked) |
| The single `axios.create` and the `ApiError` shape | `contract/frontend-api-client.ts` (tracked) |
| react-router v8 error boundaries, at our exact majors | `react-router-examples/error-boundaries/` |
| Where a module or file belongs (layering) | `fsd-documentation/` |
| How a large React app is organised | `bulletproof-react/docs/` — **architecture only, its code is React 18** |
| A named pattern's shape | `design-patterns-typescript/src/<Pattern>/` — **TypeScript 3.3, read the shape only** |
| The profile module this repo ports | `profiles/` (tracked) |
| The 16-check harness this repo's registry reduces | `verify/` (tracked) |
| The one artifact that transferred mock → product unchanged | `print/yagoda-crm-print.css` (tracked) |
| Structure for a generated `demo/script.md` | `demo-scripts/` (tracked-ignored; quotes real client names) |

## The standing trap

Most of these are pinned at majors this repo does not run. bulletproof-react is React 18.3 /
react-router 7 / zustand 4 / Tailwind 3 / Vite 5 / TS 5.4; design-patterns-typescript is TS 3.3
with tslint. The template is React 19.2 / react-router 8.3 / zustand 5 / Tailwind 4.3 / Vite 8 /
TS 6. **Read those two for structure and vocabulary, never for an API call.** The three that do
match our majors are `react-router-examples/`, `pure-rand/` and `faker/`.

And the rule that outranks all of it: HARD RULE 6 forbids new runtime dependencies. dinero,
decimal.js, faker and pure-rand are **reading material, not candidates for `package.json`**.
