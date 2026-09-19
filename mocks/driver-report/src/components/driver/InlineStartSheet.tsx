// mocks/driver-report/src/components/driver/InlineStartSheet.tsx
/** A forgotten shift start costs one tap, never a call (§3.3 D-21). It opens over the first capture of a day whose
 *  shift was never opened, asks «Ви ще не почали зміну. Почати на АР 1234 ВС?», and the chip the driver picks commits
 *  `SHIFT_START` without an odometer — then the original action continues where it left off.
 *
 *  On a truck with a card reader the sheet does not ask WHEN: the truck already knows, so the first chip offers the
 *  moment it left the base («з 05:20 — машина виїхала з бази (Ruptela)») and the second is «Зараз». On RG the four
 *  time chips of D-11 are offered instead.
 *
 *  «Зараз», not «Щойно»: D-21 spells this one chip that way because it is answering "почати коли?", not "це було
 *  коли?". */
import type { JSX } from 'react';
import { DC } from '../../copy/driver';
import { BottomSheet } from './BottomSheet';

export type StartChip = 'NOW' | 'M30' | 'H1' | 'EARLIER' | 'CARD';

const NOW_LABEL = 'Зараз';

export function InlineStartSheet({ open, plate, rc, startedLabel, onPick, onClose }: {
  open: boolean;
  plate: string;
  rc: boolean;
  startedLabel: string | null;
  onPick(chip: StartChip): void;
  onClose(): void;
}): JSX.Element {
  const chips: { chip: StartChip; label: string }[] = rc && startedLabel !== null
    ? [
      { chip: 'CARD', label: `з ${startedLabel} — машина виїхала з бази (Ruptela)` },
      { chip: 'NOW', label: NOW_LABEL },
    ]
    : [
      { chip: 'NOW', label: NOW_LABEL },
      { chip: 'M30', label: DC.timeChips.m30 },
      { chip: 'H1', label: DC.timeChips.h1 },
      { chip: 'EARLIER', label: DC.timeChips.earlier },
    ];
  return (
    <BottomSheet open={open} title={`Ви ще не почали зміну. Почати на ${plate}?`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {chips.map(({ chip, label }) => (
          <button
            key={chip}
            type="button"
            onClick={() => { onPick(chip); }}
            className="tap-ring flex h-tap-lg w-full items-center rounded-[12px] px-4 text-left"
          >
            <span className="text-[1.125rem] leading-[1.5rem] font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
