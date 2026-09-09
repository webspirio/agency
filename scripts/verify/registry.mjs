/**
 * The check registry. This file is the point of the whole layer: what a check
 * PROVES and what it stays BLIND TO live side by side, as data, so the runner's
 * output, a CI log and CLAUDE.md cannot drift apart from each other. The memo's
 * table is generated from exactly these strings and `memo:drift` compares it byte
 * for byte, so the three can only ever say one thing.
 *
 * Rules for editing:
 *  - `proves` must be falsifiable by THIS EXACT COMMAND failing. If no possible
 *    failure of `cmd` could make the sentence untrue, it is decoration — delete
 *    it. "The code is well designed" is decoration. "oxlint exits 0" is not.
 *  - `blindSpot` must not be written broader than the command establishes. It is
 *    the more valuable of the two: a table of passes without its blind spots is
 *    the false-confidence artifact this layer exists to remove.
 *  - `after` only where the dependency is real, not where the order feels tidy.
 *  - A row is added when the thing it checks can actually go red. SPEC 10 lists
 *    twelve freeze-tier rows; the ones that need `agency freeze`, a Playwright
 *    run or a deployed Worker are Plan B and are deliberately ABSENT rather than
 *    present-and-permanently-SKIPPED, because a row that never runs reads as
 *    coverage.
 *  - Repo-wide commands belong HERE, never in vitest. The runner is sequential;
 *    vitest is not, and three test files each shelling out to a twelve-thread
 *    oxlint produced a false `no-unused-vars` that no single file could
 *    reproduce. A flaky red is worse than no gate.
 *
 * Ported, much reduced, from reference/verify/registry.mjs — 549 lines there for
 * 16 checks against a mature app; SPEC 10 budgets ~350 for the whole layer.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * @typedef {'fast' | 'full'} Tier
 * @typedef {'node-major'} PreconditionId
 *
 * @typedef {object} Check
 * @property {string} id
 * @property {Tier} tier
 * @property {string} cmd              run through /bin/sh from the repo root
 * @property {PreconditionId} [needs]  absent precondition means SKIPPED, not FAILED
 * @property {string[]} [after]        ids that must have PASSED, else NOT_RUN
 * @property {number} [skipExit]       this exit code means SKIPPED, not FAILED
 * @property {string} proves
 * @property {string} blindSpot
 */

/**
 * A precondition answers exactly one question: "are there conditions to run in
 * at all?" It must never answer "did it work". Collapsing those two is how a
 * dead suite stays green for months.
 *
 * @type {Record<string, {describe: string, probe: () => Promise<boolean>}>}
 */
export const PRECONDITIONS = {
  'node-major': {
    describe:
      'the running node major does not match .nvmrc, so a green here would be a verdict about a ' +
      'different runtime than the one CI and the gate use. This is a missing precondition, not ' +
      '"the code is fine": under --no-skip it is a failure.',
    probe: async () => {
      try {
        const want = readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim().replace(/^v/, '').split('.')[0];
        return process.version.replace(/^v/, '').split('.')[0] === want;
      } catch {
        return false;
      }
    },
  },
};

