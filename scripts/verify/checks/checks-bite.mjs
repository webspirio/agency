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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
  /**
   * MEASURED 2026-09-13 against the pre-anchor check at eb6259f: it exited 0,
   * reporting "6 operation(s) — each has a handler", on exactly this tree. The
   * decoy's `return {…}` restored a key whose real handler was gone.
   */
  'handler-map-decoy': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'routes.ts');
    const src = readFileSync(file, 'utf8');
    const cut = src.replace(/\n {4}getParty: \(c\) => \{[\s\S]*?\n {4}\},\n/, '\n');
    if (cut === src) throw new Error('handler-map-decoy: the getParty handler shape moved');
    writeFileSync(file, `${cut}\nfunction decoy() { return { getParty: 1, overview: 2 }; }\n`);
  },
  /**
   * `engines`' subject is the INTERPRETER, which a fixture cannot swap — so the
   * floor/runtime mismatch of BUILD-REPORT #8 is planted from the other side: a
   * floor no real node satisfies. The setup above writes a satisfiable floor, so
   * the single edit here is the floor VALUE.
   */
  'floor-above-every-runtime': (root) => {
    const file = path.join(root, 'package.json');
    const src = readFileSync(file, 'utf8');
    const raised = src.replace('">=18"', '">=99"');
    if (raised === src) throw new Error('floor-above-every-runtime: the setup floor moved');
    writeFileSync(file, raised);
  },
  /**
   * docs/BUILD-REPORT.md #4 verbatim: a .d.ts emitted beside the .ts it came from,
   * inside a src/ tree. Planted WITH a sibling, because only the paired form
   * exercises the discriminator the check is built on — a sibling-less orphan.d.ts
   * is green there by design, which is what makes vite-env.d.ts legal.
   */
  'emit-in-src': (root) => {
    const impl = path.join(root, 'templates', 'mock', 'src', 'api', 'contract.ts');
    if (!existsSync(impl)) throw new Error('emit-in-src: contract.ts moved; update this defect');
    writeFileSync(path.join(path.dirname(impl), 'contract.d.ts'), 'export declare const x: number;\n');
  },
  'tautological-control': (root) => {
    const file = path.join(root, 'templates', 'mock', 'src', 'api', 'drift.controls.ts');
    writeFileSync(
      file,
      `${readFileSync(file, 'utf8')}\nexport type Tautology = Expect<Equal<{ a: string }, { a: string }>>;\n`,
    );
  },
};

/**
 * A defect can only be ONE edit if the tree it lands in is already valid for the
 * check under test. A derived tree is templates/ and nothing else, which is a valid
 * subject for the AST rows but not, for instance, for `engines` — that row reads
 * $root/package.json, and a tree without one is already non-zero before anything is
 * planted. A setup makes the tree valid; the defect is still the single edit, and the
 * CONTROL RUN below proves the setup alone is green.
 */
const SETUPS = {
  'floor-above-every-runtime': (root) => {
    writeFileSync(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'bite-engines', private: true, engines: { node: '>=18' } }, null, 2)}\n`,
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
  {
    id: 'handler-map-decoy',
    check: 'scripts/verify/checks/contract-complete.mjs',
    expect: 'getParty',
  },
  {
    id: 'floor-above-every-runtime',
    check: 'scripts/verify/checks/engines.mjs',
    // NOT 'engines: FAILED'. This substring is unique to the exit-1 branch AND proves
    // the PLANTED file is the one that was read — 'engines: FAILED' alone is satisfied
    // by a check that has stopped honouring --root and is reading the repo's own floor
    // under an unsupported interpreter.
    expect: 'package.json engines.node is ">=99"',
  },
  {
    id: 'emit-in-src',
    check: 'scripts/verify/checks/emit-clean.mjs',
    expect: 'templates/mock/src/api/contract.d.ts',
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

/**
 * A check FAILED when it ran and did not succeed. It did not fail when a precondition
 * was absent (SKIPPED) or when it could not start (UNRUNNABLE) — CLAUDE.md's five
 * statuses never collapse into each other, and a fixture that accepts any non-zero
 * exit collapses three of them. `engines` is where it bites: the registry maps its
 * exit 2 to SKIPPED, so without this a fixture would report a bite on a row that
 * checked nothing. Overridable per fixture only for a check that signals FAILED
 * with a different code.
 */
const FAILED_EXIT = 1;

/**
 * Derive a tree, optionally make it valid for the check under test, and return the
 * directory. `realpathSync` because macOS hands back /var/... while a check that
 * resolves its own paths reports /private/var/..., and an expect string built from
 * a path would then never match.
 */
function derive(fixture) {
  const dir = realpathSync(
    mkdtempSync(path.join(tmpdir(), `bite-${fixture.id}-${path.basename(fixture.check, '.mjs')}-`)),
  );
  cpSync(path.join(ROOT, 'templates'), path.join(dir, 'templates'), { recursive: true });
  SETUPS[fixture.id]?.(dir);
  return dir;
}

export async function runFixture(fixture, opts = {}) {
  const plant = DEFECTS[fixture.id];
  if (!plant) throw new Error(`checks:bite: unknown defect '${fixture.id}'`);

  const check = path.resolve(ROOT, opts.check ?? fixture.check);
  const wantCode = fixture.expectCode ?? FAILED_EXIT;

  /* THE CONTROL RUN, and it is the half that makes the other half mean anything.
     Without it a fixture proves only "this check exits non-zero on this tree" — and a
     derived tree can be non-zero for reasons the defect had nothing to do with.
     MEASURED: a templates-only tree already exits 2 from `engines` before anything is
     planted. A red that is not CAUSED by the plant is the same artifact as a test that
     cannot fail, one level further out. */
  const control = derive(fixture);
  try {
    const { code, out } = await run(process.execPath, [check, '--root', control], ROOT);
    if (code !== 0) {
      return {
        ok: false,
        report:
          `${fixture.id} -> ${path.basename(fixture.check)}: UNSOUND FIXTURE — the derived tree ` +
          `is already non-zero (exit ${code}) with NO defect planted, so a red here would not be ` +
          `caused by the defect:\n${out}`,
      };
    }
  } finally {
    rmSync(control, { recursive: true, force: true });
  }

  const dir = derive(fixture);
  try {
    plant(dir);
    const { code, out } = await run(process.execPath, [check, '--root', dir], ROOT);

    if (code === 0) {
      return {
        ok: false,
        report: `${fixture.id}: ${fixture.check} did not go red on a planted defect`,
      };
    }
    if (code !== wantCode) {
      return {
        ok: false,
        report:
          `${fixture.id}: ${fixture.check} exited ${code}, not ${wantCode} — that is not FAILED. ` +
          `A check that SKIPPED (a precondition was absent) or was UNRUNNABLE (it could not start) ` +
          `checked nothing, and counting it as a bite is the status collapse CLAUDE.md forbids:\n${out}`,
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
      report:
        `${fixture.id} -> ${path.basename(fixture.check)}: green with no defect, ` +
        `exit ${code} with one, and names '${fixture.expect}'`,
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
