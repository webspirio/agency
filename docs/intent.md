# Intent — the contract layer, second pass

**Date:** 2026-09-13
**Status:** proposed. Nothing below is built.
**Design:** `docs/2026-09-13-contract-layer-design.md`
**Evidence:** 17 findings, each reproduced in a scratch copy against tsc 6.0.3; the eight critical and
important ones re-attacked by a second agent instructed to break both the reproduction and the fix.
Raw transcripts, probe files and the research sweep are at
`~/.claude/projects/-Users-oleksandrsecond-Projects-agency/analysis-2026-09-13/`.

---

## 1. Why this document exists

`1f6078f` shipped one typed HTTP contract per mock and four checks to hold it. The design is sound:
an operation key instead of a URL, refusal rules as pure functions, a wire fingerprint for the one
drift class no type can see. `pnpm verify` was 12 PASSED and `pnpm verify:full` 15 PASSED, and both
reproduced exactly on re-measurement.

**Three of the guarantees CLAUDE.md states as enforced are not enforced**, and they are the three the
memo names as the design's centre:

| Claimed | Measured |
|---|---|
| A wider store row cannot reach the client (`DeepExact`, "it is DEEP") | `wire()` is opt-in. `getParty: () => stored` compiles clean against the real `HandlersOf`, in the exact shape `routes.ts` uses. Excess-property checking never fires on a contextually typed arrow's return — `const f: () => {a:number} = () => ({a:1,b:2})` is green. |
| Hoisting the registry into a shared package turns two rows red (decision 4) | Both checks return early with **no problem pushed** when `src/api/contract.ts` is absent, and increment `checked` anyway. A fabricated root with a contract-less mock doing a raw `httpClient.get` exits 0 from both, reporting "2 contract(s)". |
| `codeOf(key, e)` returns that same closed set (which HARD RULE 5 needs to be checkable) | The adapter mints `NOT_FOUND`, `INTERNAL` and `BAD_REQUEST`; no operation declares them. `const code: undefined = codeOf('listParties', err)` typechecks and equals `'NOT_FOUND'` at runtime. |

Underneath those sits the pattern that produced them. `docs/BUILD-REPORT.md` records
`packages/dec/golden.json` asserting `dec === dec` for 675 cases while `dec` rounded the wrong way.
**The same failure now exists one level up: fourteen checks, and not one has ever been observed
going red.** `api:bound`'s raw-transport clause is defeated by 13 of 19 spellings including the
unaliased `httpClient({url})`; `contract:complete`'s code clause stays green after every `fail()` for
a code is deleted; a loop in the same file has `continue` as its whole body under a comment
describing a check. None of that was visible, because nothing plants a defect and demands a red.

## 2. What we want

The owner's words, made into things that can be measured:

| Word | What it means here | How we will know |
|---|---|---|
| **Simple** | An author holds fewer concepts, and the ones left are ordinary TypeScript. | 12–13 concepts today → 8. `satisfies`, a mapper and a builder are idioms a stranger recognises; `DeepExact`, `NoInfer` and `Awaited` are not, and leave the author-facing surface entirely. |
| **Flexible** | Model the API from the transcript before any screen exists; a bespoke operation is as cheap as a CRUD one. | `unreached: 'why'` on a registry entry is green while the reason stands and red the day a screen reaches it. No `resource()` shorthand — it would privilege CRUD. |
| **Easy to extend** | One new endpoint touches one declaration, one handler, one screen call, one drive. | 10 files / ~81 lines today → 6 files / ~45 lines, every one of them held red by a mechanism. |
| **Easy to maintain** | A red says what to do; a check that goes green is evidence, not decoration. | Every declared guarantee is a type, a red check, scaffolder output or the golden. Prose counts as zero. `checks:bite` proves each check can fail. |
| **Easy to migrate** | A handler body moves into a Nest service as a paste. | Every `wire()` call leaves handler bodies. `return row` **is** the service body. The mock stops emitting envelope fields the product never sends. |

## 3. The one decision everything else follows from

Every type-level exactness scheme measured — the current `wire()`, a branded return, a responder
token, `LeakFree` at the binding point — is defeated by the same four lines:

```ts
const out: Party = wideRow;   // assignability, not exactness
return out;                   // green under all of them
```

