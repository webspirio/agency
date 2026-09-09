import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * CLAUDE.md is prose, and this repo's governing rule says prose is not a control
 * surface. So the prose gets a control surface of its own: every command it
 * tells an agent to run must exist, and every path it names must be on disk.
 *
 * This is SPEC 10's `links:truth` row applied to the one document an agent reads
 * first. The failure it prevents is documented in the source repo it was learned
 * from: a README that instructed a step against a control deleted two phases
 * earlier, green the whole time because nothing checked it.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CLAUDE_MD = read('CLAUDE.md');

describe('CLAUDE.md tells the truth about the commands it names', () => {
  it('names only package scripts that exist', () => {
    const scripts = Object.keys(
      (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts,
    );
    const named = [...CLAUDE_MD.matchAll(/`?pnpm (?:run )?([a-z][a-z:._-]*)/g)]
      .map((m) => m[1])
      .filter((s): s is string => s !== undefined)
      // `pnpm install`, `pnpm add` and `pnpm --filter …` are pnpm's own verbs,
      // not scripts of this workspace.
      .filter((s) => !['install', 'add', 'filter', 'dlx', 'exec'].includes(s));

    expect([...new Set(named)].filter((s) => !scripts.includes(s))).toEqual([]);
  });

  it('names only files and directories that exist', () => {
    const paths = [...CLAUDE_MD.matchAll(/`([a-zA-Z0-9_./-]+\.(?:ts|tsx|mjs|json|md|css|sh))`/g)]
      .map((m) => m[1])
      .filter((p): p is string => p !== undefined)
      // Paths inside a scaffolded mock (`src/app/router.tsx`) exist in the
      // template, not at the repo root; and node_modules paths are runtime.
      .filter((p) => !p.startsWith('src/') && !p.includes('node_modules'));

    const missing = [...new Set(paths)].filter(
      (p) => !existsSync(join(ROOT, p)) && !existsSync(join(ROOT, 'templates', 'mock', p)),
    );
    expect(missing).toEqual([]);
  });

  it('names the five scaffold-owned files, and the template really carries the marker', () => {
    // The list in the prose and the markers in the template are two copies of
    // one fact. This is the assertion that keeps them one fact.
    const claimed = [...CLAUDE_MD.matchAll(/`(src\/[a-zA-Z0-9_./-]+\.(?:tsx?|css))`/g)]
      .map((m) => m[1])
      .filter((p): p is string => p !== undefined);
    expect(claimed.length).toBeGreaterThanOrEqual(4);

    for (const rel of new Set(claimed)) {
      const direct = join(ROOT, 'templates', 'mock', rel);
      const templated = `${direct}.hbs`;
      const file = existsSync(direct) ? direct : templated;
      expect(existsSync(file), `${rel} is named in CLAUDE.md but not in the template`).toBe(true);
      expect(readFileSync(file, 'utf8')).toMatch(/@scaffold-owned/);
    }
  });
});

describe('the hooks CLAUDE.md promises are wired and runnable', () => {
  const settings = JSON.parse(read('.claude/settings.json')) as {
    hooks: Record<string, { hooks: { command: string }[] }[]>;
  };

  it('points every hook command at a file that exists and is executable', () => {
    const commands = Object.values(settings.hooks)
      .flat()
      .flatMap((m) => m.hooks)
      .map((h) => h.command);
    expect(commands.length).toBeGreaterThan(0);

    for (const cmd of commands) {
      for (const m of cmd.matchAll(/"\$CLAUDE_PROJECT_DIR"(\/[^\s"]+)/g)) {
        const rel = m[1]?.slice(1);
        expect(rel).toBeTruthy();
        const abs = join(ROOT, rel as string);
        expect(existsSync(abs), `${rel} is wired in settings.json but absent`).toBe(true);
        // A hook that is not executable fails open and silently: the turn is
        // simply never checked.
        expect((statSync(abs).mode & 0o111) !== 0, `${rel} is not executable`).toBe(true);
      }
    }
  });

  it('runs the fast tier on Stop, which is what CLAUDE.md tells the agent to expect', () => {
    const stop = settings.hooks.Stop?.flatMap((m) => m.hooks).map((h) => h.command) ?? [];
    expect(stop.some((c) => c.includes('stop-gate.mjs'))).toBe(true);
    expect(read('.claude/hooks/stop-gate.mjs')).toMatch(/--tier',\s*'fast'/);
    expect(CLAUDE_MD).toMatch(/Stop hook/);
  });
});

describe('CLAUDE.md states the blind spots rather than only the passes', () => {
  it('says out loud that the fast tier does not build', () => {
    // The whole point of the layer. A document that lists the green commands and
    // omits what they do not cover manufactures exactly the confidence the
    // registry's blindSpot prose exists to prevent.
    expect(CLAUDE_MD).toMatch(/does NOT cover|does not build/i);
    expect(CLAUDE_MD).toMatch(/vite build|@source/);
  });

  it('reproduces the five statuses, none of them collapsed', () => {
    for (const status of ['PASSED', 'FAILED', 'SKIPPED', 'NOT_RUN', 'UNRUNNABLE']) {
      expect(CLAUDE_MD).toContain(status);
    }
  });
});
