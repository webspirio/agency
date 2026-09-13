#!/usr/bin/env node
/**
 * THE TEMPLATE IS COMPILED AND ITS TESTS ARE RUN, IN THE FAST TIER.
 *
 * The template carries the most guarantees in this repo — its test suite and every
 * `@ts-expect-error` in `drift.controls.ts` — and until this row the only thing that
 * opened them was the FULL tier's `build` row, on a mock scaffolded AND `pnpm
 * install`ed from scratch. Every task in the contract rework that touched a control
 * had to scaffold, install and build by hand to find out whether it still bit.
 *
 * What makes this cheap is that the root now carries the template's dependencies at
 * the same ranges (asserted by packages/cli/src/template-deps.contract.test.ts), so a
 * rendered mock resolves everything by walking UP to the root node_modules and needs
 * no install of its own. Measured: render + tsc + vitest, no install.
 *
 * It renders rather than compiling templates/ in place, and that is forced: the
 * template's `src/profiles.ts` exists only as `profiles.ts.hbs`, and `src/api/client.ts`
 * imports it — so `templates/mock/src` does not typecheck until it has been rendered.
 *
 * The slug is `verify-*`, which is RESERVED: vitest.config.ts excludes the whole
 * prefix so a concurrent `pnpm test` cannot collect a directory that is about to
 * vanish, and both AST rows skip it for the same reason.
 *
 *   node scripts/verify/checks/template-check.mjs [--root DIR]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

/* TWO ROOTS, and keeping them apart is what makes this row fixture-able. The
   TOOLCHAIN — the scaffolder, tsc, vitest, node_modules — always comes from THIS
   repo; `--root` selects only which tree's `templates/mock` to render. A derived
   tree carrying one planted defect has no node_modules and no CLI, so a row that
   read both from `--root` could only ever SKIP there. */
const REPO = path.resolve(import.meta.dirname, '..', '..', '..');
const at = process.argv.indexOf('--root');
const root = at === -1 ? REPO : path.resolve(process.argv[at + 1] ?? '.');

const templateDir = path.join(root, 'templates', 'mock');

const slug = `verify-tmpl-${process.pid}`;
/* Rendered into THIS repo's mocks/, never the derived tree's: the rendered mock has
   to resolve its imports by walking up to a real node_modules. */
const dir = path.join(REPO, 'mocks', slug);
const cli = path.join(REPO, 'packages', 'cli', 'bin', 'agency.mjs');
const tsc = path.join(REPO, 'node_modules', '.bin', 'tsc');
const vitest = path.join(REPO, 'node_modules', '.bin', 'vitest');

const fail = (message) => {
  process.stderr.write(`template:check: FAILED — ${message}\n`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
};

if (!existsSync(cli)) {
  process.stdout.write(`template:check: SKIPPED — no scaffolder at ${path.relative(root, cli)}\n`);
  process.exit(2);
}
if (!existsSync(templateDir)) {
  process.stdout.write(
    `template:check: SKIPPED — no templates/mock under ${root}, so there was nothing to render\n`,
  );
  process.exit(2);
}
if (!existsSync(tsc) || !existsSync(vitest)) {
  process.stdout.write(
    'template:check: SKIPPED — tsc or vitest is absent from node_modules, so a rendered mock ' +
      'has nothing to resolve against. A fresh checkout before `pnpm install` looks like this.\n',
  );
  process.exit(2);
}

rmSync(dir, { recursive: true, force: true });

try {
  const made = spawnSync(
    process.execPath,
    [
      cli, 'new', slug,
      '--title', 'Template Check',
      '--locale', 'de',
      '--profiles', 'solo,full',
      '--template', templateDir,
    ],
    { cwd: REPO, encoding: 'utf8' },
  );
  if (made.status !== 0) fail(`\`agency new\` exited ${made.status}\n${made.stdout}${made.stderr}`);

  // TYPECHECK. This is what compiles drift.controls.ts, so an @ts-expect-error that
  // has stopped suppressing anything is TS2578 here rather than two minutes away.
  const typed = spawnSync(tsc, ['--noEmit', '-p', path.join(dir, 'tsconfig.json')], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (typed.status !== 0) {
    fail(`the rendered mock does not typecheck\n${typed.stdout}${typed.stderr}`);
  }

  // TESTS. Run from INSIDE the rendered mock, because its vite config resolves its
  // setup file relative to cwd — measured: `--root` alone reaches for the workspace's
  // setup file instead and collects nothing.
  const tested = spawnSync(vitest, ['run'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (tested.status !== 0) {
    fail(`the rendered mock's own tests do not pass\n${tested.stdout}${tested.stderr}`);
  }

  process.stdout.write(
    'template:check: the template renders, typechecks and passes its own tests — with no ' +
      'install, because the root carries its dependencies at the same ranges\n',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
  try {
    rmSync(path.join(REPO, 'mocks'), { recursive: false });
  } catch {
    /* other mocks live here; leaving the directory is correct */
  }
}
