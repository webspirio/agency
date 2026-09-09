import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * CLAUDE.md is prose, and this repo's governing rule says prose is not a control
 * surface. So the prose gets a control surface of its own.
 *
 * The bulk of it — every path and every `pnpm <script>` the memo names — is now
 * SPEC 10's `links:truth` idea as a registry row, `docs:truth`. This file keeps
 * the assertions that row cannot make.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CLAUDE_MD = read('CLAUDE.md');

/**
 * "Every command CLAUDE.md names exists, and every path it names is on disk" has
 * moved to the registry row `docs:truth`
 * (`scripts/verify/checks/docs-truth.mjs`). It belongs there for two reasons:
 * the memo is checked by the same runner that checks everything else, and its
 * result now carries a `proves` and a `blindSpot` like every other row — which
 * for a check ABOUT honesty is the part that matters. Its blind spot is written
 * down: existence, not truth.
 *
 * What stays here is what `docs:truth` cannot see — the hooks being wired and
 * executable, and the memo stating its own blind spots rather than only its
 * passes.
 */

describe('the memo and the template agree about the scaffold-owned files', () => {
  it('names them, and the template really carries the marker', () => {
    // The list in the prose and the markers in the template are two copies of
    // one fact. This is the assertion that keeps them one fact. `docs:truth`
    // proves the paths RESOLVE; only this proves they are marked.
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
