#!/usr/bin/env node
/**
 * `tsc -b --force`, and the program it built contains nothing from `reference/`.
 *
 * FORCED, not incremental. docs/BUILD-REPORT.md, open defect #5: the root
 * `typecheck` script was `tsc -b`, and a stale `tsbuildinfo` returned exit 0 over
 * a tree that `tsc -b --force` rejected with three errors. The contract test
 * written precisely because typecheck had once shipped red for eight commits
 * invoked the same incremental form and inherited the blind spot it was built to
 * close. A gate that can be satisfied by a cache file is not a gate.
 *
 * The `reference/` seal rides along on the same invocation rather than paying for
 * a second full build: `--listFiles` costs nothing once tsc is already running,
 * and the two claims are about the same program. HARD RULE 7 makes `reference/`
 * read-only prior art — snapshots from other repos that import modules which do
 * not exist here. In the graph, `tsc -b` could only ever be red, which is how the
 * typecheck row becomes permanently unrunnable rather than merely failing.
 *
 * Moved out of packages/cli/src/workspace.contract.test.ts, where it ran a
 * repo-wide `tsc -b` from inside vitest concurrently with two other files doing
 * the same.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const TSC = path.join(ROOT, 'node_modules', '.bin', 'tsc');

const res = spawnSync(TSC, ['-b', '--force', '--listFiles'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

if (res.error) {
  process.stderr.write(`typecheck: could not start tsc: ${res.error.message}\n`);
  process.exit(127);
}

const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
// `--listFiles` prints one absolute path per line; diagnostics print anything
// else. Separating them keeps a 3,000-line file list out of the failure tail.
const lines = out.split('\n');
const files = lines.filter((l) => l.startsWith('/'));
const diagnostics = lines.filter((l) => l.trim() !== '' && !l.startsWith('/'));

if (res.status !== 0) {
  process.stderr.write(`typecheck: FAILED — tsc -b --force exited ${res.status}\n`);
  for (const d of diagnostics.slice(0, 60)) process.stderr.write(`  ${d}\n`);
  process.exit(1);
}

const leaked = files.filter((f) => f.includes('/reference/'));
if (leaked.length) {
  process.stderr.write(
    `typecheck: FAILED — ${leaked.length} file(s) from reference/ are in the program\n` +
      `${leaked.slice(0, 20).map((f) => `  ${path.relative(ROOT, f)}\n`).join('')}` +
      `  reference/ is read-only prior art (HARD RULE 7). It imports modules that do not exist\n` +
      `  here, so in the graph this row can only ever be red. Exclude it from the tsconfig that\n` +
      `  pulled it in — do not add // @ts-ignore.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `typecheck: tsc -b --force exited 0 over ${files.length} files, none of them from reference/\n`,
);
