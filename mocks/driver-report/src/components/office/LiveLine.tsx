// mocks/driver-report/src/components/office/LiveLine.tsx
/** «щойно · 05:21» under a row a driver's record just changed, with one `cl-stem` drawn beneath it (§4.1, §5.9).
 *
 *  The word is fixed, not computed: this line exists for the `LIVE_MS` window after the change, so «щойно» is true
 *  for as long as the line is on screen, and the time beside it is what the presenter reads out loud.
 *
 *  The stem is the ONE accent stroke on a console row — the same 180 ms linear draw the driver's receipt uses, and
 *  the same reason it is not a status (D10). `prefers-reduced-motion` already collapses it to an instant appearance
 *  through the rule in `index.css`, so nothing here needs a motion guard. */
import type { JSX } from 'react';
import type { Instant } from '@agency/mock';
import { fmtTime } from '../../app/format';

export function LiveLine({ at }: { at: Instant }): JSX.Element {
  return (
    <span className="inline-flex flex-col items-start gap-[3px] align-middle">
      <span className="text-[12px] leading-[1.3] text-text-2">щойно · {fmtTime(at)}</span>
      <span aria-hidden="true" className="cl-stem w-[28px]" />
    </span>
  );
}
