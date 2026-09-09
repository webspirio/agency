/**
 * The check registry. This file is the point of the whole layer: what a check
 * PROVES and what it stays BLIND TO live side by side, as data, so the runner's
 * output, a CI log and CLAUDE.md cannot drift apart from each other.
 *
 * Rules for editing:
 *  - `proves` must be falsifiable by THIS EXACT COMMAND failing. If no possible
 *    failure of `cmd` could make the sentence untrue, it is decoration —
 *    delete it.
 *  - `blindSpot` must not be written broader than the command establishes.
 *  - `after` only where the dependency is real, not where the order feels tidy.
 *  - A row is added when the thing it checks can actually go red. SPEC 10 lists
 *    twelve freeze-tier rows; the eight that need `agency freeze`, a built dist
 *    or a Playwright run are Plan B and are deliberately absent rather than
 *    present-and-skipped, because a permanently SKIPPED row reads as coverage.
 *
 * Ported, much reduced, from reference/verify/registry.mjs — 549 lines there
 * for 16 checks against a mature app; SPEC 10 budgets ~350 for the whole layer.
 */

import { existsSync, readFileSync } from 'node:fs';
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
 * @property {string} proves
 * @property {string} blindSpot
 */

/**
 * A precondition answers exactly one question: "are there conditions to run in
 * at all?" It must never answer "did it work". Collapsing those two is how a
 * dead suite stays green for months.
 *
 * @type {Record<PreconditionId, {describe: string, probe: () => Promise<boolean>}>}
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
    id: 'lint',
    tier: 'fast',
    cmd: 'pnpm lint',
    proves:
      'oxlint exits 0 over packages/, templates/ and mocks/ with --max-warnings=0, so no file in ' +
      'the workspace performs money arithmetic, relational comparison, numeric coercion, an ' +
      'unordered id or a default-comparator sort outside the six exemptions recorded in the ' +
      'lint-exempt baseline.',
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
    cmd: 'pnpm typecheck',
    proves:
      '`tsc -b` builds every referenced project in the root solution to completion under strict, ' +
      'noUncheckedIndexedAccess and verbatimModuleSyntax, so no package contains a type error and ' +
      'no cross-package signature has drifted since the last build.',
    blindSpot:
      'Says nothing about mocks/<slug>, which are their own projects built by their own `pnpm ' +
      'build`, nor about anything a type cannot express — `as Locale` on an unvalidated string ' +
      'typechecks and throws at demo time. It also cannot see runtime resolution: an exports map ' +
      'that TypeScript follows and node cannot load is green here.',
  },
  {
    id: 'test',
    tier: 'fast',
    cmd: 'pnpm test',
    proves:
      'Every *.test.ts and *.test.tsx under packages/ and mocks/ runs to completion and passes, in ' +
      'the environment its package needs, with no file collected twice and none orphaned — the ' +
      'partition itself is asserted by packages/cli/src/workspace.contract.test.ts.',
    blindSpot:
      'Passing tests are not evidence that the right things are tested. Coverage is not measured ' +
      'and no mutation testing runs, so a test that cannot fail counts the same as one that can — ' +
      'the golden fixture asserted dec against itself for 675 cases and was green throughout.',
  },
  {
    id: 'lint:exempt',
    tier: 'fast',
    after: ['lint'],
    cmd: 'node scripts/verify/checks/lint-exempt.mjs',
    proves:
      'Every rule-level exemption in .oxlintrc.json still suppresses exactly the number of findings ' +
      'the committed baseline records: a newly exempted file, an exemption that has gone stale, and ' +
      'a change in how much an exemption hides are each red.',
    blindSpot:
      'It checks the shape of the exemption list, never whether an exemption was a good idea. It ' +
      'also cannot see suppression that does not go through the config: an inline ' +
      '`// oxlint-disable-line` is invisible to it, and so is a rule nobody turned on in the first ' +
      'place.',
  },
  {
    id: 'node',
    tier: 'fast',
    needs: 'node-major',
    cmd: 'node -e "process.exit(0)"',
    proves:
      'The node running the checks is the major pinned in .nvmrc, so every other row in this table ' +
      'is a verdict about the runtime the gate and CI actually use.',
    blindSpot:
      'Only the major is compared. A patch-level difference in V8, a different pnpm, or a different ' +
      'OS all change behaviour and are not looked at here.',
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
    id: 'selftest:after',
    tier: 'fast',
    after: ['selftest:fail'],
    cmd: 'true',
    proves:
      'The runner records a check whose dependency did not pass as NOT_RUN and blocks, rather than ' +
      'running it against a tree its precondition says is broken.',
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

/** Does a stored verdict at `storedTier` cover a request for `wantedTier`? */
export const tierCovers = (storedTier, wantedTier) => storedTier === 'full' || storedTier === wantedTier;

export { ROOT, existsSync };
