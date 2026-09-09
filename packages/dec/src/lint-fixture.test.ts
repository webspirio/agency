import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;

/**
 * The rules live in `oxlint-rules.js`, loaded by `oxlint.base.json` through
 * `jsPlugins`, because oxlint 1.82.0 has no `no-restricted-syntax`. The two
 * files travel together, so the fixture copies the pair.
 *
 * The binary is the workspace's pinned oxlint, not `npx oxlint`: npx resolves
 * from the machine's `_npx` cache and would silently test a different version
 * than the repo ships.
 */
const OXLINT = join(ROOT, 'node_modules', '.bin', 'oxlint');

function lint(source: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lintfix-'));
  cpSync(join(ROOT, 'oxlint.base.json'), join(dir, 'oxlint.base.json'));
  cpSync(join(ROOT, 'oxlint-rules.js'), join(dir, 'oxlint-rules.js'));
  writeFileSync(join(dir, '.oxlintrc.json'), JSON.stringify({ extends: ['./oxlint.base.json'] }));
  writeFileSync(join(dir, 'money.ts'), source);
  try {
    const out = execFileSync(OXLINT, ['--max-warnings=0', '.'], { cwd: dir, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e: unknown) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

describe('money and ordering lint rules', () => {
  it('rejects multiplication on money', () => {
    expect(lint('export const x = (a: number, b: number) => a * b;').code).not.toBe(0);
  });

  it('rejects COMPARISON on money — the measured hole that exits 0 today', () => {
    const r = lint('export const x = (a: {amount: string}, b: {amount: string}) => a.amount > b.amount;');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/lexicographic|dec\.cmp/);
  });

  it('rejects a bare .sort() with no comparator', () => {
    expect(lint('export const x = (xs: string[]) => xs.sort();').code).not.toBe(0);
  });

  it('rejects Math.random for ids', () => {
    expect(lint('export const id = () => Math.random().toString(36);').code).not.toBe(0);
  });

  it('rejects Number(), parseFloat and toFixed', () => {
    expect(lint('export const x = (s: string) => Number(s);').code).not.toBe(0);
    expect(lint('export const x = (s: string) => parseFloat(s);').code).not.toBe(0);
    expect(lint('export const x = (n: number) => n.toFixed(2);').code).not.toBe(0);
  });

  it('allows arithmetic that is not on money — an index bump', () => {
    expect(lint('export const next = (i: number) => i + 1;').code).toBe(0);
  });
});
