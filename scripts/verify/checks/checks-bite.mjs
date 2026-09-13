#!/usr/bin/env node
/**
 * Every check must be able to go red. This row derives a tree from templates/mock,
 * plants exactly ONE defect, runs one check against it, and requires exit 1 with an
 * expected substring. A check that stays green on its own defect is the artifact this
 * whole layer exists to prevent — packages/dec/golden.json asserted `dec === dec` for
 * 675 cases and was green throughout.
 *
 * Every other row in the registry asserts that something is TRUE when the check
 * passes. This is the only row that establishes the check could ever have failed.
 *
 * Usage:
 *   node scripts/verify/checks/checks-bite.mjs [--only <fixture-id>]
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** Each defect is ONE edit. Two edits and a green no longer names a cause. */
const DEFECTS = {
  'handler-removed': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'routes.ts');
    const src = readFileSync(file, 'utf8');
    const cut = src.replace(/\n {4}getParty: \(c\) => \{[\s\S]*?\n {4}\},\n/, '\n');
    if (cut === src) {
      throw new Error('handler-removed: the getParty handler shape moved; update this defect');
    }
    writeFileSync(file, cut);
  },
  /**
   * The shape intent.md actually measured: one contract parses, a SECOND mock has
   * none. `contract-deleted` alone cannot reproduce it — removing the only contract
   * in the tree leaves `checked === 0`, which the empty-root guard already catches,
   * so the check goes red down a path that has nothing to do with the hole.
   */
  'mock-without-contract': (root) => {
    const pages = path.join(root, 'mocks', 'silent', 'src', 'pages');
    mkdirSync(pages, { recursive: true });
    writeFileSync(
      path.join(pages, 'SilentPage.tsx'),
      "import { httpClient } from '../api/client';\n" +
        'export function SilentPage() {\n' +
        "  void httpClient.get('/parties');\n" +
        '  return null;\n' +
        '}\n',
    );
  },
  'contract-deleted': (root) => {
    rmSync(path.join(root, 'templates', 'mock', 'src', 'api', 'contract.ts'));
  },
  'bare-specifier-contract': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'pages', 'PartiesPage.tsx');
    const src = readFileSync(file, 'utf8');
    const swapped = src.replace("from '../api/contract'", "from '@agency/contracts/api/contract'");
    if (swapped === src) {
      throw new Error('bare-specifier-contract: the contract import moved; update this defect');
    }
    writeFileSync(file, swapped);
  },
  'tautological-control': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'drift.controls.ts');
    writeFileSync(
      file,
      `${readFileSync(file, 'utf8')}\nexport type Tautology = Expect<Equal<{ a: string }, { a: string }>>;\n`,
    );
  },
};

export const FIXTURES = [
  {
    id: 'handler-removed',
    check: 'scripts/verify/checks/contract-complete.mjs',
    expect: 'getParty',
  },
  {
    id: 'tautological-control',
    check: 'scripts/verify/checks/contract-controls.mjs',
    expect: 'tautolog',
  },
  {
    id: 'contract-deleted',
    check: 'scripts/verify/checks/api-bound.mjs',
    expect: 'no src/api/contract.ts',
  },
  {
    id: 'contract-deleted',
    check: 'scripts/verify/checks/contract-complete.mjs',
    expect: 'no src/api/contract.ts',
  },
  {
    id: 'mock-without-contract',
    check: 'scripts/verify/checks/api-bound.mjs',
    expect: 'no src/api/contract.ts',
  },
  {
    id: 'mock-without-contract',
    check: 'scripts/verify/checks/contract-complete.mjs',
    expect: 'no src/api/contract.ts',
  },
  {
    id: 'bare-specifier-contract',
    check: 'scripts/verify/checks/api-bound.mjs',
    expect: 'does not resolve to this mock',
  },
];

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    child.on('close', (code) => resolve({ code, out }));
  });
}

export async function runFixture(fixture, opts = {}) {
  const plant = DEFECTS[fixture.id];
  if (!plant) throw new Error(`checks:bite: unknown defect '${fixture.id}'`);

  const dir = mkdtempSync(
    path.join(tmpdir(), `bite-${fixture.id}-${path.basename(fixture.check, '.mjs')}-`),
  );
  try {
    cpSync(path.join(ROOT, 'templates'), path.join(dir, 'templates'), { recursive: true });
    plant(dir);

    const check = path.resolve(ROOT, opts.check ?? fixture.check);
    const { code, out } = await run(process.execPath, [check, '--root', dir], ROOT);

    if (code === 0) {
      return {
        ok: false,
        report: `${fixture.id}: ${fixture.check} did not go red on a planted defect`,
      };
    }
    if (!out.includes(fixture.expect)) {
      return {
        ok: false,
        report:
          `${fixture.id}: went red, but the output never mentions '${fixture.expect}' — ` +
          `it may be red for an unrelated reason:\n${out}`,
      };
    }
    return {
      ok: true,
      report: `${fixture.id} -> ${path.basename(fixture.check)}: red, and names '${fixture.expect}'`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const at = process.argv.indexOf('--only');
  const only = at === -1 ? null : process.argv[at + 1];
  const fixtures = only ? FIXTURES.filter((f) => f.id === only) : FIXTURES;

  if (fixtures.length === 0) {
    process.stderr.write(`checks:bite: no fixture matches '${only}'\n`);
    process.exit(1);
  }

  const results = await Promise.all(fixtures.map((f) => runFixture(f)));
  for (const r of results) process.stderr.write(`${r.report}\n`);

  const bad = results.filter((r) => !r.ok).length;
  if (bad > 0) {
    process.stderr.write(`checks:bite: ${bad} of ${results.length} check(s) did not bite\n`);
    process.exit(1);
  }
  process.stderr.write(
    `checks:bite: ${results.length} check(s) went red on a planted defect\n`,
  );
}

if (import.meta.filename === process.argv[1]) await main();