So the answer is not a sixth mechanism. It is:

1. **Move exactness off the author.** Handlers end in `satisfies HandlersOf<Api>` and return plain
   values; the leak check lives once, at `toRoutes`, in a line the scaffolder writes and nobody edits.
   Measured: top-level, nested-in-`data[]` and behind-`async` leaks are each red and the diagnostic
   names the operation; a `string` or `string[]` response stays green.
2. **Pin the residual as a live type** that compiles green, with a comment saying that is the point.
3. **Make the golden the instrument it was pretending to be** — a refusal drive per declared
   `(operation, code)` pair, exhaustive at runtime over `Object.keys(api[key].codes)` so a cast cannot
   evade it, replacing `contract:complete`'s green-by-construction literal clause.

CLAUDE.md's paragraph presenting `DeepExact`/`NoInfer` as the guarantee is rewritten to say this.
That is not a retreat: it moves a claim from a place it was false to a place it is true.

## 4. Non-goals

Each was considered against primary sources and rejected with a reason, not skipped.

- **No library.** ts-rest, oRPC, tRPC, Hono, Elysia, Zodios were all surveyed. Every live one brings
  a runtime and, for exactness, a schema library SPEC §14 already rejected — and **none of them
  refuses a wide row at the type level** (measured: ts-rest's `{status:200, body:row}` and Hono's
  `c.json(row, 200)` both compile against a narrower declared type). Their exactness is runtime
  stripping. We borrow five mechanics, each under 50 lines, and adopt nothing.
- **No new runtime dependency** in a mock. HARD RULE 6 stands unamended.
- **No codegen, no manifest, no `spec.json`.** SPEC §14's economics are unchanged.
- **No `agency add endpoint` in this cycle.** Deferred deliberately, not forgotten: its prototype
  works, but its own author measured ~1.3× line leverage — the ratio §14 used to reject the manifest
  DSL — and its real value (one anchor module shared with the checks, so generator and checks cannot
  disagree) only pays once the registry shape below is settled. Building it first means building it
  twice. Revisit after the next real mock is counted.
- **The registry stays per-mock.** SPEC §5. What changes is that two checks will finally enforce it.
- **No `resource()` CRUD shorthand.** yagoda's real operations are bespoke — no PATCH, no DELETE,
  a `preview`, a `void`. A shorthand for a registry that is already one entry per operation is §14's
  manifest in a smaller coat.

## 5. Success criteria

This work is done when all of the following are true, and not before.

1. `pnpm verify` and `pnpm verify:full` are green, and the run is not narrowed by `--only`.
2. **`checks:bite` exists and passes**, which means every check in the registry has been observed
   going red on a fixture with exactly one planted defect.
3. A mock directory with no `src/api/contract.ts` makes `api:bound` and `contract:complete` **red** —
   so CLAUDE.md decision 4 is a statement about the code rather than about intent.
4. `httpClient.get('/parties')` inside any file a mock compiles is a **compile error**, not an AST
   finding — hooks, components and helpers included.
5. `codeOf(key, e)` returns a declared code or `undefined`, and `undefined` is what both the mock and
   a real Nest filter produce for every transport failure. No screen branches on a code the product
   will never send.
6. `wire()` does not exist. No handler body contains anything that is not also valid in a Nest service.
7. Every declared `(operation, code)` pair has a refusal drive in the golden, and the exhaustiveness
   loop runs at runtime.
8. The template's 467 test lines and its type-level tripwires run in the **fast** tier.
9. Every sentence in CLAUDE.md's contract section is either measured true or deleted, and
   `pnpm verify:write` has regenerated the table and its digest.

## 6. What this costs, honestly

Roughly 8–10 working days across four phases, of which Phase 2 (the registry reshape) is
all-or-nothing across the template, both AST checks and the controls, and is the most likely thing to
be abandoned halfway. Six assertions in `adapter.test.ts` and `router.test.ts` change when the adapter
stops minting transport codes; each becomes *more* specific (the status it already asserts, plus
`not.toHaveProperty('code')`), and each is disclosed under HARD RULE 2 in the commit that makes it.

The work cannot start until eight self-looped symlinks under `node_modules` are repaired
(`pnpm install --frozen-lockfile --offline`); until then `pnpm verify` is red for reasons that have
nothing to do with any file in this repository.
