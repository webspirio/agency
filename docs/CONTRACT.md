# Contract, seam and money — the reasoning

Moved out of `CLAUDE.md` on 2026-11-11 so every agent does not load it on every call. This is the
WHY behind the rules there, with the measurements that produced them. Read it before changing
`packages/mock/src/contract.ts`, a mock's `src/api/contract.ts`, the adapter or the lint exemptions.

## Where money and pixels are allowed to meet

`oxlint.base.json` ships to every mock. The money rules are on everywhere **except**
`**/src/pages/**` and `**/src/components/**` — a mock's own screens, where `(v - lo) / span` is a
chart coordinate. That exemption is paid for: those same paths may not import `@agency/dec` at all,
so the invariant survives as **money is computed in the domain and api layers; a component receives
a finished string.** `packages/kit` is deliberately NOT in that list. It is agency code, written
once and read by every mock, so it is held to the rule rather than scoped out of it.

**An exemption goes on the line it excuses, not on the file.** Write
`// oxlint-disable-next-line agency/<rule> -- why` above the offending line (`{/* … */}` inside JSX,
and it may sit between JSX attributes); the reason after `--` is the whole justification and belongs
there, not in a commit message. The rest of the file stays checked, and the next offence beside it
goes red in `pnpm lint` rather than quietly changing a number in a baseline.
`options.reportUnusedDisableDirectives` in `.oxlintrc.json` makes a directive that has stopped
suppressing anything a lint failure, so a line-level exemption ratchets in both directions exactly
as a file-level one does. It is root-config-only by oxlint's schema, so a mock needs its own copy.

A **whole-file** `overrides` entry is the last resort, for a file where the count is itself the
argument. There are exactly two: `packages/dec/src/dec.ts` (24 findings — the one module allowed to
do the arithmetic) and `packages/kit/src/sparkline.tsx` (7 — an SVG viewBox and nothing else). Both
are **per-rule**, never `ignorePatterns` (which disables all ~100 rules for a file), and both are
ratcheted both ways against `scripts/verify/baselines/lint-exempt.json`.

## The seam

One `axios.create`, one adapter, one line of difference between a mock and the product. Verified in
axios 1.20.0: `node_modules/axios/lib/core/dispatchRequest.js` calls `adapter(config).then(...)` and contains **zero** references
to `settle`, which is where `validateStatus` lives and which each built-in adapter calls *itself*. A
custom adapter therefore owns status handling — **one that resolves a 409 delivers it to TanStack
Query as a success.** If this stops holding, the throwing branch needs re-examining.

That sentence used to end with a `grep` and an instruction to run it, in a file whose first rule is
that a standard propagates as something the scaffolder writes or a check that goes red, never as
prose. It is the `seam:settle` row now — fast tier, SKIPPED rather than FAILED when `node_modules`
is absent, and `checks:bite`'s `axios-settles-itself` fixture is what establishes it can go red.

## The contract

One registry per mock is the API, and **one entry per operation**.
`templates/mock/src/api/contract.ts` keys every operation by name and carries its method, path,
success status, capabilities, and closed set of error codes **with the status each one answers** —
`codes: { PARTY_NOT_FOUND: 404 }` — while the request, response and query types ride on the same
entry through `op<Req, Res, Qry>()`. There is no sibling type map to fall out of step with, and no
`as const`: `op`'s `<const S extends Spec>` preserves every literal, measured, and stripping the
`const` modifier turns four controls red. The handler map, every call site, every refusal, the error
branch a screen reads and **the screen's own message table** are all derived from that one literal by
type. Nothing is generated — tsc derives them. The generic half lives in
`packages/mock/src/contract.ts`; the two meet through `makeContract<Api>(api)`.

A screen never writes a URL. It calls `call(httpClient, '<operation>', { params, body, qry })`, and
both the path and the response type come from the registry — so the two sides are one claim instead
of two that happen to agree. Its CACHE KEY comes from there too: `queries.query('<operation>', args)`
in `templates/mock/src/api/queries.ts` returns TanStack options whose `queryKey` starts with the
operation name, replacing a hand-written `['parties', page]` for an operation called `listParties`.
It returns options rather than calling `useQuery`, so `packages/mock` needs no React dependency.
`api:bound` reads both surfaces, because a row blind to the factory reports every operation reached
through it as unreached — a false red, and SPEC §17 names a row an operator switches off as the
signal to abandon the strategy.

