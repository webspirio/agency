#!/usr/bin/env node
/**
 * The node running the checks satisfies the floor package.json declares.
 *
 * docs/BUILD-REPORT.md, open defect #8: the day-4 gate ran on node v22.23.1 while
 * `engines` demanded `>=24`. Every pnpm call warned; nothing was red; the gate's
 * measured pass is therefore a verdict about a runtime the project says it does
 * not support. Listed there under "what a check should have caught and didn't"
 * as the would-be row `engines:actual`.
 *
 * Exit codes are three-valued, and that is the point:
 *   0  the running major satisfies the declared floor
 *   1  it does not — FAILED. Not skipped: a declared floor and a runtime below
 *      it is a measurement, not a missing precondition.
 *   2  nothing to measure against — no `engines.node`, or a range shape this
 *      checker cannot evaluate. The registry maps 2 onto SKIPPED, so "we could
 *      not check" is never printed as "we checked", and `--no-skip` turns it
 *      back into a failure for CI.
 *
 *   node scripts/verify/checks/engines.mjs [--root DIR] [--node vX.Y.Z]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** @param {string[]} argv @param {string} name @returns {string | undefined} */
function flag(argv, name) {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

/**
 * The ONLY range shape this understands: a single `>=N` or `>N` major floor,
 * optionally with minor/patch. Anything else — a disjunction, an upper bound, a
 * caret over a range — exits 2 rather than being approximated. An approximated
 * range is a check that answers a question nobody asked.
 *
 * @param {string} range
 * @returns {{ op: '>=' | '>', major: number } | null}
 */
function parseFloor(range) {
  const m = /^\s*(>=|>)\s*v?(\d+)(?:\.\d+)*\s*$/.exec(range);
  if (!m) return null;
  const major = globalThis.Number.parseInt(m[2] ?? '', 10);
  if (!globalThis.Number.isInteger(major)) return null;
  return { op: /** @type {'>=' | '>'} */ (m[1]), major };
}

function main() {
  const root = path.resolve(flag(process.argv, '--root') ?? DEFAULT_ROOT);
  const version = flag(process.argv, '--node') ?? process.version;
  const running = globalThis.Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10);

  /** @param {string} why @returns {never} */
  const skip = (why) => {
    process.stdout.write(`engines: SKIPPED — ${why}\n`);
    process.exit(2);
  };

  let declared;
  try {
    declared = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))?.engines?.node;
  } catch (err) {
    skip(`package.json at ${root} is unreadable (${err instanceof Error ? err.message : String(err)}), so there is no floor to compare against`);
  }

  if (typeof declared !== 'string' || declared.trim() === '') {
    skip(
      'package.json declares no `engines.node`, so nothing here says which runtime is supported. ' +
        'This is an absent precondition, NOT "the runtime is fine".',
    );
  }

  const floor = parseFloor(declared);
  if (!floor) {
    skip(
      `\`engines.node\` is "${declared}", which this checker does not evaluate — it understands a ` +
        'single ">=N" / ">N" major floor and refuses to approximate anything else.',
    );
  }

  if (!globalThis.Number.isInteger(running)) {
    skip(`could not read a major out of the node version "${version}"`);
  }

  const ok = floor.op === '>=' ? running >= floor.major : running > floor.major;
  if (!ok) {
    process.stderr.write(
      `engines: FAILED\n` +
        `  running node ${version} (major ${running}), package.json engines.node is "${declared}".\n` +
        `  Every other row in this run is therefore a verdict about a runtime this project says it\n` +
        `  does not support. Switch interpreters (\`nvm use\`) rather than widening the floor —\n` +
        `  .nvmrc pins the version the Stop hook and CI use.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`engines: node ${version} satisfies engines.node "${declared}"\n`);

  // A passing row can still have something to say. The runner collects lines
  // matching WARNING even from a check that exited 0, so a .nvmrc that disagrees
  // with the interpreter is visible without being blocking — the floor is what
  // this row measures, the pin is not.
  try {
    const pinned = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '').split('.')[0];
    if (pinned && pinned !== String(running)) {
      process.stdout.write(
        `engines: WARNING .nvmrc pins node ${pinned} but the checks are running on ${running}. ` +
          `The floor is satisfied, so this is not blocking — but the gate and CI use ${pinned}.\n`,
      );
    }
  } catch {
    /* no .nvmrc: the floor is the only claim this row makes */
  }
}

main();
