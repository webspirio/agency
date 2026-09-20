// mocks/driver-report/src/pages/driver/home/RoadStopCloseSheet.tsx
/** «Тривога з 12:30 — коли закінчилась?» (§3.3 D-11, the RG half of closing a road stop).
 *
 *  On a Ruptela truck the stop closes itself at the first motion after it (`project()` does that from the telemetry),
 *  so nobody is asked. On Регіс there is no motion to read, and a driver who drove on at 12:48 and only reaches for
 *  the phone at 13:10 must not have the extra twenty-two minutes written into his day. So the NEXT tap that opens a
 *  flow asks first, in four chips and no picker, and the `ROAD_STOP_END` is committed at the moment he picks —
 *  `closed_by: 'NEXT_TAP_CHIP'`, which is what the office's timeline says it was.
 *
 *  «Раніше…» is deliberately absent from the options. It is a free-time picker in D-11's own sheet, and offering it
 *  here would mean building one in a sheet whose whole point is that it costs a single tap; a road stop older than
 *  an hour is closed from D-11 instead. */
import type { JSX } from 'react';
import { BottomSheet, TimeChips, type TimeChip } from '../../../components/driver';
import { DC } from '../../../copy/driver';
import { fmtTime } from '../../../app/format';
import type { OpenRoadStop } from '../../../domain/project';

const OPTIONS: readonly TimeChip[] = ['now', 15, 30, 60];

export function RoadStopCloseSheet({ road, onPick, onClose }: {
  road: OpenRoadStop | null;
  onPick(chip: TimeChip): void;
  onClose(): void;
}): JSX.Element | null {
  if (road === null) return null;
  return (
    <BottomSheet
      open
      title={`${DC.roadStopShort[road.reason]} з ${fmtTime(road.since)} — коли закінчилась?`}
      onClose={onClose}
    >
      <TimeChips options={OPTIONS} onPick={onPick} />
    </BottomSheet>
  );
}
