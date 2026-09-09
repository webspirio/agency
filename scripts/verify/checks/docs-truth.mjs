#!/usr/bin/env node
/**
 * CLAUDE.md is prose, and this repo's governing rule says prose is not a control
 * surface. So the prose gets a control surface of its own: every command it tells
 * an agent to run must exist, and every path it names must be on disk.
 *
 * This is SPEC 10's `links:truth` row applied to the one document an agent reads
 * first. The failure it prevents is recorded in the repo it was learned from — a
 * README instructing a step against a control deleted two phases earlier, green
 * the whole time because nothing checked it.
 *
 * Moved out of `packages/cli/src/docs.contract.test.ts` and into the registry so
 * the memo is checked by the same runner that checks everything else, and so its
 * result carries a `proves` and a `blindSpot` like every other row.
 *
 *   node scripts/verify/checks/docs-truth.mjs [--root DIR]
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** pnpm's own verbs, not scripts of this workspace. */
const PNPM_BUILTIN = new Set(['install', 'add', 'remove', 'filter', 'dlx', 'exec', 'why', 'store']);

/**
 * Every backticked path is a CLAIM, and it is checked. Nothing is exempted by a
 * heuristic: a rule like "only if the first segment is a real top-level entry"
 * reads as tidy and quietly stops checking `docs/ghost.md` the moment `docs/` is
 * renamed — a checker that goes silent exactly when the tree moves is worse than
 * none. The two paths this repo names that it does not own (axios internals) are
 * written with their `node_modules/` prefix in the memo instead, which is the
 * form the grep command uses anyway.
 *
 * `src/app/router.tsx` exists in `templates/mock/`, possibly as a `.hbs`, because
 * that is where a scaffolded mock's paths live.
 *
 * @param {string} root
 * @param {string} rel
 * @returns {boolean}
 */
function resolvesSomewhere(root, rel) {
  const candidates = [
    path.join(root, rel),
    path.join(root, 'templates', 'mock', rel),
    `${path.join(root, 'templates', 'mock', rel)}.hbs`,
  ];
  return candidates.some((c) => existsSync(c));
}

function main() {
  const at = process.argv.indexOf('--root');
  const root = at === -1 ? DEFAULT_ROOT : path.resolve(process.argv[at + 1] ?? '.');
  const memoPath = path.join(root, 'CLAUDE.md');

  /** @type {string[]} */
  const problems = [];

  let memo;
  try {
    memo = readFileSync(memoPath, 'utf8');
  } catch {
    process.stderr.write(`docs:truth: FAILED\n  no CLAUDE.md at ${memoPath}\n`);
    process.exit(1);
  }

  /** @type {Record<string, string>} */
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    problems.push('package.json is unreadable, so no `pnpm <script>` the memo names can be checked');
  }

  // Only inside backticks. Prose that merely mentions a filename in passing is
  // not a claim; `code` is.
  const named = [...memo.matchAll(/`pnpm (?:run )?([a-z][a-z0-9:._-]*)/g)]
    .map((m) => m[1])
    .filter((s) => s !== undefined && !PNPM_BUILTIN.has(s));
  for (const s of [...new Set(named)]) {
    if (!(s in scripts)) problems.push(`\`pnpm ${s}\` — no such script in package.json`);
  }

  const paths = [...memo.matchAll(/`([a-zA-Z0-9_./-]+\.(?:ts|tsx|mjs|js|json|md|css|sh|yaml|yml))`/g)]
    .map((m) => m[1])
    .filter((p) => p !== undefined && !p.includes('node_modules'));
  for (const p of [...new Set(paths)]) {
    if (!resolvesSomewhere(root, p)) problems.push(`\`${p}\` — named in CLAUDE.md, not on disk`);
  }

  const dirs = [...memo.matchAll(/`([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.*<>-]+)*\/)`/g)]
    .map((m) => m[1])
    .filter((p) => p !== undefined && !p.includes('*') && !p.includes('<') && !p.startsWith('/'))
    .filter((p) => !p.includes('node_modules'));
  for (const d of [...new Set(dirs)]) {
    if (!resolvesSomewhere(root, d)) problems.push(`\`${d}\` — named in CLAUDE.md, not on disk`);
  }

  if (problems.length) {
    process.stderr.write(`docs:truth: FAILED — ${problems.length} claim(s) CLAUDE.md makes are false\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    process.stderr.write('  Fix the memo, or fix the tree. Do not delete the backticks.\n');
    process.exit(1);
  }

  process.stdout.write(
    `docs:truth: every path and \`pnpm\` script CLAUDE.md names resolves ` +
      `(${new Set(paths).size} paths, ${new Set(dirs).size} directories, ${new Set(named).size} scripts)\n`,
  );
}

main();