A malformed body gets the PRODUCT's answer: 400 with `message: string[]`, one sentence per failed
field, and no `code`. Measured before `shape()` existed — an empty body answered **500** and a forged
`id` was accepted with 201 and silently ignored. A shape declaration must not duplicate a domain
rule: the shape answers "is this the right SHAPE", a rule in `templates/mock/src/domain/rules.ts`
answers "is this a legal value", and only the second carries a declared code. Measured: declaring
`balance: s.dec2()` intercepted the malformed balance first and made `PARTY_BALANCE_INVALID` a
declared code nothing could emit — **and `contract:complete` stayed green**, because the `fail()`
site still existed. What caught it was the wire golden's refusal drive for that pair, which is the
golden being the instrument rather than the record.

**Four things are load-bearing, and each was measured rather than assumed:**

- **`ParamsOf` binds params, not paths.** Renaming `'/parties/:id'` to `'/party/:id'` compiles
  clean — every non-param segment is erased. The contract lab's README claimed a path rename goes
  red on both sides; it does not. What keeps a rename safe is that `call()` takes an operation KEY,
  so there is no second copy to drift. The weakness is asserted as a live type in
  `templates/mock/src/api/drift.controls.ts`, so it goes red if the design ever gains whole-path binding.
- **`JsonSafe` cannot be a constraint.** `T extends JsonSafe<T>` is TS2313 "circular constraint" on a
  type alias *and* on a function type parameter, in tsc 6.0.3. It ships as a conditional tripwire —
  one line per contract asserting every declared response at once. A `Date`, a `Map`, or a required
  key whose value may be `undefined` is refused at declaration. **`null` is not in that list and
  used to be**: every branch is written `[T] extends [X]` so a union is judged whole rather than
  taken apart, and `[string | null]` satisfies neither `[null]` nor `[string | number | boolean]` —
  so it fell through to `never` and *any* nullable field turned `RESPONSES_ARE_WIRE_SHAPED` red.
  Measured 2026-09-16 on the first mock to declare one. Null is now peeled off before those
  branches and put back after, recursively, so `{ at: string } | null` passes while `Date | null`
  and a required `string | null | undefined` still do not. Six controls in
  `packages/mock/src/contract.controls.ts` pin all four directions; `unknown` is refused *before*
  the peel, because `[null] extends [unknown]` is true and the peel would otherwise recurse forever.
- **Exactness is checked ONCE, at the sink, and it does not survive a cast.** Handlers end in
  `satisfies HandlersOf<Api, Io>` and return plain values; `toRoutes` returns `LeakFree<…>`, so a
  handler returning more than its operation declares is a compile error at `export const routes` —
  one line the scaffolder writes and nobody edits — and the diagnostic names the operation. It is
  DEEP: a wide row nested in `data[]` is caught, and so is one behind `async`. The `wire()` this
  replaced was **opt-in**, and `getParty: () => storedWideRow` compiled clean in the exact shape
  `templates/mock/src/api/routes.ts` uses, because excess-property checking never fires on a
  contextually typed arrow's return. `satisfies` rather than a return-type annotation is
  load-bearing: an annotation widens the
  map, `H` collapses into the declared type and the sink has nothing left to compare —
  `FactoryNotWidened` pins that, and `contract:complete` goes red if the anchor disappears.
  **What it does not survive — two things, both measured, both written down as live types in
  `templates/mock/src/api/drift.controls.ts`:** an annotated widening or a cast
  (`const out: Party = wide; return out`), which is green under `wire()`, under a brand and under
  `LeakFree` alike; and a BRANCH (`c.actor.role === 'admin' ? wideRow : row`), because TypeScript
  subtype-reduces `Wide | Narrow` to `Narrow` at inference, so no union ever reaches the check and
  the handler's return type is the declared row however it is examined. A union that survives
  reduction — two unrelated shapes — *is* caught, constituent by constituent. Nothing type-level
  closes either residual, and **the wire golden is the ground truth for both**, with its own limit:
  it drives each operation once, with one actor, so it fingerprints whichever branch that actor takes.
