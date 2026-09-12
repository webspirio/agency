#!/usr/bin/env node
/**
 * Every route driven once through the REAL adapter, fingerprinted, and diffed
 * against the committed fixture — on a mock that did not exist a minute ago.
 *
 * This is SPEC 10's `numbers:frozen` applied to SHAPES. It is the only mechanism
 * in this repo that catches a RE-CASED wire field: `created_at` -> `createdAt`
 * typechecks perfectly when both sides are renamed together, and every
 * type-level mechanism the contract carries is blind to it.
 *
 * It runs against a SCAFFOLDED mock rather than against templates/mock, because
 * the question is what a mock a client receives actually puts on the wire — the
 * template is source, and the rendered mock is the artifact.
 *
 * Cost and side effects, stated because they are real: this runs `pnpm install`,
 * which rewrites pnpm-lock.yaml (a scaffolded mock is a new workspace importer)
 * and links into node_modules. Both are restored.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SLUG = `verify-frozen-${process.pid}`;
const DIR = path.join(ROOT, 'mocks', SLUG);
const LOCK = path.join(ROOT, 'pnpm-lock.yaml');
const COMMITTED = path.join(ROOT, 'templates', 'mock', 'src', 'api', 'wire.golden.json');

const lockBefore = existsSync(LOCK) ? readFileSync(LOCK) : null;

function restore() {
  try { rmSync(DIR, { recursive: true, force: true }); }
  catch (err) { process.stderr.write(`wire:frozen: could not remove ${DIR}: ${err}\n`); }
  try { if (lockBefore && !readFileSync(LOCK).equals(lockBefore)) writeFileSync(LOCK, lockBefore); }
  catch (err) { process.stderr.write(`wire:frozen: WARNING could not restore pnpm-lock.yaml: ${err}\n`); }
}

function step(label, cmd, args, env = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false', CI: '1', ...env },
  });
  if (res.error || res.status !== 0) {
    process.stderr.write(
      `wire:frozen: FAILED at "${label}" — ${res.error?.message ?? `exit ${res.status}`}\n` +
        `${`${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd().split('\n').slice(-30).join('\n')}\n`,
    );
    restore();
    process.exit(res.error ? 127 : 1);
  }
  return `${res.stdout ?? ''}${res.stderr ?? ''}`;
}

try {
  if (!existsSync(COMMITTED)) {
    process.stderr.write(
      `wire:frozen: FAILED — no committed fixture at templates/mock/src/api/wire.golden.json.\n` +
        `  Regenerate with: AGENCY_GOLDEN=write pnpm --filter <slug> test\n`,
    );
    process.exit(1);
  }
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });

  step('agency new', process.execPath, [
    path.join(ROOT, 'packages', 'cli', 'bin', 'agency.mjs'),
    'new', SLUG, '--title', 'Wire Frozen', '--locale', 'de', '--profiles', 'solo,full',
  ]);
  step('pnpm install', 'pnpm', ['install', '--no-frozen-lockfile']);

  // 1. COMPARE. The mock carries the fixture the template shipped, so this is the
  //    committed shape versus what the real adapter emits right now.
  step('wire golden', 'pnpm', ['--filter', SLUG, 'exec', 'vitest', 'run', 'src/api/wire.golden.test.ts']);

  // 2. REGENERATE, and require the result to be byte-identical to what is
  //    committed. Without this a fixture could be stale in a way the comparison
  //    tolerates — e.g. if the test silently stopped driving a route.
  step('regenerate', 'pnpm', ['--filter', SLUG, 'exec', 'vitest', 'run', 'src/api/wire.golden.test.ts'],
    { AGENCY_GOLDEN: 'write' });

  const regenerated = readFileSync(path.join(DIR, 'src', 'api', 'wire.golden.json'), 'utf8');
  const committed = readFileSync(COMMITTED, 'utf8');
  if (regenerated !== committed) {
    process.stderr.write(
      'wire:frozen: FAILED — the regenerated fingerprint differs from the committed fixture.\n' +
        '  The wire changed. If that was deliberate, regenerate and commit the diff:\n' +
        '    AGENCY_GOLDEN=write pnpm --filter <slug> test\n' +
        `  committed:   ${committed.replace(/\s+/g, ' ').slice(0, 300)}\n` +
        `  regenerated: ${regenerated.replace(/\s+/g, ' ').slice(0, 300)}\n`,
    );
    restore();
    process.exit(1);
  }

  const operations = Object.keys(JSON.parse(committed)).length;
  process.stdout.write(
    `wire:frozen: ${operations} operation(s) driven through the real adapter on a freshly scaffolded ` +
      `mock; the fingerprint is byte-identical to the committed fixture\n`,
  );
  restore();
} catch (err) {
  process.stderr.write(`wire:frozen: FAILED — ${err instanceof Error ? err.stack : String(err)}\n`);
  restore();
  process.exit(1);
}
