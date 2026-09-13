# Contract layer, second pass — execution runbook

**For:** a fresh session executing all four phases.
**Written:** 2026-09-13, at the end of the design session, by the agent that produced the three
documents below. Everything here is measured or decided, not guessed.

---

## 0. The paste

Start the new session with this. Everything after §1 is detail the session reads from disk.

> Execute the contract-layer rework in this repo, all four phases.
>
> Read first, in this order: `docs/intent.md` (why, and the nine success criteria),
> `docs/2026-09-13-contract-layer-design.md` (the eight settled decisions and the exact
> interfaces), `docs/2026-09-13-contract-layer-plan-phase-1.md` (8 tasks, 55 TDD steps), and
> `docs/2026-09-13-contract-layer-execute.md` (this runbook: model policy, where workflows help,
> the environment hazard, and the phase gates). `CLAUDE.md` is already in your context — its HARD
> RULES bind everything below.
>
> Phase 1 has a plan. **Phases 2, 3 and 4 do not, by design** — write each one with
> `superpowers:writing-plans` only after the previous phase is green and reviewed, because each
> phase's exact edits depend on what the previous one changed and on what `checks:bite` discovers.
>
> Work task by task. Watch every red before you fix it, and quote it. Never weaken a check to go
> green — if a check is genuinely wrong, say so and leave it failing. Stop and ask rather than
> working around: a test you did not write starts failing · a lint rule fires on code you believe
> is correct · `grep -c settle node_modules/axios/lib/core/dispatchRequest.js` returns anything but
> `0` · a `checks:bite` fixture reports a check did not bite.

---

## 1. State at handoff — verified, not assumed

```
pnpm verify   12 PASSED, fast tier, not narrowed, ok=true    (node v24.21.0, 2026-09-13)
git status    M .gitignore · M reference/README.md · ?? the four docs/ files
```

The two modified files are pre-existing and belong to other work. **No source file was changed in
the design session.** The four `docs/` files are untracked and inert — no check reads them.

`pnpm verify:full` has **not** been re-run since the environment was repaired. The last full-tier
result on this tree was 15 PASSED, measured before the damage described in §4. Re-running it is
the first thing §5 asks for.

---

## 2. Model policy

Do not run everything on the expensive model. The work divides cleanly.

| Model | Use it for | Why |
|---|---|---|
| **Sonnet 5** — the main loop | Driving the session, running commands, reading verify output, Tasks 1, 2, 3, 6, 7 (fixtures, check edits, assertion updates), all git work | These are careful-but-mechanical: the plan already contains the exact code and the exact expected red. The judgement was spent writing it. |
| **Opus 5** — escalate with `/model opus` | Task 4 (`Leaks`/`LeakFree`, the `DeepExact` primitive guard), Task 5 (the opaque `Transport` and the `call` unwrap), Task 8 (rewriting the memo), and **writing the Phase 2/3/4 plans** | Type-level work where a wrong turn is silently green, and prose where the whole point is that the sentence must be true. Switch back to Sonnet after. |
| **Haiku 4.5** — subagents only | Mechanical sweeps: "grep every `wire(` left in the tree", "collect the exact text of these six assertions", "list every file importing `@agency/mock`" | Fast, cheap, and the answer is a list, not a judgement. |

**Escalation rule.** If a step's red does not match what the plan says to expect, stop and escalate
to Opus 5 before touching anything. A surprising red is the most information-dense moment in this
work and the cheapest place to lose it.

---

## 3. Where workflows help — and where they do not

**Do not fan out implementation.** Phase 1's tasks are sequential and overlap heavily:
`packages/mock/src/contract.ts` is edited by Tasks 4, 5, 6, 7 and 8. Parallel agents editing it
would conflict, and worktree isolation would just defer the merge. Implementation runs in the main
loop, or as one sequential subagent per task under `superpowers:subagent-driven-development`.

**Do fan out these three.** Each is genuinely parallel and each is worth the tokens.

### 3.1 `checks:bite` triage — only if a fixture reports a check did not bite

Task 1 step 5 and Task 2 step 2 can surface checks that do not go red. That is a finding, not a
bug in the harness. One agent per non-biting check, in parallel, each answering: is the check
blind, is the fixture wrong, or is the defect not actually a defect? Schema the verdict.
Model: Sonnet, effort high.