- **`Awaited<R>` is the load-bearing token in `Leaks`, and `NoInfer` never was.** The claim that
  `NoInfer` earned its place twice did not reproduce — stripping both occurrences left every
  diagnostic byte-identical — and the word now appears nowhere in `packages/mock`. `Awaited` does
  earn its place, but not where it looked: strip it and an async *leak* is still reported, because
  `keyof Promise<Party>` is `then | catch | finally`, none of which the response declares. What
  breaks is the other direction — every **correct** async handler reads as a leak, and the check
  becomes noise. `AsyncExactIsNotALeak` is the one control that goes red on that, measured in both
  directions on 2026-09-13.
- **A never-returning `fail()` narrows only when the callee is a function declaration or a const
  with an EXPLICIT type annotation.** A destructured `const { fail } = makeContract(...)` does not
  narrow, and neither does `contract.fail(...)`. That is why each contract exports annotated consts.

`fail(key, code, …)` is keyed to the registry, so a code outside an operation's declared set is a
compile error — the graft that turns an inert `codes` list into a mechanism. **It takes no status**:
that is read off the code's own registry entry, so one code answers one status **within its
operation** — the status is bound to the code rather than re-typed at each `fail()` site, and `404`
was hand-typed four times across the template's handlers with nothing comparing them. *(It is NOT
one status per code across the whole registry: two operations may still declare different statuses
for the same code name, and nothing compares them. Nothing compares a declared status to the one the
wire carries either — see the `contract:complete` blind spot.)* A screen's `SAYS` table closes the
last open step — `satisfies Record<CodeOf<Api, K1 | K2>, string>` makes a declared code with no
sentence **TS1360** and a sentence for an undeclared code TS2353. `CodeOf` **distributes over K**,
and that is load-bearing: `keyof` over a union of `codes` objects is the INTERSECTION of their keys,
so the undistributed form made any union containing a `codes: {}` operation collapse to `never` —
and `satisfies Record<never, string>` is `satisfies {}`, which asserts nothing in either direction.
Measured, and it shipped that way for one commit. `codeOf(key, e)`
returns that same closed set **or `undefined`**, filtered against `api[key].codes` at runtime as
well as in the type, which is what HARD RULE 5 needs to be checkable. It reads the code from either
side of the seam — the mock's `AxiosError.response.data`, or the `ApiError` the product's
`attachErrorInterceptor` throws, which carries no `.response` at all — so a screen written once keeps
branching after conversion instead of falling back to its generic message. `undefined` is not a mystery:
it is what the product's `AllExceptionsFilter` sends for every transport failure, so the adapter
mints no `NOT_FOUND`, the router no `BAD_REQUEST`, and `DomainError.code` is optional. Rendering the
envelope's own message is not branching, so the rule holds.

A refusal status is a `RefusalStatus` — a 4xx or a 5xx, never `number`. Measured: a 2xx there makes
the adapter **return the error envelope as a success**, because its throwing branch is gated on
axios's `validateStatus`, so a screen receives `{ statusCode, error, message, … }` typed as the
declared response and renders `undefined` in every field with no error branch taken. Three mechanisms
hold it, because each catches what the others cannot — the type at declaration, a loud throw in
`fail()` for the cast that evades the type, and `contract:complete` reading the status value off the
AST for a `mocks/<slug>` the root solution never compiles.

**The wire golden is the instrument, not a record.** Every declared `(operation, code)` pair is driven
through the real adapter and its status and envelope fingerprint committed, with the exhaustiveness
loop running **at runtime** over `Object.keys(api[key].codes)` so a cast in the drive table cannot
evade it. The status is pinned in the *committed file* rather than read from the registry, and that
distinction was measured: asserting the wire status against `api[key].codes` **cannot fail**, because
`fail()` derives one from the other. Only an artifact that does not move when the registry moves can
catch a changed status.

Refusal rules are pure functions over row snapshots in `templates/mock/src/domain/rules.ts`, the
`reference/contract/intake-lines.ts` shape, so a handler body moves into a Nest service unchanged.

### Decisions, recorded

