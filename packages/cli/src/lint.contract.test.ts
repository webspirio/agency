import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The lint surface is the ONLY enforcement surface Plan A ships, so it gets the
 * same treatment as any other load-bearing module: fixtures that prove each
 * rule fires, fixtures that prove it does NOT fire on code it has no business
 * touching, and a ratchet so the exemption list can only shrink.
 *
 * Everything here runs against the SHIPPED `oxlint.base.json` +
 * `oxlint-rules.js`, copied as a pair into a temp dir — not against a config
 * the test writes for itself, which would let the two drift apart in silence.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OXLINT = join(ROOT, 'node_modules', '.bin', 'oxlint');

type Result = { code: number; out: string };

/**
 * Lint `source` at `path` inside a scratch tree whose config extends the real
 * base. The path matters: the whole scoping design turns on `overrides.files`
 * globs, and a rule that fires everywhere is a different rule from one that
 * fires under `src/domain/`.
 */
function lintAt(path: string, source: string, extraConfig: object = {}): Result {
  const dir = mkdtempSync(join(tmpdir(), 'agency-lint-'));
  cpSync(join(ROOT, 'oxlint.base.json'), join(dir, 'oxlint.base.json'));
  cpSync(join(ROOT, 'oxlint-rules.js'), join(dir, 'oxlint-rules.js'));
  writeFileSync(
    join(dir, '.oxlintrc.json'),
    JSON.stringify({ extends: ['./oxlint.base.json'], ...extraConfig }),
  );
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
  try {
    return { code: 0, out: execFileSync(OXLINT, ['--max-warnings=0', '.'], { cwd: dir, encoding: 'utf8' }) };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Domain code — where money lives, and where every rule is on. */
const lint = (source: string) => lintAt('src/domain/calc.ts', source);

describe('the rules fire on what they were written for', () => {
  it('rejects multiplication and division', () => {
    expect(lint('export const x = (a: number, b: number) => a * b;').code).not.toBe(0);
    expect(lint('export const x = (a: number, b: number) => a / b;').code).not.toBe(0);
  });

  it('rejects relational comparison — the measured hole that exited 0', () => {
    const r = lint('export const x = (a: {amount: string}, b: {amount: string}) => a.amount > b.amount;');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/lexicographic|dec\.cmp/);
  });

  it('rejects Math.random for ids', () => {
    expect(lint('export const id = () => Math.random().toString(36);').code).not.toBe(0);
  });

  it('rejects Number(), parseFloat, parseInt and toFixed', () => {
    expect(lint('export const x = (s: string) => Number(s);').code).not.toBe(0);
    expect(lint('export const x = (s: string) => parseFloat(s);').code).not.toBe(0);
    expect(lint('export const x = (s: string) => parseInt(s, 10);').code).not.toBe(0);
    expect(lint('export const x = (n: number) => n.toFixed(2);').code).not.toBe(0);
  });

  it('rejects a bare .sort()', () => {
    expect(lint('export const x = (xs: string[]) => xs.sort();').code).not.toBe(0);
  });
});

describe('the escapes each rule used to permit', () => {
  // Every case below exited 0 against the first version of these rules. They
  // are the same hazard reached by a different token, which is the only kind of
  // hole a syntactic rule can have.
  it.each([
    ['Number.parseFloat', 'export const x = (s: string) => Number.parseFloat(s);'],
    ['Number.parseInt', 'export const x = (s: string) => Number.parseInt(s, 10);'],
    ['globalThis.Number', 'export const x = (s: string) => globalThis.Number(s);'],
    ['new Number', 'export const x = (s: string) => new Number(s);'],
    ['unary plus', 'export const x = (s: string) => +s;'],
    ['toPrecision', 'export const x = (n: number) => n.toPrecision(4);'],
    ['toSorted', 'export const x = (xs: string[]) => xs.toSorted();'],
    ['sort(undefined)', 'export const x = (xs: string[]) => xs.sort(undefined);'],
    ['computed sort', "export const x = (xs: string[]) => xs['sort']();"],
    ['crypto.randomUUID', 'export const id = () => crypto.randomUUID();'],
    ['crypto.getRandomValues', 'export const id = () => crypto.getRandomValues(new Uint8Array(8));'],
  ])('rejects %s', (_name, source) => {
    expect(lint(source).code).not.toBe(0);
  });
});

describe('the rules stay quiet on code they have no business touching', () => {
  it.each([
    ['an index bump', 'export const next = (i: number) => i + 1;'],
    ['a sort with a real comparator', 'export const x = (xs: number[]) => xs.sort((a, b) => a - b);'],
    ['string concatenation', "export const label = (a: string) => 'x' + a;"],
    ['a seq id', 'export const id = (n: number) => `x-${String(n).padStart(6, "0")}`;'],
  ])('allows %s', (_name, source) => {
    const r = lint(source);
    // Exit code plus "no agency rule is named in the output" — NOT `out === ''`.
    // oxlint's reporter prints a run summary ("Found 0 warnings and 0 errors…")
    // on some hosts and not others: this assertion passed locally and failed on
    // the CI runner, over the same source and the same verdict. A test that
    // pins a reporter's formatting is testing the reporter.
    expect({ code: r.code, fired: /agency\(/.test(r.out) }).toEqual({ code: 0, fired: false });
  });
});

describe('presentation code is scoped, not exempted', () => {
  // The base config ships to EVERY mock. Rules that fire on a sparkline's
  // `(v - lo) / span` make the operator's first experience of the framework a
  // red build on their own chart code — and SPEC 17 names "the operator
  // disables a check row rather than fixing what it caught" as the abandon
  // signal. So pixel maths is allowed where pixels live.
  it('allows pixel arithmetic under src/pages and src/components', () => {
    const svg = 'export const x = (v: number, lo: number, span: number) => (v - lo) / span * 100;';
    expect(lintAt('src/pages/Chart.tsx', svg).code).toBe(0);
    expect(lintAt('src/components/Chart.tsx', svg).code).toBe(0);
  });

  it('allows an integer count comparison under src/pages', () => {
    expect(lintAt('src/pages/List.tsx', 'export const x = (n: number) => n > 0;').code).toBe(0);
  });

  // The exemption is paid for: a page that cannot be caught doing money
  // arithmetic is instead forbidden from importing the money module at all, so
  // the invariant "money is computed in the domain, pages render strings" is
  // enforced from the other side rather than dropped.
  it('forbids importing the money module from presentation code', () => {
    const r = lintAt('src/pages/Total.tsx', "import { mul } from '@agency/dec';\nexport const x = () => mul('1', '2');\n");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/@agency\/dec/);
  });

  it('still catches money arithmetic in the domain and the api layer', () => {
    const bad = 'export const x = (a: number, b: number) => a * b;';
    expect(lintAt('src/domain/calc.ts', bad).code).not.toBe(0);
    expect(lintAt('src/api/routes.ts', bad).code).not.toBe(0);
  });

  it('scopes by a position-independent glob, so a mock nested two levels down inherits it', () => {
    // `overrides.files` resolves relative to the directory of the config that
    // APPLIES to a file, not the one that declares it. A glob written
    // `src/pages/**` silently changes meaning inside `mocks/<slug>/`, which
    // carries its own `.oxlintrc.json`. Anchoring with `**/` is what makes the
    // base config mean the same thing everywhere it is extended.
    const raw = readFileSync(join(ROOT, 'oxlint.base.json'), 'utf8');
    const base = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) as {
      overrides?: { files: string[] }[];
    };
    for (const o of base.overrides ?? []) {
      for (const glob of o.files) expect(glob).toMatch(/^\*\*\//);
    }
  });
});

/**
 * The exemption RATCHET used to live here. It has moved to the registry row
 * `lint:exempt` (`scripts/verify/checks/lint-exempt.mjs`), which is the same
 * algorithm run by a sequential runner instead of by vitest.
 *
 * It moved because it ran `oxlint` over the repo root once per baseline entry
 * while `workspace.contract.test.ts` ran a twelve-thread oxlint over the whole
 * tree in a neighbouring worker. Under that contention oxlint intermittently
 * reported `no-unused-vars` on `packages/mock/src/router.ts:50` — a constant
 * used twenty-six lines below — and each file passed alone. Duplicating a check
 * in two runners does not double the assurance; it doubles the ways it can lie.
 *
 * What is left in this file is fixture-scoped: every `lintAt` call writes ONE
 * file into its own temp directory and lints that directory. Those cannot race,
 * and they are the mutation-tested proof that each rule fires on what it was
 * written for and stays quiet on what it was not.
 */