### 3.2 Phase review — after every phase, before the next plan is written

The pattern that worked in the design session: N reviewers on different dimensions, then
adversarial verification of each finding by an independent agent told to refute it.

```js
const DIMENSIONS = [
  { key: 'guarantees', prompt: 'For each guarantee docs/intent.md §5 claims, name the type, check or golden that holds it, and try to construct a case where it is green while the guarantee is violated.' },
  { key: 'hard-rules', prompt: 'Audit the phase diff against CLAUDE.md HARD RULES 1-8. Every changed assertion must be disclosed in its commit message with a reason.' },
  { key: 'lane-a',     prompt: 'Count what one new endpoint now costs: files, lines, concepts. Compare to the 10 files / 81 lines / 12-13 concepts measured on 2026-09-13.' },
  { key: 'lane-b',     prompt: 'Read reference/contract/. Does every handler body still move into a Nest service unchanged? Name anything that would need rewriting.' },
]
const results = await pipeline(DIMENSIONS,
  d => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS, model: 'sonnet', effort: 'high' }),
  review => parallel(review.findings.map(f => () =>
    agent(`Adversarially verify, default to refuted if uncertain: ${f.summary}`,
      { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT, model: 'opus', effort: 'high' })
      .then(v => ({ ...f, verdict: v })))))
```

### 3.3 Phase 2 anchor re-measurement — before writing Phase 2's plan

Phase 2 folds `Io` into a curried `op<Req,Res,Qry>()` entry, which changes the literal both AST
checks parse. Three independent measurements, in parallel, each in its own scratch dir: (a) does
the curried form preserve path literals without `as const` on the *post-Phase-1* `contract.ts`;
(b) what exactly do `contract-complete.mjs` and `api-bound.mjs` anchor on today, line by line;
(c) do the controls still bite under the folded shape. Model: Opus, effort high. **Their findings
are the inputs to the Phase 2 plan** — do not write it before they land.

---

## 4. The environment hazard — read this before dispatching any subagent

A verification subagent in the design session built a scratch `node_modules` tree of symlinks and
**rewrote eight links inside the repository's own `node_modules` to point at themselves**:
`@types/{node,react,react-dom}`, `@testing-library/{dom,jest-dom,react,user-event}`,
`@vitejs/plugin-react`. The whole fast tier went red — 14× TS2883, 2× TS2688, every DOM test — for
reasons unrelated to any file in the repo, and it cost most of an afternoon.

It was invisible to `pnpm install`: `lstat` on a self-loop succeeds while `stat` returns `ELOOP`,
and `node_modules/.modules.yaml` still matched the lockfile, so `--frozen-lockfile` and even
`--force` both reported "Already up to date" in ~200ms and repaired nothing. The repair was to
delete the links *and* `.modules.yaml`, then install.

**Rules for every subagent that compiles anything:**

- **Never** copy, link, or otherwise construct a `node_modules` tree that references the repo's
  `node_modules`. To typecheck a probe, write a scratch `tsconfig.json` with `"types": []` and
  `paths` mapping `@agency/*` to the real `packages/*/src/index.ts` by absolute path.
- Run tsc as `<repo>/node_modules/.bin/tsc --noEmit -p <scratch tsconfig>`.
- Write only under the session scratchpad. The checkout is read-only to reviewers and measurers.
- **Never** run `pnpm install`, `pnpm verify`, `pnpm verify:full` or `pnpm typecheck` from a
  subagent. They write shared state (`.verify/`, tsbuildinfo, `mocks/`, the lockfile) and other
  agents share this tree. The main loop runs those, one at a time.

If the tier goes red with `TS2688 Cannot find type definition file for 'node'`, check the links
before reading a single line of source:

```bash
for p in @types/node @types/react @testing-library/dom @vitejs/plugin-react; do
  printf '%-30s ' "$p"; [ -e "node_modules/$p/package.json" ] && echo OK || echo BROKEN
done
```

Repair: `rm -rf` the broken links and `node_modules/.modules.yaml`, then
`pnpm install --frozen-lockfile --offline`.

---

## 5. Protocol

