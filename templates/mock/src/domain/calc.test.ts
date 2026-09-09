import { describe, expect, it } from 'vitest';
import { sum } from '@agency/dec';
import { buildSeed } from './seed';
import { overview } from './calc';

/**
 * The scaffold ships one test because `pnpm --filter <slug> test` is a step of
 * the gate and `vitest run` over a package with no tests exits 1. It pins the
 * two properties every mock has to keep, whatever the client's domain turns
 * out to be — replace the assertions when you replace `types/seed/calc`, do
 * not delete the file.
 */
describe('overview', () => {
  const NOW = '2026-09-09T08:30:00.000Z';

  it('adds the printed lines to the printed total', () => {
    // The one arithmetic property a client checks on a screen share: the
    // column visibly sums to the figure in the tile above it. Rounded per
    // line, then summed — never the other way round.
    const { total, parties } = overview(NOW);
    expect(total).toBe(sum(parties.map((party) => party.balance)));
    expect(total).toBe('76332.20');
  });

  it('regenerates byte-identical seed data on every load', () => {
    // "Reset demo data" is a reload (SPEC 7), so the second load has to show
    // the same names, the same ids and the same balances as the first. This
    // is what goes red the moment someone reaches for Math.random() or a
    // Date-derived id.
    expect(buildSeed()).toEqual(buildSeed());
  });

  it('takes `now` from its caller, so the demo is not clock-dependent', () => {
    expect(overview(NOW).generated_at).toBe(NOW);
  });
});
