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

/**
 * @returns {{keys: string[], codes: Record<string, string[]>, unreadable: string[]}}
 *
 * THE INITIALIZER IS A CALL: `op<Req, Res>()({ … })`. The reader this replaced
 * guarded on `isObjectLiteralExpression`, which is FALSE here, so the codes loop
 * never ran, `codes[key]` stayed empty and the reachability clause reported success
 * having read no codes at all — measured green with an unemittable code declared.
 * An entry this cannot read is now reported, never skipped: silence there is the
 * whole defect.
 */
function registryOf(file) {
  const source = parse(file);
  const keys = [];
  /** @type {Record<string, string[]>} */
  const codes = {};
  const unreadable = [];
  const unreadableCodes = [];
  const badStatus = [];
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

          let entry = op.initializer;
          while (ts.isCallExpression(entry)) entry = entry.arguments[0] ?? entry.expression;
          if (ts.isAsExpression(entry)) entry = entry.expression;
          if (!ts.isObjectLiteralExpression(entry)) {
            unreadable.push(key);
            continue;
          }
          for (const field of entry.properties) {
            if (
              !ts.isPropertyAssignment(field) ||
              !ts.isIdentifier(field.name) ||
              field.name.text !== 'codes'
            ) {
              continue;
            }
            /* EVERY WAY OF NOT READING IT IS REPORTED. Gating on the happy shape and
               falling through was the same silence the entry guard above was added to
               remove, one level deeper: a `codes` hoisted into a const read as ZERO
               codes and the row still printed "a literal site for every declared
               code". Found by the Phase 2 review. */
            if (!ts.isObjectLiteralExpression(field.initializer)) {
              unreadableCodes.push(key);
              continue;
            }
            /* The code names are property NAMES now, not string-literal array
               elements. A port that kept `isStringLiteral` on the name would find
               ZERO codes and be exactly as silent. */
            for (const c of field.initializer.properties) {
              if (!ts.isPropertyAssignment(c) || (!ts.isIdentifier(c.name) && !ts.isStringLiteral(c.name))) {
                // A spread, a shorthand, a getter — anything this cannot name.
                unreadableCodes.push(key);
                continue;
              }
              codes[key].push(c.name.text);
              /* THE STATUS VALUE, not only the name. A 2xx here is RESOLVED by the
                 adapter — axios's default validateStatus accepts it — so the error
                 envelope reaches the screen typed as the declared response, with every
                 field undefined and nothing red. The type refuses it in packages/ and
                 in templates/; this covers a mocks/<slug> the root solution never
                 compiles. */
              if (!ts.isNumericLiteral(c.initializer)) {
                unreadableCodes.push(key);
                continue;
              }
              const status = Number(c.initializer.text);
              if (status < 400 || status > 599) {
                badStatus.push(`'${key}' declares ${c.name.text}: ${status}`);
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { keys, codes, unreadable, unreadableCodes, badStatus };
}

/**
 * The keys of the handler map, ANCHORED on `satisfies HandlersOf<…>`.
 *
 * It harvested every `return {…}` in the file until 2026-09-13, so an unrelated
 * helper returning `{ getParty: 1 }` restored a key whose real handler was gone and
 * turned a red green.
 *
 * Anchoring on the satisfies clause rather than on the `return` also resolves the
 * `const h = {…} satisfies HandlersOf<…>; return h;` spelling for free, and no anchor is
 * a LOUD failure rather than an empty key set.
 *
 * The anchor ALONE is not enough, and believing it was cost a green: an annotation
 * REPLACING `satisfies` leaves no anchor and is caught, but an annotation ADDED beside
 * it kept `anchors` at 1 and passed — while doing the same damage, because either
 * spelling widens the map, collapses `H` into the declared type and silently stops the
 * exactness check at `toRoutes` from comparing anything. So the annotation is detected
 * directly, independently of the anchor count.
 *
 * @returns {{keys: Set<string>, anchors: number}}
 */
function handlersOf(file) {
  const source = parse(file);
  const keys = new Set();
  let anchors = 0;
  const annotated = [];
  const visit = (node) => {
    /* A return-type ANNOTATION of HandlersOf<…> on a function, whether or not a
       `satisfies` clause is also present. Both spellings widen the factory's return to
       the declared type, `H` collapses into it, and the exactness check at toRoutes
       stops comparing anything — silently. The redundant annotation-AND-satisfies form
       kept `anchors` at 1 and was green until 2026-09-13. */
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
      node.type &&
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === 'HandlersOf'
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      annotated.push(line + 1);
    }
    if (
      ts.isSatisfiesExpression(node) &&
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === 'HandlersOf' &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      anchors += 1;
      for (const p of node.expression.properties) {
        if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name) {
          if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) keys.add(p.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { keys, anchors, annotated };
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

/**
 * @returns {{parsed: boolean, operations: number}} `parsed` is whether a registry was
 * actually READ here, not whether a directory was visited — see the same note in
 * api-bound.mjs. A contract-less mock counted itself as checked and pushed no problem.
 */
function checkMock(label, dir, problems) {
  const contractFile = path.join(dir, 'src', 'api', 'contract.ts');
  const routesFile = path.join(dir, 'src', 'api', 'routes.ts');
  if (!existsSync(contractFile)) {
    problems.push(
      `${label}: no src/api/contract.ts — every mock owns its registry (CLAUDE.md decision 4); ` +
        `a hoisted or missing contract cannot be bound`,
    );
    return { parsed: false, operations: 0 };
  }
  if (!existsSync(routesFile)) {
    problems.push(`${label}: src/api/contract.ts exists but src/api/routes.ts does not`);
    return { parsed: false, operations: 0 };
  }

  const { keys, codes, unreadable, unreadableCodes, badStatus } = registryOf(contractFile);
  if (keys.length === 0) {
    problems.push(`${label}: the api registry did not parse — no operations found`);
    return { parsed: false, operations: 0 };
  }
  for (const key of unreadable) {
    problems.push(
      `${label}: operation '${key}' has an initializer this check cannot read, so its codes were ` +
        `never examined — an entry is \`op<Req, Res>()({ … })\` or a plain object literal`,
    );
  }
  for (const bad of badStatus) {
    problems.push(
      `${label}: ${bad}, which is not a refusal status. A 2xx there makes the adapter RETURN the ` +
        `error envelope as a SUCCESS — axios's default validateStatus accepts it — so the screen ` +
        `receives the envelope typed as the operation's declared response.`,
    );
  }
  for (const key of new Set(unreadableCodes)) {
    problems.push(
      `${label}: operation '${key}' declares \`codes\` in a form this check cannot read — it is ` +
        `not an object literal of plain \`CODE: status\` entries, so NO code of that operation was ` +
        `examined. Write the object inline; a hoisted const or a spread reads as zero codes.`,
    );
  }
  const { keys: handlers, anchors, annotated } = handlersOf(routesFile);
  for (const line of annotated) {
    problems.push(
      `${label}: src/api/routes.ts:${line} gives the handler factory a return-type annotation ` +
        `of HandlersOf<…>. That widens the map: H collapses into the declared type and the ` +
        `exactness check at toRoutes stops comparing anything, silently. End the literal in ` +
        `\`satisfies HandlersOf<…>\` and give the function no return type.`,
    );
  }
  if (anchors === 0) {
    problems.push(
      `${label}: src/api/routes.ts contains no handler map — nothing in it ends in ` +
        `\`satisfies HandlersOf<…>\`. An annotated factory widens the map, so the exactness ` +
        `check at toRoutes stops comparing anything, silently.`,
    );
  }
  const emitted = literalsUnder(path.join(dir, 'src'), contractFile);

  for (const key of keys) {
    if (!handlers.has(key)) {
      problems.push(`${label}: operation '${key}' has no handler in src/api/routes.ts`);
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

  /* THE REVERSE DIRECTION — a handler for an operation the registry does not declare —
     is NOT checked here, and was not checked by the loop that used to sit at this line
     either: its entire body was `continue`, under a comment describing a check. It is
     held by `toRoutes`, which throws "handler '<k>' names no operation in the registry",
     and which fires for every construction including the spread and the cast that tsc's
     excess-property check does not see. */
  return { parsed: true, operations: keys.length };
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
  const targets = existsSync(templateDir) ? [['templates/mock', templateDir]] : [];
  let slugs = [];
  try {
    slugs = readdirSync(path.join(root, 'mocks'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { /* no mocks yet */ }
  for (const slug of slugs) {
    if (TRANSIENT.test(slug)) continue;
    targets.push([`mocks/${slug}`, path.join(root, 'mocks', slug)]);
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
    process.stderr.write(`contract:complete: FAILED — ${problems.length} problem(s)\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    process.exit(1);
  }
  if (checked === 0) {
    process.stderr.write('contract:complete: no contract found — nothing was checked\n');
    process.exit(1);
  }
  process.stdout.write(
    `contract:complete: ${checked} contract(s), ${operations} operation(s) — each has a handler and ` +
      `a literal site for every declared code\n`,
  );
}

main();