/** @type {Check[]} */
const REAL = [
  {
    id: 'engines',
    tier: 'fast',
    // Exit 2 is this check's own "there is no floor to compare against" signal,
    // which is a missing precondition and therefore SKIPPED. Exit 1 is a
    // measured mismatch and stays FAILED.
    skipExit: 2,
    cmd: 'node scripts/verify/checks/engines.mjs',
    proves:
      'The node interpreter that is running these checks satisfies the `engines.node` floor ' +
      'package.json declares, so every other row in this table is a verdict about a runtime this ' +
      'project says it supports. A running major below the floor is FAILED, not skipped; only an ' +
      'absent or unevaluatable `engines.node` is SKIPPED, and it says which.',
    blindSpot:
      'The major only, and only against a single ">=N" floor — a disjunction or an upper bound is ' +
      'refused rather than approximated. A patch-level V8 difference, a different pnpm, a different ' +
      'libc or a different OS all change behaviour and are invisible here. It also says nothing ' +
      'about the node that will run in CI or on a client machine, only about this process; a .nvmrc ' +
      'that disagrees with the interpreter is printed as a WARNING and does not block.',
  },
  {
    id: 'lint',
    tier: 'fast',
    cmd: 'pnpm lint',
    proves:
      'oxlint exits 0 over packages/, templates/ and mocks/ with --max-warnings=0, so no file in ' +
      'the workspace performs money arithmetic, relational comparison, numeric coercion, an ' +
      'unordered id or a default-comparator sort outside the exemptions recorded in the ' +
      'lint-exempt baseline. Deleting the JS plugin does not weaken this: oxlint then exits 1 with ' +
      '"Failed to load JS plugin" rather than silently dropping the five rules.',
    blindSpot:
      'The rules are syntactic and oxlint has no type information, so they cannot tell a decimal ' +
      'string from a pixel count. Under **/src/pages/** and **/src/components/** the float and ' +
      'comparison rules are off by design and the invariant is carried instead by a ban on ' +
      'importing @agency/dec there — which a component can still evade by receiving an already-' +
      'wrong number as a prop. Nothing here checks that the arithmetic dec DOES perform is right.',
  },
  {
    id: 'typecheck',
    tier: 'fast',
    cmd: 'node scripts/verify/checks/typecheck.mjs',
    proves:
      '`tsc -b --force` builds every referenced project in the root solution to completion under ' +
      'strict, noUncheckedIndexedAccess and verbatimModuleSyntax. FORCED, not incremental: the ' +
      'plain `tsc -b` this replaced returned exit 0 over a tree --force rejected with three errors, ' +
      'because a stale tsbuildinfo answered for it. The same invocation asserts that no file under ' +
      'reference/ is in the program, so read-only prior art cannot make this row permanently red.',
    blindSpot:
      'Says nothing about mocks/<slug>, which are their own projects outside the solution and are ' +
      'compiled only by the `build` row, nor about anything a type cannot express — `as Locale` on ' +
      'an unvalidated string typechecks and throws at demo time. It cannot see runtime resolution ' +
      'either: an exports map that TypeScript follows and node cannot load is green here.',
  },
  {
    id: 'test',
    tier: 'fast',
    cmd: 'pnpm test',
    proves:
      'Every *.test.ts and *.test.tsx under packages/ and mocks/ that vitest collects runs to ' +
      'completion and passes, in the environment its package needs.',
    blindSpot:
      'Passing tests are not evidence that the right things are tested. Coverage is not measured ' +
      'and no mutation testing runs, so a test that cannot fail counts the same as one that can — ' +
      'the golden fixture asserted dec against itself for 675 cases and was green throughout. That ' +
      'every file on disk is actually collected is a SEPARATE row (test:parity); this one would ' +
      'report the same green over a config that silently collected nothing.',
  },
  {
    id: 'test:parity',
    tier: 'fast',
    cmd: 'node scripts/verify/checks/test-parity.mjs',
    proves:
      'Every *.test.ts/.tsx file on disk under packages/ and mocks/ is collected by exactly one ' +
      'vitest project — not zero, which makes a red test report green, and not two, which runs a ' +
      'jsdom test under node and fails it for reasons unrelated to the code.',
    blindSpot:
      'Only the partition. It reads what `vitest list` claims to collect and compares it to a ' +
      'directory walk; it does not run a single test, and a file collected into the WRONG one of ' +
      'the two projects is counted as collected exactly once.',
  },
  {
    id: 'lint:exempt',
    tier: 'fast',
    after: ['lint'],
    cmd: 'node scripts/verify/checks/lint-exempt.mjs',
    proves:
      'Every rule-level exemption in .oxlintrc.json still suppresses exactly the number of findings ' +
      'the committed baseline records: a newly exempted file, an exemption that has gone stale, and ' +
      'a change in how much an exemption hides are each red. The ratchet is bidirectional, so a ' +
      'fixed file must be removed from the list rather than left as a standing excuse.',
    blindSpot:
      'It reads the `overrides` block of .oxlintrc.json and nothing else — never whether an ' +
      'exemption was a good idea, and never a suppression written anywhere but that one file. Two ' +
      'whole-file entries are left, dec.ts (24 findings) and sparkline.tsx (7); the other eleven ' +
      'became inline `// oxlint-disable-next-line agency/<rule>` comments, which this row cannot ' +
      'see at all. Those are held instead by `lint` plus `options.reportUnusedDisableDirectives: ' +
      '"error"`, which turns a STALE directive red but pins no count: a directive covers its ' +
      'whole line and every rule it names, so a second offence added to an already-excused line ' +
      'stays silent. The float and comparison rules are also off wholesale under **/src/pages/** ' +
      'and **/src/components/** by way of oxlint.base.json, which this row never opens, and a ' +
      'rule nobody turned on in the first place is invisible to it either way.',
  },
  {
    id: 'emit:clean',
    tier: 'fast',
    cmd: 'node scripts/verify/checks/emit-clean.mjs',
    proves:
      'No .tsbuildinfo, and no .d.ts / .js / .map sitting beside the .ts or .tsx it was emitted ' +
      'from, exists anywhere under a src/ directory in packages/, templates/ or mocks/. The day-4 ' +
      'gate ran with eleven emitted .d.ts files and a tsconfig.tsbuildinfo inside mocks/<slug>/src/ ' +
      'and nothing was red about it; a stale declaration there is resolved in preference to the ' +
      'source that would have replaced it.',
    blindSpot:
      'Emit is identified by the SIBLING, so build output whose source has since been deleted is ' +
      'invisible, and so is anything emitted outside a src/ directory. It also passes happily on a ' +
      'declaration a human wrote badly: vite-env.d.ts and testing.d.ts are correct here only ' +
      'because no compiler would produce a file by those names, not because they were inspected.',
  },
  {
    id: 'docs:truth',
    tier: 'fast',
    cmd: 'node scripts/verify/checks/docs-truth.mjs',
    proves:
      'Every backticked path and every `pnpm <script>` CLAUDE.md names resolves — at the repo root, ' +
      'or inside templates/mock/ (with or without a .hbs suffix) for the paths a scaffolded mock ' +
      'owns, or in package.json for the scripts. Nothing is exempted by a heuristic.',
    blindSpot:
      'Existence, not truth. A file that exists but no longer does what the sentence around it ' +
      'claims is green here, and so is every statement the memo makes that does not happen to ' +
      'contain a path or a script name — which is most of them. Prose is not gated and cannot be.',
  },
  {
    id: 'memo:drift',
    tier: 'fast',
    cmd: 'node scripts/verify/checks/memo-drift.mjs',
    proves:
      'The proves / does-not-prove table inside the generated-region markers in CLAUDE.md is ' +
      'byte-identical to the table rendered from this registry, and the SHA-256 printed beneath it ' +
      'matches a digest taken over the RAW proves and blindSpot strings — which the rendered cells ' +
      'cannot stand in for, because rendering collapses whitespace and two different registry ' +
      'strings can produce one identical cell.',
    blindSpot:
      'It compares two artifacts to each other, never either against reality. A `proves` sentence ' +
      'that is a lie is copied into the memo faithfully and both go green. It also says nothing ' +
      'about the rest of CLAUDE.md — every line outside the markers is unchecked prose.',
  },
  {
    id: 'template:render',
    tier: 'full',
    cmd: 'node scripts/verify/checks/template-render.mjs',
    proves:
      '`agency new` produces a mock in which no {{placeholder}} and no .hbs file survives, all five ' +
      'silently-failing files carry their @scaffold-owned marker, the `@source` glob in index.css ' +
      'resolves to a real directory from mocks/<slug>/src/, and the whole rendered tree passes ' +
      '`oxlint --max-warnings=0`. The title is deliberately hostile — an apostrophe, an ampersand ' +
      'and a double quote — so a missing escaper for any one file type is red.',
    blindSpot:
      'It does not compile or run anything: the mock is never typechecked, never built and never ' +
      'opened, because all three need `pnpm install` and that is the `build` row. A rendered file ' +
      'that is syntactically fine and semantically wrong passes. It also renders exactly one ' +
      'combination — de, profiles solo,full — so a locale- or profile-specific path is untested.',
  },
  {
    id: 'build',
    tier: 'full',
    after: ['template:render'],
    cmd: 'node scripts/verify/checks/build.mjs',
    proves:
      '`agency new` then `pnpm install` then `pnpm --filter <slug> build` then ' +
      '`pnpm --filter <slug> test` completes end to end on a mock that did not exist a minute ago, ' +
      'and the emitted dist CSS contains bg-card, text-primary and rounded-xl — which it can only ' +
      'do if Tailwind scanned the kit through the `@source` line. That is the one failure the day-4 ' +
      'gate was designed around and it is otherwise completely silent: the build succeeds and every ' +
      'kit surface renders unstyled in front of the client.',
    blindSpot:
      'Nothing renders in a browser: no Playwright, no viewport, no deep link, no click. The three ' +
      'utilities checked in dist CSS are a spot check, not the whole kit, and a class present in ' +
      'the stylesheet can still be overridden to nothing. It runs `pnpm install`, which rewrites ' +
      'pnpm-lock.yaml and node_modules and then restores the lockfile byte for byte — if that ' +
      'restoration fails it says so, but a concurrent install in the same tree is not detected.',
  },
];