**Before Task 1.** Confirm the baseline yourself — do not trust §1:

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
node -v            # must be v24.x — the shell default here is 22 and `engines` will FAIL on it
pnpm verify        # must be 12 PASSED, not narrowed
pnpm verify:full   # expect 15 PASSED; this has not been re-run since the repair
```

If either is not green, stop and report which of `PASSED` / `FAILED` / `SKIPPED` / `NOT_RUN` /
`UNRUNNABLE` you got. Nothing can be watched failing against a tree that is already failing.

**Per task.** The plan's steps are the protocol; three things it cannot enforce:

1. **Quote the red.** Step 2 of every task is "run it and watch it fail for the stated reason". If
   you cannot paste the failure text, you did not watch it, and HARD RULE 1 is not satisfied.
2. **The red must match.** If the failure differs from what the plan predicted, that is new
   information. Escalate to Opus 5 and report before proceeding.
3. **Disclose every changed assertion** in the commit message, with the reason, using the wording
   the plan supplies. Six change in Task 6 alone. An undisclosed assertion change is
   indistinguishable from the move HARD RULE 2 forbids.

**Per commit.** Explicit pathspec, always — other agents share this tree:

```bash
git add <paths> && git commit -F - -- <paths>
```

Never `git reset --hard`, `git clean`, or `git checkout .`.

**After editing `scripts/verify/registry.mjs`:** run `pnpm verify:write`, or `memo:drift` goes red.

**End of every turn:** `.claude/hooks/stop-gate.mjs` runs the fast tier and blocks on red. It fails
closed on check failures and open-but-loud on its own errors — a message saying the turn is
UNVERIFIED is never a green tree.

---

## 6. Phase gates

A phase is done when all four hold. Do not start the next plan before then.

1. `pnpm verify` green (13 rows after Phase 1 — twelve plus `checks:bite`) and `pnpm verify:full`
   green, neither narrowed by `--only`.
2. Every task's commit is in, each disclosing its assertion changes.
3. The §3.2 review workflow has run and every confirmed finding is fixed or explicitly deferred
   with a reason.
4. `docs/BUILD-REPORT.md` has the phase's record appended in the existing sections' shape: what was
   measured, what a check should have caught and didn't, and what is still open.

Then, and only then, write the next phase's plan with `superpowers:writing-plans`, using the design
document's §6 sequence for that phase plus whatever the review and the §3.3 measurements found.

---

## 7. Things that will probably go wrong

Recorded so they are recognised rather than debugged from scratch.

| Symptom | What it means |
|---|---|
| A `checks:bite` fixture reports **"did not go red"** on a check the plan expected to bite | A real finding about that check. §3.1. Do not soften the fixture. |
| `TS2578: Unused '@ts-expect-error' directive` in Task 4 step 2 | Correct — that *is* the proof exactness is not held today. Four of them. |
| Task 4 step 6's fixture cannot be written | Known and bounded: it depends on whether `typecheck.mjs` accepts `--root`. Both branches are in the plan. Read that file first. |
| The plan uses `Leaks<A, I, H>` but the design doc shows two parameters | Deliberate. `HandlersOf<A, I>` keeps its `Io` parameter until Phase 2 folds it in. Flagged in the plan's self-review. Do not "fix" it. |
| `engines` FAILED with "running major 22" | You are on the wrong node. `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`. |
| `memo:drift` FAILED right after a registry edit | You did not run `pnpm verify:write`. |
| The whole tier red with TS2688 / TS2883 / testing-library resolution | §4. Check the links before reading source. |

---

## 8. What "done" means

`docs/intent.md` §5 — nine criteria. The one to hold onto: **`checks:bite` exists and passes**,
which will be the first time any check in this repository has been observed going red. Everything
else in this rework is downstream of being able to tell a check that works from a check that only
looks like it does.

---

## 9. Evidence, if a decision needs re-litigating

Raw artifacts from the design session — 17 findings with full probe transcripts, 11 research
families with primary sources, two design proposals — are at:

```
~/.claude/projects/-Users-oleksandrsecond-Projects-agency/analysis-2026-09-13/
```

`findings-digest.md` is the one to read: every finding carries what was run, the decisive
observation with file:line, the root cause, and both agents' fix critiques. The design document's
decisions cite it. Do not re-measure something already measured there — read it, then measure the
thing it left open.
