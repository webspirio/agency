import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * The workspace's own contract — the parts of it that are FACTS ON DISK.
 *
 * The three assertions that used to live here and shelled out to a repo-wide
 * tool (`tsc -b`, `tsc -b --listFiles`, `oxlint packages templates`,
 * `vitest list`) have moved into `scripts/verify/registry.mjs` as the rows
 * `typecheck`, `lint` and `test:parity`. They did not move because they were
 * wrong; they moved because vitest runs files in parallel and this file, plus
 * `lint.contract.test.ts`, each launched a twelve-thread oxlint over the same
 * tree at the same time. The result was an intermittent false `no-unused-vars`
 * on `packages/mock/src/router.ts:50` — a constant demonstrably used twenty-six
 * lines later — that no file could reproduce alone. A flaky red is worse than
 * no gate: it is the fastest route to a gate somebody switches off.
 *
 * The verify runner is sequential, which is why the reference harness this is
 * ported from puts repo-wide commands there and nowhere else.
 *
 * What remains here reads files and asserts their shape. It cannot race.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

describe('the root tsconfig is a solution, not a program', () => {
  it('has a root solution file that references every package', () => {
    const root = JSON.parse(readFileSync(join(REPO, 'tsconfig.json'), 'utf8')) as {
      files?: unknown[];
      references?: { path: string }[];
    };
    // `files: []` is what makes the root a solution rather than a program of
    // its own — without it the default `**/*` glob drags in every stray .ts.
    expect(root.files).toEqual([]);
    const referenced = new Set((root.references ?? []).map((r) => r.path.replace(/^\.\//, '')));
    for (const pkg of readdirSync(join(REPO, 'packages'))) {
      expect(referenced.has(`packages/${pkg}`)).toBe(true);
    }
  });
});

describe('lint covers what it claims to', () => {
  it('is given explicit paths, so a frozen mock can be removed from the graph', () => {
    // SPEC 9.5: freeze must eject a mock from tsconfig references, the oxlint
    // include and the vitest projects. A blocklist-only config has nothing to
    // eject FROM — the frozen source stays linted while the freeze guard
    // forbids editing it, which is the deadlock that section exists to name.
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
      scripts?: { lint?: string };
    };
    const lint = pkg.scripts?.lint ?? '';
    expect(lint).toMatch(/oxlint .*--max-warnings=0 .+\S/);
    expect(lint.trim()).not.toMatch(/--max-warnings=0$/);
  });
});

describe('the workspace manifest carries no unresolved placeholder', () => {
  it('resolves allowBuilds to a boolean', () => {
    const yaml = readFileSync(join(REPO, 'pnpm-workspace.yaml'), 'utf8');
    expect(yaml).not.toMatch(/set this to/);
    for (const line of yaml.split('\n')) {
      const m = /^\s{2,}(\S+):\s*(.+)$/.exec(line);
      if (m && !line.trimStart().startsWith('-') && m[1] !== 'packages') {
        expect(m[2]).toMatch(/^(true|false)$/);
      }
    }
  });
});