1. **`templates/mock/src/api/contract.ts` is NOT `@scaffold-owned`.** The marker is for files that fail *silently* when
   rewritten. This one fails loudly — two tripwires — and it is the one file a mock author must
   edit for every new endpoint, so a "do not touch" marker would forbid the file's purpose.
   *(Three until the registry folded. `IO_COVERS_API` had nothing left to compare once there was one
   declaration instead of two. `KEEP_AS_CONST` became `KEEP_LITERAL` and stayed, against the design's
   own recommendation: measured, it is the only check inside that file that an entry was written with
   `op<…>()` at all, and every other symptom of forgetting the wrapper surfaces in a different file.)*
2. **A `JsonSafe` tripwire, not a `Wire<T>` type.** Forced by TS2313 above; a separate wire type
   would also be a second declaration per endpoint, which is the cost that made the descriptor style
   expensive.
3. **No `reason` beside `codes`.** `DomainError` has no such parameter and `ctx` already spreads into
   the envelope, so a rule's context travels there. A second discriminator beside `code` is exactly
   what HARD RULE 5 forbids.
4. **What stops a `packages/contracts`:** `api:bound` and `contract:complete` resolve each mock's
   registry at its own contract file and fail when it is absent — so hoisting the registry
   into a shared package turns two rows red. *(Measured false on 2026-09-13 and made true in the
   same commit: both checks returned early with no problem pushed when a mock's own
   `templates/mock/src/api/contract.ts` was
   absent, and counted the directory as checked anyway — a root with one real contract and one
   hoisted one exited 0 from both, reporting "2 contract(s)". `checks:bite`'s `mock-without-contract`
   fixture is what holds it now, and `contract-deleted` holds the whole-tree case.)* The generic
   machinery is already shared, in `packages/mock`; what SPEC 5 forbids is sharing the per-mock
   contract data.
5. **`api:bound` does not check the response type, permanently.** It cannot: the premise changed.
   `call()` RETURNS the declared response, so a call site has no type argument to get wrong. The hole
   the lab measured belonged to `httpClient.get<T>(url)`, and `httpClient` is now an opaque
   `Transport` that only `call()` unwraps — so a raw verb on it is TS2339 in every file a mock
   compiles, hooks and components included, which no single-file AST walk reaches. *(The earlier
   sentence here credited `api:bound`'s `/httpClient|axios/i` clause with holding this. Measured
   false on 2026-09-13: 13 of 19 spellings evaded it, the unaliased `httpClient({ url })` among them,
   because an AxiosInstance is callable and the regex branch never ran. That clause is deleted;
   `axios` and `fetch` reached from a page are held by two `oxlint.base.json` entries.)*

## The reference library

`reference/` is prior art an agent reads before writing. Nothing there ships, nothing there is imported, and
HARD RULE 7 makes it read-only. It holds two shapes, and the difference is load-bearing:

- **Tracked snapshots** — `reference/money/`, `reference/contract/`, `reference/profiles/`,
  `reference/verify/`, `reference/print/` — a few files each, present on a fresh checkout.
- **Gitignored clones** — bulletproof-react, design-patterns-typescript, fsd-documentation, dinero,
  decimal-js, decimal-dectest, faker, pure-rand, react-router-examples. `git add reference/` would record
  them as gitlinks pointing at commits this repo does not contain, so they stay out of the index
  entirely — which means **they do not exist on a fresh checkout, or in CI**.

That last fact is why no path inside a clone is backticked in this file. `docs:truth` checks every
backticked path here, CI runs `pnpm verify` on a fresh checkout, and a clone path would be green on
this machine and red there — the same host-not-code failure recorded twice in `docs/BUILD-REPORT.md`.

`reference/CLAUDE.md` is the index: which reference answers which question, for money, determinism,
the seam and layering. It is tracked, so it may cite clone paths freely. Each clone also carries its
own `CLAUDE.md` — what it is, where to look, and what not to trust. Those guides live inside an
ignored directory, so **a re-clone destroys them**; restore the guide if you replace a clone.

Most of these are pinned at majors this repo does not run — bulletproof-react is React 18 and
Tailwind 3, design-patterns-typescript is TypeScript 3.3. Read those for structure, never for an
API call. And HARD RULE 6 still applies: dinero, decimal.js, faker and pure-rand are reading
material, never candidates for a `package.json`.

Read a reference to settle a question, then turn the answer into a test or a registry row. A
reference that only produces prose has not propagated.
