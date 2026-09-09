import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The verify harness, tested for the property that makes it worth having: five
 * statuses that never collapse into each other.
 *
 * "lint FAILED" when the linter was merely absent from PATH asserts something
 * about the code that was never tested. That is the failure this layer exists
 * to remove, so it is the failure the tests have to be able to produce.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RUN = join(ROOT, 'scripts', 'verify', 'run.mjs');

type Row = {
  id: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'NOT_RUN' | 'UNRUNNABLE';
  blocking: boolean;
  proves: string;
  blindSpot: string;
};
type Report = { ok: boolean; tier: string; noSkip: boolean; scope: { only: string[] | null }; checks: Row[] };

function verify(args: string[], env: Record<string, string> = {}): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [RUN, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, ...env },
      }),
    };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const asReport = (out: string): Report => JSON.parse(out) as Report;

describe('the registry is data, and every row carries what it does not prove', () => {
  it('gives every check an id, a tier, a command, proves and blindSpot', async () => {
    const { CHECKS } = (await import(join(ROOT, 'scripts', 'verify', 'registry.mjs'))) as {
      CHECKS: { id: string; tier: string; cmd: string; proves: string; blindSpot: string }[];
    };
    expect(CHECKS.length).toBeGreaterThan(0);
    for (const c of CHECKS) {
      expect(c.id).toBeTruthy();
      expect(['fast', 'full']).toContain(c.tier);
      expect(c.cmd).toBeTruthy();
      // `proves` must be falsifiable by this exact command failing, and
      // `blindSpot` must not be written broader than the command establishes.
      // Length is a crude proxy, but an empty string is decoration by any measure.
      expect(c.proves.length).toBeGreaterThan(30);
      expect(c.blindSpot.length).toBeGreaterThan(30);
    }
  });

  it('has no duplicate ids', async () => {
    const { CHECKS } = (await import(join(ROOT, 'scripts', 'verify', 'registry.mjs'))) as {
      CHECKS: { id: string }[];
    };
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the five statuses never collapse', () => {
  it('reports UNRUNNABLE, not FAILED, when the command cannot start', () => {
    // A renamed script exiting 127 is not evidence about the code. Calling it
    // FAILED is a claim about something that never ran.
    const r = verify(['--json', '--only', 'selftest:unrunnable'], { AGENCY_VERIFY_SELFTEST: '1' });
    const row = asReport(r.out).checks.find((c) => c.id === 'selftest:unrunnable');
    expect(row?.status).toBe('UNRUNNABLE');
    expect(row?.blocking).toBe(true);
  });

  it('reports FAILED when the command runs and exits non-zero', () => {
    const r = verify(['--json', '--only', 'selftest:fail'], { AGENCY_VERIFY_SELFTEST: '1' });
    expect(asReport(r.out).checks[0]?.status).toBe('FAILED');
    expect(r.code).toBe(1);
  });

  it('reports SKIPPED for an absent precondition, and does not block by default', () => {
    const r = verify(['--json', '--only', 'selftest:skipped'], { AGENCY_VERIFY_SELFTEST: '1' });
    const row = asReport(r.out).checks[0];
    expect(row?.status).toBe('SKIPPED');
    expect(row?.blocking).toBe(false);
    expect(r.code).toBe(0);
  });

  it('makes a SKIPPED row blocking under --no-skip, which is the CI form', () => {
    const r = verify(['--json', '--no-skip', '--only', 'selftest:skipped'], { AGENCY_VERIFY_SELFTEST: '1' });
    expect(asReport(r.out).checks[0]?.blocking).toBe(true);
    expect(r.code).toBe(1);
  });

  it('does not relabel a genuine FAILED as UNRUNNABLE because the output mentions a missing module', () => {
    // The "could not load its entry point" pattern was matched against stdout AND
    // stderr together. A vitest run whose test fails on a bad import prints
    // `Cannot find module './missing'` on stdout — so a real red was reported as
    // UNRUNNABLE, a status that asserts nothing was tested. UNRUNNABLE is the
    // quieter direction to be wrong in, which is what makes it the worse one.
    const r = verify(['--json', '--only', 'selftest:failedwithloadmessage'], {
      AGENCY_VERIFY_SELFTEST: '1',
    });
    const row = asReport(r.out).checks[0];
    expect(row?.status).toBe('FAILED');
    expect(row?.blocking).toBe(true);
  });

  it('reports NOT_RUN for a check whose dependency did not pass', () => {
    // NOT_RUN is not FAILED: nothing was learned about this check's subject.
    const r = verify(['--json', '--only', 'selftest:fail,selftest:after'], { AGENCY_VERIFY_SELFTEST: '1' });
    const row = asReport(r.out).checks.find((c) => c.id === 'selftest:after');
    expect(row?.status).toBe('NOT_RUN');
    expect(row?.blocking).toBe(true);
  });
});

describe('a narrow green cannot be quoted as a wide one', () => {
  it('records the scope alongside the verdict', () => {
    const r = verify(['--json', '--only', 'selftest:pass'], { AGENCY_VERIFY_SELFTEST: '1' });
    const report = asReport(r.out);
    expect(report.scope.only).toEqual(['selftest:pass']);
    expect(report.ok).toBe(true);
  });

  it('refuses to report a green when no check was selected', () => {
    const r = verify(['--json', '--tier', 'fast', '--only', '']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/refusing to report a green|no checks selected/i);
  });

  it('rejects an unknown flag instead of silently ignoring it', () => {
    // A typo in `--no-skip` that quietly disabled it would be invisible for as
    // long as nobody looked.
    const r = verify(['--no-skipp']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/unknown flag/i);
  });

  it('rejects a value on a boolean flag', () => {
    // A templated `--no-skip=${CI}` with CI=false was accepted with the value
    // ignored, turning the gate into `exit 0`.
    const r = verify(['--no-skip=false']);
    expect(r.code).not.toBe(0);
  });
});

describe('the blind-spot footer prints on GREEN as well as red', () => {
  it('says what a passing run still does not prove', () => {
    // A table of passes without its blind spots is exactly the false-confidence
    // artifact this layer exists to remove.
    const r = verify(['--only', 'selftest:pass'], { AGENCY_VERIFY_SELFTEST: '1', NO_COLOR: '1' });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/does NOT prove/i);
    expect(r.out).toMatch(/selftest:pass/);
  });
});

describe('the registry rows describe checks that exist', () => {
  it('names only scripts and package scripts that are really there', async () => {
    const { CHECKS } = (await import(join(ROOT, 'scripts', 'verify', 'registry.mjs'))) as {
      CHECKS: { id: string; cmd: string }[];
    };
    const scripts = Object.keys(
      (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> })
        .scripts,
    );
    for (const c of CHECKS) {
      if (c.id.startsWith('selftest:')) continue;
      const m = /^pnpm (?:run )?([a-z:._-]+)/.exec(c.cmd);
      if (m?.[1]) expect(scripts).toContain(m[1]);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The rows SPEC 10 names, and the individual check scripts behind them.
 *
 * Every check script takes `--root DIR` so it can be exercised against a
 * scratch tree. That is not a convenience: the assertions these replace shelled
 * out to a repo-wide 12-thread oxlint and a repo-wide `tsc -b` from inside
 * vitest, three files at a time, and produced a false `no-unused-vars` on
 * packages/mock/src/router.ts:50 that no single file could reproduce. A flaky
 * red is worse than no gate. Repo-wide commands now live in the registry, where
 * the runner is sequential; what stays here is fixture-scoped and cannot race.
 * ──────────────────────────────────────────────────────────────────────────── */

const CHECKS_DIR = join(ROOT, 'scripts', 'verify', 'checks');

function check(file: string, args: string[]): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [join(CHECKS_DIR, file), ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
      }),
    };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'agency-verify-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return dir;
}

describe('the registry carries the rows the enforcement design names', () => {
  const load = async () =>
    (await import(join(ROOT, 'scripts', 'verify', 'registry.mjs'))) as {
      CHECKS: { id: string; tier: string; cmd: string }[];
    };

  it('declares every row, in the tier SPEC 10 puts it in', async () => {
    const want: Record<string, string> = {
      lint: 'fast',
      typecheck: 'fast',
      test: 'fast',
      'lint:exempt': 'fast',
      'docs:truth': 'fast',
      'memo:drift': 'fast',
      'emit:clean': 'fast',
      engines: 'fast',
      'test:parity': 'fast',
      'template:render': 'full',
      build: 'full',
    };
    const { CHECKS } = await load();
    const got = Object.fromEntries(
      CHECKS.filter((c) => c.id in want).map((c) => [c.id, c.tier]),
    );
    expect(got).toEqual(want);
  });

  it('forces the typecheck rather than trusting a buildinfo', () => {
    // docs/BUILD-REPORT.md, open defect #5: incremental `tsc -b` returned exit 0
    // over a tree that `tsc -b --force` rejected with three errors, and the
    // contract test written to catch exactly that inherited the blind spot.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toMatch(/\btsc\b.*--force/);
  });
});

describe('emit:clean — build output never lives in a source tree', () => {
  // docs/BUILD-REPORT.md, open defect #4: a generated mock emitted eleven .d.ts
  // files and a tsconfig.tsbuildinfo into `mocks/<slug>/src/`. Nothing failed.
  it('passes on a source tree that holds only sources', () => {
    const dir = scratch({ 'packages/p/src/a.ts': 'export const a = 1;\n' });
    expect(check('emit-clean.mjs', ['--root', dir])).toEqual({ code: 0, out: expect.any(String) });
  });

  it('fails on a .d.ts emitted beside the .ts it was emitted from', () => {
    const dir = scratch({
      'packages/p/src/a.ts': 'export const a = 1;\n',
      'packages/p/src/a.d.ts': 'export declare const a: number;\n',
    });
    const r = check('emit-clean.mjs', ['--root', dir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/a\.d\.ts/);
  });

  it('fails on a tsbuildinfo inside src/', () => {
    const dir = scratch({
      'packages/p/src/a.ts': 'export const a = 1;\n',
      'packages/p/src/tsconfig.tsbuildinfo': '{}',
    });
    expect(check('emit-clean.mjs', ['--root', dir]).code).not.toBe(0);
  });

  it('leaves a hand-written ambient declaration alone', () => {
    // `vite-env.d.ts` and `testing.d.ts` have no sibling implementation, so they
    // cannot be emit. A check that flagged them would be deleted within a week.
    const dir = scratch({
      'packages/p/src/a.ts': 'export const a = 1;\n',
      'packages/p/src/vite-env.d.ts': '/// <reference types="vite/client" />\n',
    });
    expect(check('emit-clean.mjs', ['--root', dir]).code).toBe(0);
  });
});

describe('docs:truth — every path and script the memo names exists', () => {
  const memo = (body: string) => ({
    'CLAUDE.md': body,
    'package.json': JSON.stringify({ scripts: { verify: 'x', test: 'y' } }),
  });

  it('passes when the memo names only real things', () => {
    const dir = scratch({ ...memo('run `pnpm verify`, see `real.md`\n'), 'real.md': '' });
    expect(check('docs-truth.mjs', ['--root', dir]).code).toBe(0);
  });

  it('fails on a path the memo names that is not on disk', () => {
    const dir = scratch(memo('see `docs/ghost.md` for details\n'));
    const r = check('docs-truth.mjs', ['--root', dir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/ghost\.md/);
  });

  it('fails on a package script the memo names that does not exist', () => {
    const dir = scratch(memo('run `pnpm nosuchscript` first\n'));
    const r = check('docs-truth.mjs', ['--root', dir]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/nosuchscript/);
  });
});

describe('memo:drift — the memo table is generated, never written', () => {
  it('agrees with the registry as committed', () => {
    expect(check('memo-drift.mjs', []).code).toBe(0);
  });

  it('fails, naming the first differing line, when the table is edited by hand', () => {
    const rendered = check('memo-drift.mjs', ['--print']);
    expect(rendered.code).toBe(0);
    const dir = scratch({
      'CLAUDE.md': `# x\n\n${rendered.out.replace(/\| fast \|/, '| slow |')}\n`,
    });
    const r = check('memo-drift.mjs', ['--memo', join(dir, 'CLAUDE.md')]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/registry/i);
  });

  it('fails when the markers are missing entirely', () => {
    const dir = scratch({ 'CLAUDE.md': '# no table here\n' });
    const r = check('memo-drift.mjs', ['--memo', join(dir, 'CLAUDE.md')]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/marker/i);
  });

  it('checksums the RAW proves/blindSpot strings, not the rendered cells', () => {
    // cell() collapses whitespace, so two different registry strings can render
    // to one identical table cell. Without the checksum the "byte-identical"
    // claim would hold of the table while the registry had changed underneath.
    expect(check('memo-drift.mjs', ['--print']).out).toMatch(/registry-checksum: [0-9a-f]{32}/);
  });
});

describe('engines — the runtime under the checks is the declared one', () => {
  const pkg = (engines: unknown) => JSON.stringify({ name: 'x', engines });

  it('passes when the running major satisfies the floor', () => {
    const dir = scratch({ 'package.json': pkg({ node: '>=24' }) });
    expect(check('engines.mjs', ['--root', dir, '--node', 'v24.21.0']).code).toBe(0);
  });

  it('FAILS — not skips — when the running major is below the floor', () => {
    // docs/BUILD-REPORT.md, open defect #8: the day-4 gate ran on node 22 while
    // engines demanded >= 24, and nothing was red about it.
    const dir = scratch({ 'package.json': pkg({ node: '>=24' }) });
    const r = check('engines.mjs', ['--root', dir, '--node', 'v22.23.1']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/22.*24|24.*22/s);
  });

  it('exits 2 — the SKIPPED signal — when no engines floor is declared at all', () => {
    // Nothing to compare against is not "the runtime is fine". Silence here is
    // the exact shape of a dead check reporting green.
    const dir = scratch({ 'package.json': pkg(undefined) });
    expect(check('engines.mjs', ['--root', dir, '--node', 'v24.0.0']).code).toBe(2);
  });

  it('exits 2 when the declared range is a shape it cannot evaluate', () => {
    const dir = scratch({ 'package.json': pkg({ node: '^18 || ^20 || >=22 <25' }) });
    expect(check('engines.mjs', ['--root', dir, '--node', 'v24.0.0']).code).toBe(2);
  });
});

describe('the report is content-addressed, so a green can be reused honestly', () => {
  it('records a sourceHash over the files that can change what a check concludes', () => {
    const r = verify(['--json', '--only', 'selftest:pass'], { AGENCY_VERIFY_SELFTEST: '1' });
    const report = JSON.parse(r.out) as { sourceHash: string; hashedFileCount: number };
    expect(report.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(report.hashedFileCount).toBeGreaterThan(50);
  });

  it('hashes CLAUDE.md, which is the entire input to memo:drift', async () => {
    // Leaving it out meant a hand-edited memo did not change the hash, so
    // --reuse-if-fresh served a cached green and the one check whose whole job
    // is catching that drift could never run.
    const { hashedFiles } = (await import(join(ROOT, 'scripts', 'verify', 'hash.mjs'))) as {
      hashedFiles: (root: string) => string[];
    };
    expect(hashedFiles(ROOT)).toContain('CLAUDE.md');
  });

  it('does not reuse a narrow green as a wide verdict', async () => {
    const { reportCovers } = (await import(join(ROOT, 'scripts', 'verify', 'hash.mjs'))) as {
      reportCovers: (stored: unknown, want: unknown) => boolean;
    };
    const stored = { schema: 1, sourceHash: 'h', ok: true, tier: 'fast', noSkip: false, scope: { only: null, afterDepsFullyEvaluated: true } };
    expect(reportCovers(stored, { hash: 'h', tier: 'fast', noSkip: false })).toBe(true);
    // a fast green says nothing about full
    expect(reportCovers(stored, { hash: 'h', tier: 'full', noSkip: false })).toBe(false);
    // a green that tolerated skips cannot satisfy a request that does not
    expect(reportCovers(stored, { hash: 'h', tier: 'fast', noSkip: true })).toBe(false);
    // a different tree is a different verdict
    expect(reportCovers(stored, { hash: 'other', tier: 'fast', noSkip: false })).toBe(false);
    // a green from a one-check run is not a verdict on the tree
    expect(reportCovers({ ...stored, scope: { only: ['lint'], afterDepsFullyEvaluated: true } }, { hash: 'h', tier: 'fast', noSkip: false })).toBe(false);
    // a green whose `after` dependencies were never evaluated is not one either
    expect(reportCovers({ ...stored, scope: { only: null, afterDepsFullyEvaluated: false } }, { hash: 'h', tier: 'fast', noSkip: false })).toBe(false);
    // a red is never reusable
    expect(reportCovers({ ...stored, ok: false }, { hash: 'h', tier: 'fast', noSkip: false })).toBe(false);
  });
});

describe('a check that PASSES can still have something to say', () => {
  it('surfaces WARNING lines from a passing check rather than discarding its stdout', () => {
    // The reference harness threw a passing check's stdout away, so
    // `ratchet:persist` announcing that no runtime narrowing existed at all was
    // printed nowhere. That is a skip reading like a pass, one level down.
    const r = verify(['--json', '--only', 'selftest:warns'], { AGENCY_VERIFY_SELFTEST: '1' });
    const report = JSON.parse(r.out) as { ok: boolean; warnings: { id: string; text: string }[] };
    expect(report.ok).toBe(true);
    expect(report.warnings.map((w) => w.id)).toContain('selftest:warns');
  });
});
