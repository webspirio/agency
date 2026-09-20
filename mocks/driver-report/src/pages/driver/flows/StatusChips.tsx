// mocks/driver-report/src/pages/driver/flows/StatusChips.tsx
/** «Що зараз?» — the one chip list, shared by the arrival step (§3.3 D-04) and the panel that changes what is
 *  happening at an open stop (§3.3 D-05).
 *
 *  ONE LIST, TWO CALLERS, because the two screens ask the same question at two moments. D-04 asks it once, on
 *  arrival, and a tap both answers and advances — there is no «Далі» to reach for while standing at a gate. D-05 asks
 *  it again later and puts the kind's own mark first («Заїхав — вантажать» at a loading stop, «ТТН показав — чекаю
 *  розвантаження» at a drop) and «Тривога / укриття» last, which splits the stop's timer (EC-58). Everything else
 *  about the rows is identical, so they are one component and the DIFFERENCE is a list of chips the caller passes.
 *
 *  Every word comes from `DC.segments`, so a chip cannot be spelled two ways, and every row is a `ChipRow`: one
 *  column of 4rem targets, never two (§3.3 D-04). */
import type { JSX } from 'react';
import { ArrowDownToLine, Ellipsis, FileCheck, FileClock, FlaskConical, Hourglass, MessageCircleQuestionMark,
  PackageOpen, Siren, Weight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ChipRow } from '../../../components/driver';
import { DC } from '../../../copy/driver';
import type { SegmentChip } from '../../../domain/types';

/** §3.3 D-04 / D-05 and §6.7. `WAIT_ORDERS` is never offered as a chip — it is what «Не приймають» (D-11) leaves
 *  behind — but the map is total so a chip cannot be added without an icon. */
export const SEGMENT_ICON: Record<SegmentChip, LucideIcon> = {
  QUEUE: Hourglass,
  LOADING_NOW: PackageOpen,
  UNLOADING_NOW: PackageOpen,
  SCALES: Weight,
  LAB: FlaskConical,
  WAIT_DOCS: FileClock,
  DRIVE_IN: ArrowDownToLine,
  TTN_SHOWN: FileCheck,
  ALERT: Siren,
  OTHER: Ellipsis,
  WAIT_ORDERS: MessageCircleQuestionMark,
};

/** What kind of stop is being answered about. An unplanned «Інше» reads as a loading stop: of the six D-04 chips
 *  only the second one knows which way the cargo is going. */
export type StopKindHere = 'LOADING' | 'DROP';

/** The six chips of §3.3 D-04, in the spec's order. */
export const arrivalChips = (kind: StopKindHere): readonly SegmentChip[] =>
  ['QUEUE', kind === 'DROP' ? 'UNLOADING_NOW' : 'LOADING_NOW', 'SCALES', 'LAB', 'WAIT_DOCS', 'OTHER'];

/** D-05: the kind's own mark first, then the D-04 chips, then «Тривога / укриття» last. */
export const segmentChips = (kind: StopKindHere): readonly SegmentChip[] =>
  [kind === 'DROP' ? 'TTN_SHOWN' : 'DRIVE_IN', ...arrivalChips(kind), 'ALERT'];

export function StatusChips({ options, onPick }: {
  options: readonly SegmentChip[];
  onPick(chip: SegmentChip): void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {options.map((chip) => (
        <ChipRow key={chip} icon={SEGMENT_ICON[chip]} label={DC.segments[chip]} onPress={() => { onPick(chip); }} />
      ))}
    </div>
  );
}
