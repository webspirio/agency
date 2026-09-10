#!/usr/bin/env node
/**
 * Every test file on disk is collected by exactly one vitest project — not zero,
 * not two.
 *
 * Ported from reference/verify/checks/test-glob-parity.mjs. A hand-enumerated
 * include list drops a whole package in silence: the suite reports green having
 * never opened the file. `vitest.config.ts` records that its previous form
 * enumerated `packages/{dec,synth,mock,cli}` by hand and collected nothing under
 * `mocks/*` — the actual deliverable — while still printing a green summary.
 *
 * The other direction matters too. An overlap means a jsdom test also runs under
 * `node` (or the reverse) and fails for reasons that have nothing to do with the
 * code — the shape that broke thirteen kit tests when the projects were
 * partitioned by file extension instead of by package.
 *
 * Moved out of packages/cli/src/workspace.contract.test.ts, where a vitest run
 * shelled out to `vitest list` over the whole repository.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const VITEST = path.join(ROOT, 'node_modules', '.bin', 'vitest');
const PRUNE = new Set(['node_modules', 'dist', '.git', 'reference', 'coverage']);
const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

/**
 * The slug prefix the `build` row scaffolds under, reserved on BOTH sides of
 * this comparison.
 *
 * `vitest.config.ts` excludes it from the projects because a `pnpm test`
 * overlapping the build row's window collects a directory that then vanishes —
 * measured as `1 failed | 58 passed` over a run in which all 2820 tests passed.
 * If the disk walk did not skip the same prefix, the two halves would
 * contradict each other and THIS check would be the flaky one instead. It is
 * not a hole: a transient mock's tests are run, by its own vitest, by the very
 * row that creates it.
 */
const TRANSIENT = /^verify-build-/;

/** @param {string} dir @param {string[]} out @returns {string[]} */
function walk(dir, out = []) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (PRUNE.has(e.name) || TRANSIENT.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (TEST_FILE.test(e.name)) out.push(path.relative(ROOT, full));
  }
  return out;
}

const onDisk = [...walk(path.join(ROOT, 'packages')), ...walk(path.join(ROOT, 'mocks'))];

const res = spawnSync(VITEST, ['list', '--filesOnly'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  // pnpm's pre-run dependency check spawns a second resolver pass on every
  // invocation and prints to the same stream this parses.
  env: { ...process.env, PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false' },
});

if (res.error || res.status !== 0) {
  process.stderr.write(
    `test:parity: could not enumerate what vitest collects: ${res.error?.message ?? `exit ${res.status}`}\n` +
      `${(res.stderr ?? '').split('\n').slice(-20).join('\n')}\n`,
  );
  process.exit(res.error ? 127 : 1);
}

// `vitest list` prefixes each path with its project, e.g. `[node] packages/…`.
/** @type {Map<string, number>} */
const seen = new Map();
for (const line of (res.stdout ?? '').split('\n')) {
  const m = /^(?:\[[^\]]+\]\s*)?(\S*\.(?:test|spec)\.tsx?)$/.exec(line.trim());
  if (!m?.[1]) continue;
  const rel = path.isAbsolute(m[1]) ? path.relative(ROOT, m[1]) : m[1];
  seen.set(rel, (seen.get(rel) ?? 0) + 1);
}

const uncollected = onDisk.filter((f) => !seen.has(f));
const twice = [...seen].filter(([, n]) => n !== 1).map(([f, n]) => `${f} x${n}`);
const phantom = [...seen.keys()].filter((f) => !onDisk.includes(f));

if (uncollected.length || twice.length || phantom.length) {
  process.stderr.write('test:parity: FAILED — the partition in vitest.config.ts is not a partition\n');
  for (const f of uncollected) process.stderr.write(`  never collected (a red test here reports green): ${f}\n`);
  for (const f of twice) process.stderr.write(`  collected by two projects (wrong environment for one of them): ${f}\n`);
  for (const f of phantom) process.stderr.write(`  collected but not on disk: ${f}\n`);
  process.exit(1);
}

process.stdout.write(
  `test:parity: ${onDisk.length} test files on disk, each collected by exactly one vitest project\n`,
);
