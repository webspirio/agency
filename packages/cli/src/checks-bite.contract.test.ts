/**
 * The harness that proves a check can go red must itself be able to tell a
 * biting check from a green one. These three cases are that proof: a stub check
 * that always exits 0 must be REPORTED as not biting, a real check must bite on
 * its own planted defect, and an unknown defect id must throw rather than plant
 * nothing and let the resulting green count as a pass.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type Fixture = { id: string; check: string; expect: string };
type Result = { ok: boolean; report: string };
type Harness = {
  FIXTURES: readonly Fixture[];
  runFixture: (f: Fixture, opts?: { check?: string }) => Promise<Result>;
};

/**
 * A dynamic import with an explicit shape, not a static one: the harness is a
 * `.mjs` outside every package's `rootDir`, so a static import is TS7016 and
 * every callback parameter becomes implicitly `any`. This is the same idiom
 * `verify.contract.test.ts` uses to read the registry.
 */
const harness = async (): Promise<Harness> =>
  (await import(join(ROOT, 'scripts', 'verify', 'checks', 'checks-bite.mjs'))) as Harness;

const fixtureFor = (h: Harness, id: string): Fixture => {
  const found = h.FIXTURES.find((f) => f.id === id);
  if (!found) throw new Error(`no checks:bite fixture with id '${id}'`);
  return found;
};

describe('checks:bite tells a biting check from a green one', () => {
  it('FAILS a check that cannot fail', async () => {
    const h = await harness();
    const dir = mkdtempSync(join(tmpdir(), 'bite-stub-'));
    const alwaysGreen = join(dir, 'always-green.mjs');
    writeFileSync(alwaysGreen, 'process.exit(0)\n');

    const result = await h.runFixture(fixtureFor(h, 'handler-removed'), { check: alwaysGreen });

    expect(result.ok).toBe(false);
    expect(result.report).toContain('did not go red');
  });

  it('PASSES a check that goes red on its own defect', async () => {
    const h = await harness();
    const result = await h.runFixture(fixtureFor(h, 'handler-removed'));

    expect(result.ok).toBe(true);
  });

  it('refuses an unknown defect id rather than planting nothing', async () => {
    const h = await harness();
    await expect(
      h.runFixture({
        id: 'no-such-defect',
        check: 'scripts/verify/checks/contract-complete.mjs',
        expect: 'x',
      }),
    ).rejects.toThrow(/unknown defect/i);
  });
});
