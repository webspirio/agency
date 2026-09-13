#!/usr/bin/env node
/**
 * Every HTTP call a screen makes names an operation the contract declares, and
 * every declared operation is reached by at least one screen.
 *
 * This is the row that closes the hole the contract lab measured and no TYPE
 * closes: `ParamsOf` erases non-param segments, so renaming '/parties/:id' to
 * '/party/:id' compiles clean. What keeps a rename safe is that `call()` takes
 * an operation KEY and never a path — so this check's real job is to prove no
 * screen went around it.
 *
 * It reads the TYPESCRIPT AST, never a regex, and it anchors on the IMPORTED
 * BINDING: a `call` that is not the one imported from the mock's own contract is
 * not counted, and a screen that renames the import on the way in still is. The
 * contract lab's `bind.ts` used a regex over source and could not do either.
 *
 *   node scripts/verify/checks/api-bound.mjs [--root DIR]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
/** The `build` row scaffolds here and removes it; it is mid-flight, not a mock. */
const TRANSIENT = /^verify-/;
/** Raw transport in a screen is the thing the contract exists to replace. */
const RAW_HTTP = new Set(['get', 'post', 'put', 'patch', 'delete', 'request']);

/** @param {string} dir @param {RegExp} match @param {string[]} out */
function walk(dir, match, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, match, out);
    else if (match.test(e.name)) out.push(full);
  }
  return out;
}

const parse = (file) =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);

/** The keys of the `api = {...} as const` object literal, in declaration order. */
function operationsOf(contractFile) {
  const source = parse(contractFile);
  const keys = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'api' &&
      node.initializer
    ) {
      let literal = node.initializer;
      if (ts.isAsExpression(literal)) literal = literal.expression;
      if (ts.isObjectLiteralExpression(literal)) {
        for (const p of literal.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
            keys.push(p.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}

/**
 * What a screen calls, and how. Returns the operation names reached through the
 * contract binding, plus any raw transport call found in the same file.
 */
function callsIn(file) {
  const source = parse(file);
  /** local name -> true, for identifiers imported from the mock's contract */
  const bound = new Set();
  const named = [];
  const raw = [];

  const collectImports = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text;
      if (/(^|\/)api\/contract$/.test(from) || from.endsWith('/api/contract')) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            const original = (el.propertyName ?? el.name).text;
            if (original === 'call') bound.add(el.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, collectImports);
  };
  collectImports(source);

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && bound.has(callee.text)) {
        // call(http, 'operation', args) — the key is the SECOND argument.
        const key = node.arguments[1];
        if (key && ts.isStringLiteral(key)) named.push(key.text);
        else {
          raw.push(`${path.basename(file)}: call() with a non-literal operation key — unresolvable`);
        }
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        RAW_HTTP.has(callee.name.text) &&
        /httpClient|axios/i.test(callee.expression.getText(source))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        raw.push(`${path.basename(file)}:${line + 1}: ${callee.getText(source)}(...) bypasses the contract`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { named, raw };
}

/**
 * @returns {{parsed: boolean, operations: number}} `parsed` is whether a registry was
 * actually READ here, not whether a directory was visited. The two were the same number
 * until 2026-09-13, when a contract-less mock counted itself as checked and pushed no
 * problem — so a fabricated root with one real contract and one hoisted one exited 0
 * from this check reporting "2 contract(s)".
 */
function checkMock(label, dir, problems) {
  const contractFile = path.join(dir, 'src', 'api', 'contract.ts');
  if (!existsSync(contractFile)) {
    problems.push(
      `${label}: no src/api/contract.ts — every mock owns its registry (CLAUDE.md decision 4); ` +
        `a hoisted or missing contract cannot be bound`,
    );
    return { parsed: false, operations: 0 };
  }

  const declared = operationsOf(contractFile);
  if (declared.length === 0) {
    problems.push(`${label}: src/api/contract.ts declares no operations — the registry did not parse`);
    return { parsed: false, operations: 0 };
  }

  const pagesDir = path.join(dir, 'src', 'pages');
  const screens = walk(pagesDir, /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f));
  if (screens.length === 0) {
    problems.push(`${label}: no screens under src/pages, so no operation can be reached`);
    return { parsed: true, operations: declared.length };
  }

  const reached = new Set();
  for (const screen of screens) {
    const { named, raw } = callsIn(screen);
    for (const key of named) {
      if (!declared.includes(key)) {
        problems.push(`${label}: ${path.basename(screen)} calls '${key}', which the contract does not declare`);
      }
      reached.add(key);
    }
    for (const r of raw) problems.push(`${label}: ${r}`);
  }

  for (const key of declared) {
    if (!reached.has(key)) {
      problems.push(`${label}: operation '${key}' is declared but no screen calls it — a handler written for nothing`);
    }
  }
  return { parsed: true, operations: declared.length };
}

function main() {
  const at = process.argv.indexOf('--root');
  const root = at === -1 ? DEFAULT_ROOT : path.resolve(process.argv[at + 1] ?? '.');
  const problems = [];
  let operations = 0;
  let checked = 0;

  // The DIRECTORY is what makes a mock this row's business; the contract is what it
  // must then have. Guarding on the contract instead is how a mock without one made
  // itself invisible rather than red.
  const templateDir = path.join(root, 'templates', 'mock');
  const mocksDir = path.join(root, 'mocks');
  const targets = existsSync(templateDir) ? [['templates/mock', templateDir]] : [];
  let slugs = [];
  try { slugs = readdirSync(mocksDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* no mocks yet */ }
  for (const slug of slugs) {
    if (TRANSIENT.test(slug)) continue;
    targets.push([`mocks/${slug}`, path.join(mocksDir, slug)]);
  }

  for (const [label, dir] of targets) {
    const { parsed, operations: n } = checkMock(label, dir, problems);
    if (parsed) {
      checked += 1;
      operations += n;
    }
  }

  // Problems FIRST. `checked === 0` is empty-root protection and nothing more; while it
  // was evaluated first it also swallowed the specific diagnosis of a contract-less tree.
  if (problems.length) {
    process.stderr.write(`api:bound: FAILED — ${problems.length} binding problem(s)\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    process.stderr.write('  A screen talks to the API through call(http, \'<operation>\', ...) and nothing else.\n');
    process.exit(1);
  }

  if (checked === 0) {
    process.stderr.write('api:bound: no contract found in templates/mock or mocks/* — nothing was checked\n');
    process.exit(1);
  }

  process.stdout.write(
    `api:bound: ${checked} contract(s), ${operations} operation(s) — every screen call names a declared ` +
      `operation and every operation is reached by a screen\n`,
  );
}

main();
