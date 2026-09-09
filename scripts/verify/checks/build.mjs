#!/usr/bin/env node
/**
 * The day-4 gate, as a check row: `agency new` → `pnpm install` → build → test,
 * end to end, on a mock that did not exist a minute ago.
 *
 * This is the only row that compiles anything. Everything the fast tier is blind
 * to lives here: the Tailwind `@source` line reaching dist CSS, the vite config,
 * the mock's own tsconfig, its dependency closure resolving, and its three tests
 * running under its own vitest rather than the workspace's.
 *
 * `bg-card` in the emitted CSS is checked because that is the failure the gate
 * was designed around and it is completely silent: with the `@source` glob wrong,
 * the build succeeds, the app runs, and every kit surface renders unstyled.
 *
 * COST AND SIDE EFFECTS, stated because they are real: this row runs
 * `pnpm install`, which rewrites `pnpm-lock.yaml` (a scaffolded mock is a new
 * workspace importer) and links into `node_modules`. Both are restored: the
 * lockfile from the exact bytes read before the run, and the mock directory by
 * removal. It is `full` tier for that reason and must never be in `fast`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SLUG = `verify-build-${process.pid}`;
const DIR = path.join(ROOT, 'mocks', SLUG);
const LOCK = path.join(ROOT, 'pnpm-lock.yaml');

const lockBefore = existsSync(LOCK) ? readFileSync(LOCK) : null;
const started = Date.now();

function restore() {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch (err) {
    process.stderr.write(`build: could not remove ${DIR}: ${err}\n`);
  }
  // Byte-exact restoration of a file this check itself changed — not a blanket
  // `git checkout .`, which would take other people's work with it.
  try {
    if (lockBefore && !readFileSync(LOCK).equals(lockBefore)) writeFileSync(LOCK, lockBefore);
  } catch (err) {
    process.stderr.write(`build: WARNING could not restore pnpm-lock.yaml: ${err}\n`);
  }
}

/**
 * @param {string} label
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string}
 */
function step(label, cmd, args) {
  const t = Date.now();
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false', CI: '1' },
  });
  const took = ((Date.now() - t) / 1000).toFixed(2);
  if (res.error || res.status !== 0) {
    process.stderr.write(
      `build: FAILED at "${label}" after ${took}s — ${res.error?.message ?? `exit ${res.status}`}\n` +
        `${`${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd().split('\n').slice(-40).join('\n')}\n`,
    );
    restore();
    process.exit(res.error ? 127 : 1);
  }
  process.stdout.write(`build: ${label} — ${took}s\n`);
  return `${res.stdout ?? ''}${res.stderr ?? ''}`;
}

try {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });

  step('agency new', process.execPath, [
    path.join(ROOT, 'packages', 'cli', 'bin', 'agency.mjs'),
    'new',
    SLUG,
    '--title',
    'Verify Build',
    '--locale',
    'de',
    '--profiles',
    'solo,full',
  ]);

  // `pnpm` off PATH. If it is not there, spawnSync fails and this exits 127,
  // which the runner classifies as UNRUNNABLE — the honest answer, because
  // nothing was learned about the scaffolder.
  step('pnpm install', 'pnpm', ['install', '--no-frozen-lockfile']);
  step('build', 'pnpm', ['--filter', SLUG, 'build']);
  step('test', 'pnpm', ['--filter', SLUG, 'test']);

  // The @source silent failure, checked in the artefact rather than in the config
  // that is supposed to produce it.
  const assets = path.join(DIR, 'dist', 'assets');
  const cssFiles = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.css')) : [];
  if (cssFiles.length === 0) {
    process.stderr.write('build: FAILED — the build produced no CSS in dist/assets\n');
    restore();
    process.exit(1);
  }
  const css = cssFiles.map((f) => readFileSync(path.join(assets, f), 'utf8')).join('\n');
  const missing = ['bg-card', 'text-primary', 'rounded-xl'].filter((u) => !css.includes(u));
  if (missing.length) {
    process.stderr.write(
      `build: FAILED — ${missing.join(', ')} absent from dist CSS.\n` +
        `  Tailwind did not scan the kit. The \`@source\` line in src/index.css is wrong, and this\n` +
        `  failure is otherwise completely silent: the build succeeds and every kit surface renders\n` +
        `  unstyled in front of the client.\n`,
    );
    restore();
    process.exit(1);
  }

  process.stdout.write(
    `build: agency new → install → build → test in ${((Date.now() - started) / 1000).toFixed(1)}s; ` +
      `dist CSS carries bg-card, text-primary and rounded-xl, so Tailwind reached the kit\n`,
  );
  restore();
} catch (err) {
  process.stderr.write(`build: FAILED — ${err instanceof Error ? err.stack : String(err)}\n`);
  restore();
  process.exit(1);
}
