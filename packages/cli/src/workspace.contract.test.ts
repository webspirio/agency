import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/**
 * The workspace's own contract: the four commands BUILD-PROMPT's "WHAT DONE
 * LOOKS LIKE" runs, asserted from inside the suite that every task already
 * runs.
 *
 * These exist because `pnpm typecheck` shipped red for eight commits while
 * `pnpm test` stayed green — a gate nobody types is not a gate. Per the
 * propagation doctrine a standard survives only as something the scaffolder
 * writes or a check that goes red, and this file is the check.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

type Run = { code: number; out: string };

function run(cmd: string, args: string[]): Run {
  try {
    return { code: 0, out: execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const bin = (name: string) => join(REPO, 'node_modules', '.bin', name);

/** Every file under `dir` whose name matches, as repo-relative paths. */
function filesMatching(dir: string, re: RegExp, skip: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (skip.test(relative(REPO, full))) return [];
    if (e.isDirectory()) return filesMatching(full, re, skip);
    return re.test(e.name) ? [relative(REPO, full)] : [];
  });
}

describe('typecheck is a real project graph', () => {
  it('runs `tsc -b` to completion and exits 0', () => {
    const r = run(bin('tsc'), ['-b']);
    expect(r.out).not.toMatch(/TS5083/); // "Cannot read file tsconfig.json"
    expect(r.out).not.toMatch(/TS6310/); // "may not disable emit" — composite + noEmit
    expect({ code: r.code, out: r.out.slice(0, 4000) }).toEqual({ code: 0, out: '' });
  });

  it('never pulls `reference/` into the program — HARD RULE 7 says it is read-only prior art', () => {
    // A snapshot from another repo cannot compile here: it imports modules that
    // do not exist. If it is in the graph, `tsc -b` can only ever be red, which
    // is how the typecheck row became permanently unrunnable rather than merely
    // failing.
    const r = run(bin('tsc'), ['-b', '--listFiles']);
    const leaked = r.out.split('\n').filter((f) => f.includes('/reference/'));
    expect(leaked).toEqual([]);
  });

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
  it('exits 0 over the whole workspace', () => {
    const r = run(bin('oxlint'), ['--max-warnings=0', 'packages', 'templates']);
    expect({ code: r.code, out: r.out.slice(0, 4000) }).toEqual({ code: 0, out: '' });
  });

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

describe('every test file on disk is collected by exactly one vitest project', () => {
  // Ported from reference/verify/checks/test-glob-parity.mjs. A hand-enumerated
  // include list drops a whole package in silence: the suite reports green
  // having never opened the file.
  it('collects every test file exactly once', () => {
    const skip = /^(node_modules|reference|dist|mocks\/[^/]+\/(node_modules|dist))/;
    const onDisk = [
      ...filesMatching(join(REPO, 'packages'), /\.test\.tsx?$/, skip),
      ...filesMatching(join(REPO, 'mocks'), /\.test\.tsx?$/, skip),
    ];

    const r = run(bin('vitest'), ['list', '--filesOnly']);
    expect(r.code).toBe(0);
    // `vitest list` prefixes each path with its project, e.g. `[node] packages/…`.
    const collected = r.out
      .split('\n')
      .map((l) => /^(?:\[[^\]]+\]\s*)?(\S*\.test\.tsx?)$/.exec(l.trim())?.[1])
      .filter((l): l is string => l !== undefined)
      .map((l) => relative(REPO, l.startsWith('/') ? l : join(REPO, l)));

    // A gap means a red test reports green. An overlap means a jsdom test also
    // runs under `node` (or the reverse) and fails for reasons that have
    // nothing to do with the code — the shape that broke 13 kit tests when the
    // projects were partitioned by file extension instead of by package.
    const seen = new Map<string, number>();
    for (const f of collected) seen.set(f, (seen.get(f) ?? 0) + 1);

    expect({
      uncollected: onDisk.filter((f) => !seen.has(f)),
      collectedTwice: [...seen].flatMap(([f, n]) => (n === 1 ? [] : [`${f} x${n}`])),
      collectedButAbsent: [...seen.keys()].filter((f) => !onDisk.includes(f)),
    }).toEqual({ uncollected: [], collectedTwice: [], collectedButAbsent: [] });
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
