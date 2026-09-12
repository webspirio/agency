import { describe, expect, it } from 'vitest';
import { sum } from '@agency/dec';
import { buildSeed } from './seed';
import { overview } from './calc';
import type { Party } from './types';

/**
 * The scaffold ships tests because `pnpm --filter <slug> test` is a step of the
 * gate and `vitest run` over a package with no tests exits 1. These pin the
 * properties every mock has to keep, whatever the client's domain turns out to
 * be — replace the assertions when you replace `types/seed/calc`, do not delete
 * the file.
 */
const NOW = '2026-09-09T08:30:00.000Z';

/** The seed rows with the ids a store would assign, so `overview` can be called
 *  without standing a store up. */
const rows = (): Party[] =>
  buildSeed().map((row, i) => ({ ...row, id: `party-${String(i + 1).padStart(6, '0')}` }));

describe('overview', () => {
  it('adds the printed lines to the printed total', () => {
    // The one arithmetic property a client checks on a screen share: the column
    // visibly sums to the figure in the tile above it. Rounded per line, then
    // summed — never the other way round.
    const parties = rows();
    const { total } = overview(NOW, parties);
    expect(total).toBe(sum(parties.map((party) => party.balance)));
    expect(total).toBe('76332.20');
  });

  it('counts the rows it was given, rather than rebuilding the seed itself', () => {
    // `overview` used to call `buildSeed()` internally, so nothing a POST did
    // survived into the next GET. Taking the rows as an argument is what makes
    // it both correct and movable into a Nest service unchanged.
    expect(overview(NOW, rows().slice(0, 3)).rows).toBe(3);
  });

  it('takes `now` from its caller, so the demo is not clock-dependent', () => {
    expect(overview(NOW, rows()).generated_at).toBe(NOW);
  });
});

describe('the seed', () => {
  it('regenerates byte-identical rows on every load', () => {
    // "Reset demo data" is a reload (SPEC 7), so the second load has to show the
    // same names, the same balances and the same timestamps as the first. This
    // goes red the moment someone reaches for Math.random() or a Date-derived id.
    expect(buildSeed()).toEqual(buildSeed());
  });

  it('carries a snake_case multi-word wire field, so the casing rule is exercisable', () => {
    // A convention that only ever meets single-word fields is a convention
    // nothing can violate. The wire golden fingerprints key names, so a drift to
    // `createdAt` is red there.
    const first = buildSeed()[0];
    expect(first?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('assigns no ids — those are store-assigned (HARD RULE 4)', () => {
    for (const row of buildSeed()) expect('id' in row).toBe(false);
  });
});
