#!/usr/bin/env node
/**
 * The drift controls are actually COMPILED, and they actually assert something.
 *
 * A `*.controls.ts` full of `@ts-expect-error` is worth exactly as much as the
 * compiler's attention to it. A controls file outside the tsc program is a file
 * of claims nobody checks — and it fails silently, because the directives it
 * contains are only meaningful to a compiler that opens it.
 *
 * Two claims:
 *  1. every controls file under packages/ appears in `tsc -b --listFiles`;
 *  2. no control is a tautology — `Expect<Equal<X, X>>` asserts nothing, and the
 *     contract lab shipped several.
 *
 *   node scripts/verify/checks/contract-controls.mjs [--root DIR]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const CONTROLS = /\.controls\.ts$/;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (CONTROLS.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * `Equal<A, B>` where A and B are textually identical asserts nothing at all.
 * Returns the offending control names.
 */
function tautologies(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
  const bad = [];
  const visit = (node) => {
    if (
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      node.typeName.text === 'Equal' &&
      node.typeArguments?.length === 2
    ) {
      const [a, b] = node.typeArguments;
      const left = a.getText(source).replace(/\s+/g, '');
      const right = b.getText(source).replace(/\s+/g, '');
      if (left === right) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        bad.push(`${path.basename(file)}:${line + 1}: Equal<${left}, ${right}> is a tautology`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bad;
}

/** Does the file contain at least one directive or assertion worth compiling? */
function assertsSomething(file) {
  const text = readFileSync(file, 'utf8');
  return /@ts-expect-error/.test(text) || /\bExpect</.test(text);
}

function main() {
  const at = process.argv.indexOf('--root');
  const root = at === -1 ? DEFAULT_ROOT : path.resolve(process.argv[at + 1] ?? '.');
  const problems = [];

  const inPackages = walk(path.join(root, 'packages'));
  const inTemplates = walk(path.join(root, 'templates'));
  const all = [...inPackages, ...inTemplates];

  if (all.length === 0) {
    process.stderr.write('contract:controls: no *.controls.ts anywhere — nothing was checked\n');
    process.exit(1);
  }

  // 1. IN THE PROGRAM. Read back from the compiler rather than inferred from a
  //    tsconfig `include`, because `include` is a glob and the program is a fact.
  //
  // MEASURED, and the reason this is not a plain `tsc -b --listFiles`: with every
  // project already up to date, `tsc -b` skips them and prints NO file list at
  // all — so every controls file looks absent and the row reports four false
  // negatives. That is the same stale-tsbuildinfo hazard the `typecheck` row
  // forces around.
  //
  // So: read the list `typecheck` persisted (it already pays for --force), and
  // if anything looks missing, CONFIRM with a forced listing before reporting
  // red. A stale cache can then never produce a false failure.
  const cached = path.join(root, '.verify', 'tsc-files.txt');
  const readList = (text) =>
    new Set(text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('/')));

  let listed = new Set();
  try { listed = readList(readFileSync(cached, 'utf8')); } catch { /* no cache; force below */ }

  let missing = inPackages.filter((f) => !listed.has(f));
  if (missing.length > 0) {
    const tsc = path.join(root, 'node_modules', '.bin', 'tsc');
    const res = spawnSync(tsc, ['-b', '--force', '--listFiles'], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) {
      process.stderr.write(`contract:controls: could not run tsc: ${res.error.message}\n`);
      process.exit(127);
    }
    listed = readList(`${res.stdout ?? ''}`);
    missing = inPackages.filter((f) => !listed.has(f));
  }

  for (const file of missing) {
    problems.push(
      `${path.relative(root, file)} is NOT in the tsc program — every @ts-expect-error in it is unchecked`,
    );
  }

  // 2. The template's controls are compiled only inside a scaffolded mock (the
  //    `build` row does that). Here we can still prove the file exists and sits
  //    where the mock's own tsconfig will pick it up.
  const templateSrc = path.join(root, 'templates', 'mock', 'src');
  for (const file of inTemplates) {
    if (!file.startsWith(templateSrc + path.sep)) {
      problems.push(
        `${path.relative(root, file)} is outside templates/mock/src, so a scaffolded mock's ` +
          `tsconfig (include: ["src"]) will never compile it`,
      );
    }
  }

  // 3. Nothing tautological, and nothing empty.
  for (const file of all) {
    if (!assertsSomething(file)) {
      problems.push(`${path.relative(root, file)} contains no @ts-expect-error and no Expect<> — it asserts nothing`);
    }
    for (const t of tautologies(file)) problems.push(t);
  }

  if (problems.length) {
    process.stderr.write(`contract:controls: FAILED — ${problems.length} problem(s)\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `contract:controls: ${all.length} controls file(s) — ${inPackages.length} in the tsc program, ` +
      `${inTemplates.length} placed where a scaffolded mock compiles them, none tautological\n`,
  );
}

main();
