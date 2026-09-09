#!/usr/bin/env node
/**
 * `agency new` produces a complete mock: no placeholder survives, no `.hbs`
 * survives, the five silently-failing files carry their marker, and the result
 * passes the linter the workspace ships.
 *
 * This is the propagation doctrine's first clause under test. A standard reaches
 * a new mock as something the scaffolder writes at t=0 or it does not reach it at
 * all — so what the scaffolder writes is the thing to check. The failure mode it
 * rules out is quiet by construction: a renderer that emits `headline: ''` or
 * leaves `{{title}}` in a `<title>` tag produces a mock that builds, runs, and is
 * wrong in front of the client.
 *
 * It renders into `mocks/` rather than a directory outside the repo because every
 * relative path in the template — `../../tsconfig.base.json`, the Tailwind
 * `@source over packages/kit/src` line, `../../.oxlintrc.json` —
 * resolves from `mocks/<slug>/` and from nowhere else. Rendering somewhere else
 * would test a path layout no mock ever has.
 *
 * It does NOT typecheck. `tsc` over a rendered mock needs its dependencies
 * resolvable, which needs `pnpm install`; that is the `build` row, which
 * typechecks it as the first half of `tsc -b && vite build`. Running an install
 * here as well would double the full tier's cost and establish nothing new.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SLUG = `verify-render-${process.pid}`;
const DIR = path.join(ROOT, 'mocks', SLUG);

/** @type {string[]} */
const problems = [];

/** @param {string} dir @param {string[]} out @returns {string[]} */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function cleanup() {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch (err) {
    process.stderr.write(`template:render: could not remove ${DIR}: ${err}\n`);
  }
}

try {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });

  const made = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'packages', 'cli', 'bin', 'agency.mjs'),
      'new',
      SLUG,
      '--title',
      // Deliberately hostile: an apostrophe must survive into a single-quoted TS
      // literal, an ampersand into HTML, and a quote into JSON. One escaper per
      // file type is the whole reason the renderer refuses unknown extensions.
      "O'Brien & Sons \"Frisch\"",
      '--locale',
      'de',
      '--profiles',
      'solo,full',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );

  if (made.status !== 0) {
    process.stderr.write(
      `template:render: FAILED — \`agency new\` exited ${made.status}\n${made.stdout ?? ''}${made.stderr ?? ''}\n`,
    );
    cleanup();
    process.exit(made.error ? 127 : 1);
  }

  const files = walk(DIR);
  if (files.length < 10) problems.push(`only ${files.length} files were written — the template is not being copied`);

  for (const f of files) {
    const rel = path.relative(DIR, f);
    if (f.endsWith('.hbs')) problems.push(`${rel} — a .hbs template survived into the output`);
    if (/\.(?:ts|tsx|json|css|html|md|js|mjs)$/.test(f)) {
      const body = readFileSync(f, 'utf8');
      if (body.includes('{{')) {
        const line = body.split('\n').findIndex((l) => l.includes('{{')) + 1;
        problems.push(`${rel}:${line} — an unsubstituted placeholder survived`);
      }
    }
  }

  // The five files that fail SILENTLY when an agent rewrites them. The marker is
  // how a later reader knows not to.
  for (const rel of ['src/app/router.tsx', 'src/api/client.ts', 'src/main.tsx', 'src/profiles.ts', 'src/index.css']) {
    const f = path.join(DIR, rel);
    if (!existsSync(f)) problems.push(`${rel} — scaffold-owned file missing from the rendered mock`);
    else if (!readFileSync(f, 'utf8').includes('@scaffold-owned')) {
      problems.push(`${rel} — rendered without its @scaffold-owned marker`);
    }
  }

  // Without this line `bg-card` and `text-primary` are simply absent from the
  // built CSS, with no error anywhere. It is the silent failure the day-4 gate
  // was built around, and it is one glob away from being wrong forever.
  const css = existsSync(path.join(DIR, 'src/index.css'))
    ? readFileSync(path.join(DIR, 'src/index.css'), 'utf8')
    : '';
  const source = /@source\s+"([^"]+)"/.exec(css)?.[1];
  if (!source) problems.push('src/index.css has no @source line — kit utilities will be absent from dist CSS');
  else if (!existsSync(path.resolve(DIR, 'src', source.replace(/\/\*\*.*$/, '')))) {
    problems.push(`src/index.css @source "${source}" resolves to nothing from mocks/<slug>/src/`);
  }

  const lint = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'oxlint'), ['--max-warnings=0', `mocks/${SLUG}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (lint.status !== 0) {
    problems.push(`the rendered mock does not pass \`oxlint --max-warnings=0\`:\n${`${lint.stdout ?? ''}${lint.stderr ?? ''}`.trimEnd()}`);
  }

  if (problems.length) {
    process.stderr.write(`template:render: FAILED — ${problems.length} problem(s) in the rendered mock\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    cleanup();
    process.exit(1);
  }

  process.stdout.write(
    `template:render: \`agency new\` wrote ${files.length} files, no placeholder or .hbs survived, ` +
      `all five scaffold-owned markers present, oxlint clean\n`,
  );
  cleanup();
} catch (err) {
  process.stderr.write(`template:render: FAILED — ${err instanceof Error ? err.stack : String(err)}\n`);
  cleanup();
  process.exit(1);
}
