// mocks/driver-report/src/components/driver/TripRailCard.tsx
/** The «Сьогодні» card of home modes B, B′, B″ and C (§3.3 D-02): the рейс and its mass, where the plan came from,
 *  and the road itself.
 *
 *  THE SOURCE LINE IS RENDERED VERBATIM AND THE CHIP IS THE CARD'S. `project()` hands over
 *  «план з BAS 20.09 17:40» with nothing appended (I-11, W0-09), and the «приклад» beside it is an `ExampleChip`
 *  rather than three more characters in the string — a confession is a component everywhere else in this product
 *  (§6.1 «every simulated value confesses»), and a string that ends in « · приклад» cannot be told from a plan whose
 *  dispatcher is called «приклад». It is mono 0.875rem because it is a machine's timestamp, not a sentence.
 *
 *  `emptySlot` is mode B″ and nothing else: «Місця оберете на точці — …» in the dashed `empty-slot` (§6.2), under a
 *  rail whose last node is still ahead. The no-plan slot of mode A belongs to the `TodayCard` — this card is not
 *  rendered at all when there is no plan. */
import type { JSX } from 'react';
import type { TripMarkerView, TripStopView } from '../../domain/project';
import { ExampleChip } from '../shared';
import { TripRail } from './TripRail';

export function TripRailCard({ header, source, stops, markers, emptySlot }: {
  header: string;
  source: string;
  stops: TripStopView[];
  markers: TripMarkerView[];
  emptySlot: string | null;
}): JSX.Element {
  return (
    <section className="card-ring flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[1rem] leading-[1.375rem] font-semibold">{header}</h2>
        {source === '' ? null : (
          <span className="flex items-center gap-2">
            <span className="font-mono text-[0.875rem] leading-[1.25rem] font-medium" style={{ color: 'var(--text-2)' }}>
              {source}
            </span>
            <ExampleChip />
          </span>
        )}
      </div>
      <TripRail stops={stops} markers={markers} />
      {emptySlot === null ? null : (
        <p className="empty-slot px-3 py-3 text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>
          {emptySlot}
        </p>
      )}
    </section>
  );
}
