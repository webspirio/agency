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
