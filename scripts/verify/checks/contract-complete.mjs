#!/usr/bin/env node
/**
 * Every declared operation has a handler, a `qry` slot, and somewhere that can
 * actually emit each of its declared codes.
 *
 * WHAT THIS ROW DELIBERATELY DOES NOT CHECK, because it would prove nothing new:
 * "no two operations share method+path" and "a literal segment is declared
 * before its :param sibling". MEASURED — `compile()` in packages/mock/src/router.ts
 * already throws on both, as a shadowing error, before a single request is
 * served. A second copy here would be a row that can only ever agree.
 *
 *   node scripts/verify/checks/contract-complete.mjs [--root DIR]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const TRANSIENT = /^verify-/;

const parse = (file) =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);

/** @returns {{keys: string[], codes: Record<string, string[]>}} */
function registryOf(file) {
  const source = parse(file);
  const keys = [];
  /** @type {Record<string, string[]>} */
  const codes = {};
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
        for (const op of literal.properties) {
          if (!ts.isPropertyAssignment(op)) continue;
          if (!ts.isIdentifier(op.name) && !ts.isStringLiteral(op.name)) continue;
          const key = op.name.text;
          keys.push(key);
          codes[key] = [];
          if (ts.isObjectLiteralExpression(op.initializer)) {
            for (const field of op.initializer.properties) {
              if (
                ts.isPropertyAssignment(field) &&
                ts.isIdentifier(field.name) &&
                field.name.text === 'codes' &&
                ts.isArrayLiteralExpression(field.initializer)
              ) {
                for (const el of field.initializer.elements) {
                  if (ts.isStringLiteral(el)) codes[key].push(el.text);
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { keys, codes };
}

/** The members of `interface Io`, and whether each declares a `qry`. */
function ioOf(file) {
  const source = parse(file);
  /** @type {Record<string, string[]>} */
  const members = {};
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'Io') {
      for (const m of node.members) {
        if (!ts.isPropertySignature(m) || !m.name) continue;
        const key = ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : null;
        if (!key) continue;
        const slots = [];
        if (m.type && ts.isTypeLiteralNode(m.type)) {
          for (const s of m.type.members) {
            if (ts.isPropertySignature(s) && s.name && ts.isIdentifier(s.name)) slots.push(s.name.text);
          }
        }
        members[key] = slots;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return members;
}

/** The keys of the handler map returned by `makeHandlers()`. */
function handlersOf(file) {
  const source = parse(file);
  const keys = new Set();
  const visit = (node) => {
    if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
      for (const p of node.expression.properties) {
        if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name) {
          if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) keys.add(p.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}

/** Every string literal anywhere under `dir`, so a code's emitter can be found. */
function literalsUnder(dir, skip) {
  const found = new Set();
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(e.name) || full === skip) continue;
      const source = parse(full);
      const visit = (node) => {
        if (ts.isStringLiteral(node)) found.add(node.text);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk(dir);
  return found;
}

function checkMock(label, dir, problems) {
  const contractFile = path.join(dir, 'src', 'api', 'contract.ts');
  const routesFile = path.join(dir, 'src', 'api', 'routes.ts');
  if (!existsSync(contractFile)) return 0;
  if (!existsSync(routesFile)) {
    problems.push(`${label}: src/api/contract.ts exists but src/api/routes.ts does not`);
    return 0;
  }

  const { keys, codes } = registryOf(contractFile);
  if (keys.length === 0) {
    problems.push(`${label}: the api registry did not parse — no operations found`);
    return 0;
  }

  const io = ioOf(contractFile);
  const handlers = handlersOf(routesFile);
  const emitted = literalsUnder(path.join(dir, 'src'), contractFile);

  for (const key of keys) {
    if (!handlers.has(key)) {
      problems.push(`${label}: operation '${key}' has no handler in src/api/routes.ts`);
    }
    if (!(key in io)) {
      problems.push(`${label}: operation '${key}' has no entry in \`interface Io\``);
    } else if (!io[key].includes('qry')) {
      problems.push(
        `${label}: operation '${key}' declares no \`qry\` slot. Every entry carries one from t=0 ` +
          `(\`Record<string, never>\` for "no query") — retrofitting is all-or-nothing.`,
      );
    }
    for (const code of codes[key] ?? []) {
      if (!emitted.has(code)) {
        problems.push(
          `${label}: '${key}' declares the code '${code}', but that literal appears nowhere in src/ ` +
            `outside the contract — nothing can emit it`,
        );
      }
    }
  }

  for (const key of Object.keys(io)) {
    if (!keys.includes(key)) problems.push(`${label}: \`Io\` declares '${key}', which the registry does not`);
  }
  for (const key of handlers) {
    if (!keys.includes(key) && key !== '__proto__') {
      // A handler for something undeclared is dead code at best.
      if (io[key] !== undefined || keys.includes(key)) continue;
    }
  }
  return keys.length;
}

function main() {
  const at = process.argv.indexOf('--root');
  const root = at === -1 ? DEFAULT_ROOT : path.resolve(process.argv[at + 1] ?? '.');
  const problems = [];
  let operations = 0;
  let checked = 0;

  const templateDir = path.join(root, 'templates', 'mock');
  if (existsSync(path.join(templateDir, 'src', 'api', 'contract.ts'))) {
    operations += checkMock('templates/mock', templateDir, problems);
    checked += 1;
  }
  let slugs = [];
  try {
    slugs = readdirSync(path.join(root, 'mocks'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { /* no mocks yet */ }
  for (const slug of slugs) {
    if (TRANSIENT.test(slug)) continue;
    operations += checkMock(`mocks/${slug}`, path.join(root, 'mocks', slug), problems);
    checked += 1;
  }

  if (checked === 0) {
    process.stderr.write('contract:complete: no contract found — nothing was checked\n');
    process.exit(1);
  }
  if (problems.length) {
    process.stderr.write(`contract:complete: FAILED — ${problems.length} problem(s)\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `contract:complete: ${checked} contract(s), ${operations} operation(s) — each has a handler, a qry ` +
      `slot and a literal site for every declared code\n`,
  );
}

main();
