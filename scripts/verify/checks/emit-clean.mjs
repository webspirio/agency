#!/usr/bin/env node
/**
 * No build output inside a source tree.
 *
 * docs/BUILD-REPORT.md, open defect #4: a scaffolded mock emitted eleven `.d.ts`
 * files and a `tsconfig.tsbuildinfo` into `mocks/<slug>/src/` and nothing was red
 * about it. Ranked #4 there and listed under "what a check should have caught
 * and didn't" as the would-be row `no-emit-in-src`. This is that row.
 *
 * Emit is identified STRUCTURALLY, never by gitignore state: a freshly
 * scaffolded mock is untracked in its entirety, so "untracked" would flag every
 * one of its hand-written files, and a check with that false-positive rate gets
 * switched off in a week. The discriminator is the sibling. `a.d.ts` next to
 * `a.ts` can only have come out of `tsc`; `vite-env.d.ts` and `testing.d.ts` have
 * no sibling implementation and are declarations someone wrote on purpose.
 *
 *   node scripts/verify/checks/emit-clean.mjs [--root DIR]
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** Never descend into these, wherever they appear. */
const PRUNE = new Set(['node_modules', 'dist', '.git', 'reference', 'coverage', '.verify']);

/** Always emit, wherever it lands under a src/. */
const ALWAYS_EMIT = /\.tsbuildinfo$/;

/** Emit only when the matching implementation sits beside it. */
const PAIRED_EMIT = [
  { re: /^(.*)\.d\.ts$/, from: ['.ts', '.tsx'] },
  { re: /^(.*)\.d\.ts\.map$/, from: ['.ts', '.tsx'] },
  { re: /^(.*)\.js\.map$/, from: ['.ts', '.tsx'] },
  { re: /^(.*)\.js$/, from: ['.ts', '.tsx'] },
  { re: /^(.*)\.jsx$/, from: ['.tsx'] },
];

/**
 * @param {string} dir
 * @param {boolean} inSrc  true once any ancestor directory is named `src`
 * @param {string[]} out
 * @returns {void}
 */
function walk(dir, inSrc, out) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const names = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  for (const e of entries) {
    if (PRUNE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, inSrc || e.name === 'src', out);
      continue;
    }
    if (!inSrc || !e.isFile()) continue;
    if (ALWAYS_EMIT.test(e.name)) {
      out.push(full);
      continue;
    }
    for (const { re, from } of PAIRED_EMIT) {
      const stem = re.exec(e.name)?.[1];
      if (stem === undefined) continue;
      if (from.some((ext) => names.has(`${stem}${ext}`))) out.push(full);
      break;
    }
  }
}

function main() {
  const at = process.argv.indexOf('--root');
  const root = at === -1 ? DEFAULT_ROOT : path.resolve(process.argv[at + 1] ?? '.');

  /** @type {string[]} */
  const found = [];
  for (const top of ['packages', 'templates', 'mocks', 'src']) {
    walk(path.join(root, top), top === 'src', found);
  }
  const rel = found.map((f) => path.relative(root, f)).sort();

  if (rel.length) {
    process.stderr.write(
      `emit:clean: FAILED — ${rel.length} build artefact(s) inside a src/ tree\n` +
        `${rel.map((f) => `  ${f}\n`).join('')}` +
        `  Emit belongs in outDir (node_modules/.cache/tsc/*) or dist/, never beside the source it\n` +
        `  was emitted from. Delete these; if one is hand-written, give it a name no compiler would\n` +
        `  produce (there is no sibling implementation for vite-env.d.ts, which is why it is fine).\n`,
    );
    process.exit(1);
  }

  process.stdout.write('emit:clean: no .d.ts, .js, .map or .tsbuildinfo emitted inside any src/\n');
}

main();
