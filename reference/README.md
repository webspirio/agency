# reference/

Read-only source material copied from other repos on 2026-09-09. **Nothing here ships.**
It exists so an agent can read the prior art rather than reinvent it, and so the
decisions in `docs/SPEC.md` can be checked against the code they cite.

Do not import from this directory. Do not edit these files — they are snapshots, and
their source repos keep moving.

| Path | From | Why it is here |
|---|---|---|
| `money/backend-money.ts` | `yagoda-starter/backend/src/common/money.ts` | 99 lines, zero imports. The semantics `packages/dec` must reproduce, and the module its header says rejected integer minor units. |
| `money/frontend-decimal*.ts` | `yagoda-starter/frontend/src/shared/lib/money/` | The already-duplicated twin. Its `div` test expectations are the ones `packages/dec` must match. |
| `money/logistic-money.ts` | `logistic/src/lib/finance/money.ts` | The third, incompatible module: floats, a EUR/UAH pair, and a scale-4 rate the scale-2 validator would throw on. This is why `dec` is scale-generic. |
| `money/canonical-decimal.ts` | `yagoda-starter/backend/src/common/dto/` | Why `'1.2'` and `'1.20'` must not both exist on the wire. |
| `profiles/logistic-profile.*` | `logistic/src/lib/profile.ts` | The prior art `packages/mock/src/profiles.ts` ports. Note the header: the profile is deliberately not persisted. |
| `verify/**` | `yagoda-crm/scripts/verify/` | 16 checks as data, five statuses, AST ratchets with one-way dated baselines. Plan B generalises this into `agency check`. |
| `contract/all-exceptions.filter.ts` | `yagoda-starter/backend/src/common/filters/` | The error envelope as it ACTUALLY is — not the one the prior brief described. |
| `contract/paginated.ts` | `yagoda-starter/backend/src/common/dto/` | `{ data, total, page, limit }`. |
| `contract/frontend-api-client.ts` | `yagoda-starter/frontend/src/shared/api/client.ts` | The single `axios.create` and the `ApiError` shape the mock must not break. |
| `contract/intake-lines.ts` | `yagoda-starter/backend/src/intakes/` | 181 lines, pure except one `BadRequestException` on line 1. The shape every rules file copies. |
| `print/yagoda-crm-print.css` | `yagoda-crm/src/index.css` | The one artifact that transferred mock → product unchanged. |
| `demo-scripts/` | `yagoda-crm/docs`, `logistic/docs` | **Gitignored.** Structure reference for the generated `demo/script.md`. Quotes real client names. |
| `dinero/` | `dinerojs/dinero.js` v2.0.2, MIT, shallow | `core/utils/distribute.ts` + `core/api/allocate.ts` — splitting an amount so the parts provably sum to the whole. `packages/dec` has no such primitive: `div('10.00', 3)` is the scalar `'3.33'`, and nothing hands out the remainder. `core/api/convert.ts` is the second half — the rate multiplies on the DESTINATION side and its own scale is added, not discarded, which is what `fx.ts:46` decides by assumption. |
| `decimal-js/` | `MikeMcl/decimal.js` 10.6.0, MIT, shallow | Nine rounding modes and their tie behaviour on negatives. `packages/dec/src/dec.ts:50-59` hardwires exactly one — half-up away from zero — and `reference/money/backend-money.ts:24-29` records a second the same domain already needs (payout to whole hryvnia, 0.50 going DOWN) that HARD RULE 3 forbids implementing anywhere else. |
| `decimal-dectest/` | `cppalliance/decimal-dectest`, ICU licence, shallow | The IBM/Cowlishaw `.decTest` conformance corpus — the one oracle `packages/dec` cannot generate from itself. `golden.json` was once 675 cases of `dec === dec`, green while `dec` rounded the wrong way; `dectest/quantize.decTest` (776 cases) and `archive/dectest/rounding.decTest` are the fixed-point cases that cannot be produced by the module under test. |
| `faker/` | `faker-js/faker` 10.6.0, MIT, shallow | Company names are BUILT — `de` is `{{person.lastName}} {{company.legal_entity_type}}` over a 7-entry suffix list — never a literal list, and `CONTRIBUTING.md` §"Sourcing data for definitions" says why a compilation of facts is copyrightable even though facts are not. `packages/synth/src/corpus.ts:31` ships literal company names to artifacts shown to other clients. `test/modules/medical.spec.ts` writes the trademark screen down as a test; `helpers/unique-array.ts` is the sampling-without-replacement `stream.pick` cannot do. |
| `pure-rand/` | `dubzzz/pure-rand` 8.4.2, MIT, shallow | `distribution/internals/uniformIntInternal.ts` — the rejection loop that debiases a bounded draw. `packages/synth/src/stream.ts:34` is `next32() % maxExclusive`, under a comment asserting the bias is "below one part in 10^8" with no citation. Its README also names offsetting the seed as the documented WRONG way to fork a stream, which is what a second entity's `createStream(SEED + k)` would be. |
| `react-router-examples/` | `remix-run/react-router-examples`, MIT, shallow | react-router `8.0.0` + react `19.2.6` + vite `8` + typescript `6.0.3` — the template's exact majors, which is why it is here and most React exemplars are not. `error-boundaries/` is the three-layer boundary topology `templates/mock/src/app/router.tsx` has no equivalent of. |
| `fsd-documentation/` | `feature-sliced/documentation` @ `bfeacbb`, MIT, shallow | Feature-Sliced Design — the layering vocabulary (`app`/`pages`/`widgets`/`features`/`entities`/`shared`) a mock's `src/` is measured against. Shallow clone at `bfeacbb` (26 MB). It replaced a full-history clone of the same commit that cost 434 MB, 415 MB of it `.git`; the worktree is byte-identical (tree `304e0ed7`). |