/**
 * Rows the harness uses to test ITSELF. Without them the five statuses cannot be
 * exercised — you cannot prove a runner distinguishes UNRUNNABLE from FAILED
 * using only checks that pass. Off unless AGENCY_VERIFY_SELFTEST is set, so they
 * never appear in a real run.
 *
 * @type {Check[]}
 */
const SELFTEST = [
  {
    id: 'selftest:pass',
    tier: 'fast',
    cmd: 'true',
    proves: 'The runner records a zero exit as PASSED and does not mark it blocking.',
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
  {
    id: 'selftest:fail',
    tier: 'fast',
    cmd: 'sh -c "echo deliberate; exit 3"',
    proves: 'The runner records a non-zero exit from a command that DID run as FAILED, and blocks.',
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
  {
    id: 'selftest:unrunnable',
    tier: 'fast',
    cmd: 'agency-no-such-command-exists',
    proves:
      'The runner records "could not start" as UNRUNNABLE rather than FAILED, so a renamed script ' +
      'is never reported as a claim about code that never ran.',
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
  {
    id: 'selftest:skipped',
    tier: 'fast',
    needs: 'selftest-never',
    cmd: 'true',
    proves:
      'The runner records an absent precondition as SKIPPED, non-blocking by default and blocking ' +
      'under --no-skip, so "we could not check" is never printed as "we checked".',
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
  {
    id: 'selftest:skipexit',
    tier: 'fast',
    skipExit: 2,
    cmd: 'sh -c "echo no floor declared; exit 2"',
    proves:
      "The runner honours a row's own skipExit code, so a check that can tell the difference " +
      'between "measured and wrong" and "nothing to measure against" is believed about which it is.',
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
  {
    id: 'selftest:after',
    tier: 'fast',
    after: ['selftest:fail'],
    cmd: 'true',
    proves:
      'The runner records a check whose dependency did not pass as NOT_RUN and blocks, rather than ' +
      'running it against a tree its precondition says is broken.',
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
  {
    id: 'selftest:warns',
    tier: 'fast',
    cmd: 'sh -c "echo WARNING this passed but has something to say; exit 0"',
    proves:
      "The runner surfaces a WARNING line from a check that PASSED, rather than discarding a " +
      "passing check's stdout — which is a skip reading like a pass, one level down.",
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
  {
    id: 'selftest:failedwithloadmessage',
    tier: 'fast',
    cmd: 'sh -c "echo \\"FAIL src/a.test.ts > Error: Cannot find module \'./missing\'\\"; exit 1"',
    proves:
      'A check that RAN and reported a failure mentioning a missing module on stdout is classified ' +
      'FAILED, not UNRUNNABLE. A test suite whose test fails on a bad import prints exactly that ' +
      'text, and relabelling it as "could not start" hides a genuine red behind a status that ' +
      'claims nothing was tested.',
    blindSpot: 'Exercises the harness only. It says nothing whatsoever about this repository.',
  },
];

if (process.env.AGENCY_VERIFY_SELFTEST) {
  PRECONDITIONS['selftest-never'] = {
    describe: 'a precondition that is never met, so the SKIPPED path can be exercised',
    probe: async () => false,
  };
}

/** @type {Check[]} */
export const CHECKS = process.env.AGENCY_VERIFY_SELFTEST ? [...REAL, ...SELFTEST] : REAL;

/** @param {string} id @returns {Check | undefined} */
export const checkById = (id) => CHECKS.find((c) => c.id === id);

/** @param {Tier} checkTier @param {Tier} runTier @returns {boolean} */
export const inTier = (checkTier, runTier) => runTier === 'full' || checkTier === 'fast';

export { ROOT };
