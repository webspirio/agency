// mocks/driver-report/src/components/artefacts/artefacts.test.tsx
/**
 * The five drives of W1-06, written from the plan. One matcher is corrected against a fact measured at the Wave 0 gate:
 * Testing Library normalises a NODE's U+00A0 to U+0020 and never normalises the MATCHER, so «СУМА 22 800,00 ГРН» is
 * written here with a plain space while the receipt keeps its NBSP (§0.1). The rendered copy is never weakened to suit
 * a matcher — only the matcher moves.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { seededWorld } from '../../domain/fixtures';
import type { Truck, World } from '../../domain/types';
import { TTN_PAPERS } from './catalogue';
import { Artefact, artefactKindOf, SeatBackdrop } from './index';

// No globals in either vitest config, so Testing Library's auto-cleanup guard (`typeof afterEach === 'function'`) is
// false and nothing unmounts between `it`s: one document left mounted makes the next `screen` query search two papers
// at once. Same reason as src/app/speed.test.ts:46.
afterEach(cleanup);

/** Every variant §6.11 names and every variant §5.7 photographs — the acceptance criterion of this task, which the
 *  five drives below cover four of. A misspelt catalogue key drops one of these to the blank form, and the office
 *  would meet it as an empty ТТН in the lightbox rather than as an error anybody can see here. */
const DRAWN = [
  'cluster:412355', 'cluster:412391', 'cluster:412398', 'cluster:412450', 'cluster:412566', 'cluster:412589',
  'cluster:356118', 'cluster:356474', 'cluster:412391:glare', 'cluster:356118:dark',
  'ttn-004517-front', 'ttn-004518-front', 'ttn-004533-front', 'ttn-004655-front', 'ttn-004671-front',
  'ttn-004517-back', 'ttn-004518-back', 'ttn-004518-back:soft',
  'ttn-004517-signed', 'ttn-004518-signed', 'ttn-004533-signed', 'ttn-004655-signed', 'ttn-004671-signed',
  'receipt-okko-58213', 'receipt-wog-30744', 'weigh-ticket-3317', 'act-214',
] as const;

describe('drawn artefacts (§6.11, D9)', () => {
  it('draws the ТТН front of 004517 with the cargo line', () => {
    render(<Artefact variant="ttn-004517-front" size="full" />);
    expect(screen.getByText('ТОВАРНО-ТРАНСПОРТНА НАКЛАДНА № 004517')).toBeInTheDocument();
    expect(screen.getByText(/Комбікорм ПК-1/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'ТТН 004517, лицьовий бік' })).toBeInTheDocument();
  });
  it('smudges only the arrival cell of the soft back page', () => {
    const { container } = render(<Artefact variant="ttn-004518-back:soft" size="full" />);
    expect(container.querySelector('[data-cell="arrival"]')?.getAttribute('filter')).toMatch(/url\(#/);
    expect(container.querySelectorAll('[filter]')).toHaveLength(1);
  });
  it('prints the ОККО receipt with its sum and QR', () => {
    const { container } = render(<Artefact variant="receipt-okko-58213" size="full" />);
    expect(screen.getByText('ЧЕК № 58213')).toBeInTheDocument();
    expect(screen.getByText('СУМА 22 800,00 ГРН')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="QR-код (імітація)"]')).not.toBeNull();
  });
  it('shows the cluster reading and a signed copy without a stamp', () => {
    const { container } = render(<><Artefact variant="cluster:412391" size="view" /><Artefact variant="ttn-004517-signed" size="full" /></>);
    expect(screen.getByText('412391 km')).toBeInTheDocument();
    expect(screen.getByText('Примірник 3')).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain('печатк');
  });
  it('knows each variant’s artefact kind', () => {
    expect(['ttn-004518-back:soft', 'ttn-004517-signed', 'receipt-wog-30744', 'cluster:412566', 'weigh-ticket-3317', 'act-214'].map(artefactKindOf))
      .toEqual(['TTN_BACK', 'TTN_SIGNED', 'RECEIPT', 'CLUSTER', 'WEIGH_TICKET', 'ACT']);
  });
  it('draws every variant §6.11 and §5.7 name, and falls back loudly for one it has never seen', () => {
    for (const variant of DRAWN) {
      const { container, unmount } = render(<Artefact variant={variant} size="thumb" />);
      const drawn = container.querySelector('svg[role="img"]');
      expect(drawn?.getAttribute('aria-label'), variant).toBeTruthy();
      expect(drawn?.getAttribute('aria-label'), variant).not.toBe('Документ (імітація)');
      expect(container.firstElementChild?.getAttribute('data-kind'), variant).toBe(artefactKindOf(variant));
      unmount();
    }
    render(<Artefact variant="nothing-like-this" size="full" />);
    expect(screen.getByRole('img', { name: 'Документ (імітація)' })).toBeInTheDocument();
  });
  /* The dash clock is the one figure on a cluster that a variant did not carry: every cluster photo used to read
   * «08:57», so the office opened Павло's 15:16 deferred щиток and saw a morning panel (INTEGRATOR NOTE, W1-06). The
   * hour is read from SCRIPT's own PageTemplate.at — the same table the runner takes the photo from — so it cannot be
   * typed twice, and a cluster no script photographs keeps §6.11's own display. */
  it('reads the dash clock off the script that took the photo (§5.7), not one hour for every cluster', () => {
    const clockOf = (variant: string): string => {
      const { container, unmount } = render(<Artefact variant={variant} size="full" />);
      const clock = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '')
        .find((t) => /^\d{2}:\d{2}$/.test(t)) ?? '';
      unmount();
      return clock;
    };
    // S-03 05:20 · S-16 08:58 (the щиток after the ОККО чек) · S-42 15:16 · S-51 16:30, and §6.11's own for a
    // cluster the script never takes.
    expect(['cluster:412355', 'cluster:412398', 'cluster:412566', 'cluster:356474', 'cluster:000000'].map(clockOf))
      .toEqual(['05:20', '08:58', '15:16', '16:30', '08:57']);
    // A modifier does not change which photo it is: the glare variant of 412391 is still S-06's 06:10.
    expect(clockOf('cluster:412391:glare')).toBe(clockOf('cluster:412391'));
  });
  it('seats a document on the passenger seat, tipped and shadowed', () => {
    const { container } = render(<SeatBackdrop><Artefact variant="weigh-ticket-3317" size="view" /></SeatBackdrop>);
    expect(screen.getByRole('img', { name: 'Ваговий талон № 3317' })).toBeInTheDocument();
    expect(container.querySelector('[style*="rotate(-1.5deg)"]')).not.toBeNull();
    expect(container.querySelectorAll('[filter]')).toHaveLength(0);
  });
});

