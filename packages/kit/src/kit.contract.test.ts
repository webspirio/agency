import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// NOT `new URL('.', import.meta.url).pathname`: jsdom replaces the global URL with an
// implementation that resolves a `file:` base against `http://localhost:3000/`, so that
// expression yields '/packages/kit/src' and every assertion below ENOENTs into a
// vacuous pass-or-crash. import.meta.dirname is the absolute path, in both environments.
const SRC = import.meta.dirname;

const files = (): string[] =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.tsx'));

describe('kit extraction contract', () => {
  it('carries the measured file count', () => {
    const nonTest = files().filter((f) => !f.endsWith('.test.tsx'));
    expect(nonTest.length).toBeGreaterThanOrEqual(52);
  });

  it('ships the three page templates', () => {
    for (const t of ['dashboard-page', 'document-page', 'list-page']) {
      expect(existsSync(join(SRC, 'templates', `${t}.tsx`))).toBe(true);
    }
  });

  it('imports nothing above shared/ — the property that makes the lift mechanical', () => {
    const offenders = files().filter((f) =>
      /@\/(entities|features|widgets|pages|app)\//.test(readFileSync(join(SRC, f), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('has no @/shared alias left after the rewrite', () => {
    const offenders = files().filter((f) => /@\/shared\//.test(readFileSync(join(SRC, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('records where it came from', () => {
    const p = readFileSync(join(SRC, '..', 'PROVENANCE.md'), 'utf8');
    expect(p).toMatch(/yagoda-starter/);
    expect(p).toMatch(/[0-9a-f]{7,40}/); // a commit sha
  });
});
