// mocks/driver-report/src/components/office/review/FactGrid.tsx
/** The waybill's requisites (§4.2 C-08): ПІДПРИЄМСТВО · АВТОМОБІЛЬ · ПРИЧІП · ВОДІЙ · ВИДАВ · ВИПУСК · ТЕМПЕРАТУРА ·
 *  РЕЙС.
 *
 *  THE ONLY CAPS IN THE CONSOLE. Uppercase is slow to read, so it is spent once, here, where it earns something: a
 *  паперовий подорожній лист has exactly these boxes and exactly these labels, and an accountant who has stamped ten
 *  thousand of them finds a field by its shape before reading a word. Everywhere else in the console the label is
 *  sentence case (§4.1), and the `eyebrow` utility exists only for this grid.
 *
 *  Four columns wide, two compact and rail, one mobile — by media query rather than by `useConsoleMode`, because the
 *  grid has no mode prop in I-15 and a fact grid that reflows on its own container is right on the print page too.
 *  The thresholds are the console's own (1200 / 720), not Tailwind's defaults. */
import type { JSX } from 'react';
import type { TruckDayView } from '../../../domain/dto';
import { Plate } from '../../shared';

export function FactGrid({ items }: { items: TruckDayView['requisites'] }): JSX.Element {
  return (
    <dl className="grid grid-cols-1 gap-x-[24px] gap-y-[16px] min-[720px]:grid-cols-2 min-[1200px]:grid-cols-4">
      {items.map((f) => (
        <div key={f.key} className="min-w-0">
          <dt className="eyebrow">{f.label}</dt>
          <dd className="mt-[4px] flex min-w-0 flex-col gap-[4px]">
            <span className="flex flex-wrap items-center gap-[8px] text-[14px] leading-[1.45] text-ink">
              {f.plate === null ? null : <Plate plate={f.plate} size="sm" />}
              {f.value === '' ? null : <span>{f.value}</span>}
            </span>
            {f.note === null ? null : <span className="text-[12px] leading-[1.35] text-text-2">{f.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