/* `TTN_CATALOGUE` carries only what OCR reads off the printed front, so six fields of a drawn ТТН — the carrier, the
 * vehicle, the trailer, the driver and the two points — are the paper's own data in `catalogue.ts` (the W1-06
 * INTEGRATOR NOTE). Four of them are the SEED's facts written a second time, and nothing made the two copies move
 * together: renaming a truck in `seed.ts` left the drawn ТТН printing the old plate with no check red. This is that
 * check. It compares the paper to the seed through the ТТН's own doc → trip → truck / trailer / driver and
 * doc → planned stop → place, so it follows a re-planned ТТН rather than a table of expected strings. */
describe('a drawn ТТН and the seed say the same thing (§7.6)', () => {
  const world = seededWorld();
  const vehicleOf = (truck: Truck): string => `${truck.model}, ${truck.plate}`;

  /** Every disagreement between `TTN_PAPERS` and the world, as one sentence each; `[]` is agreement.
   *  A demo-day ТТН is not a `ttnDoc` until the driver commits the stop that creates it, so the seed's statement
   *  about it is its PLANNED stops: the pair that names the number carries the trip, and the trip carries the truck,
   *  the trailer and the driver. */
  function mismatches(w: World): string[] {
    const townOf = (stop: { place_id: string } | undefined): string | null =>
      w.places.find((p) => p.id === stop?.place_id)?.town ?? null;
    return Object.entries(TTN_PAPERS).flatMap(([no, paper]) => {
      const carrying = w.plannedStops.filter((s) => s.ttn_nos.includes(no));
      const loading = carrying.find((s) => s.kind === 'LOADING');
      const drop = carrying.find((s) => s.kind === 'DROP');
      if (loading === undefined || drop === undefined) return [`ТТН ${no}: no planned loading and drop in the seed`];
      const trip = w.trips.find((t) => t.id === loading.trip_id);
      if (trip === undefined) return [`ТТН ${no}: the plan names no рейс in the seed`];
      const truck = w.trucks.find((t) => t.id === trip.truck_id);
      const trailer = w.trailers.find((t) => t.id === trip.trailer_id);
      const driver = w.drivers.find((d) => d.id === trip.driver_id);
      const say = (what: string, drawn: string, seeded: string | null): string | null =>
        seeded !== null && drawn.includes(seeded) ? null : `ТТН ${no}: ${what} «${drawn}» ≠ «${seeded ?? '—'}»`;
      return [
        say('автомобіль', paper.vehicle, truck === undefined ? null : vehicleOf(truck)),
        say('причіп', paper.trailer, trailer?.plate ?? null),
        say('водій', paper.driver, driver?.short_name ?? null),
        say('пункт навантаження', paper.loading, townOf(loading)),
        say('пункт розвантаження', paper.unloading, townOf(drop)),
      ].filter((line): line is string => line !== null);
    });
  }

  it('prints the seed’s own truck, trailer, driver and two towns on every ТТН it draws', () => {
    expect(mismatches(world)).toEqual([]);
  });

  it('goes red when the seed moves underneath it', () => {
    // The control, so the green above is not a predicate that cannot fail: the plate Павло's ТТН prints, renamed in
    // the seed alone. Three of the five numbers ride on this truck.
    const renamed = { ...world, trucks: world.trucks.map((t) => (t.plate === 'АР 1234 ВС' ? { ...t, plate: 'АР 0000 ХХ' } : t)) };
    expect(mismatches(renamed)).toEqual([
      'ТТН 004517: автомобіль «Scania R450, АР 1234 ВС» ≠ «Scania R450, АР 0000 ХХ»',
      'ТТН 004518: автомобіль «Scania R450, АР 1234 ВС» ≠ «Scania R450, АР 0000 ХХ»',
    ]);
    // And when a place is renamed: the ТТН's «Пункт розвантаження» is the drop stop's own town.
    const moved = { ...world, places: world.places.map((p) => (p.code === 'ZLAGODA' ? { ...p, town: 'Покровське' } : p)) };
    expect(mismatches(moved)).toEqual([
      'ТТН 004517: пункт розвантаження «м. Синельникове» ≠ «Покровське»',
      'ТТН 004655: пункт розвантаження «м. Синельникове» ≠ «Покровське»',
    ]);
  });
});
