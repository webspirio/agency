import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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
