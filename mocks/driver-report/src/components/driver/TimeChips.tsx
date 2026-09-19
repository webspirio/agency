// mocks/driver-report/src/components/driver/TimeChips.tsx
/** «Коли це було?» in four taps and no picker (§3.3 D-11, D-21). A driver who noticed twenty minutes late needs one
 *  touch, not a wheel: «Щойно» · «−15 хв» · «−30 хв» · «−1 год» · «Раніше…», 4rem rows, in the product's own words
 *  (I-14 `DC.timeChips`).
 *
 *  The minus is U+2212, not a hyphen — it is a number on screen, and §0.1 spells every one of them that way. */
import type { JSX } from 'react';
import { DC } from '../../copy/driver';

export type TimeChip = 'now' | 15 | 30 | 60 | 'earlier';

const LABEL: Record<TimeChip, string> = {
  now: DC.timeChips.now,
  15: DC.timeChips.m15,
  30: DC.timeChips.m30,
  60: DC.timeChips.h1,
  earlier: DC.timeChips.earlier,
};

export function TimeChips({ options, onPick }: {
  options: readonly TimeChip[];
  onPick(v: TimeChip): void;
}): JSX.Element {
  return (
    <div className="flex w-full flex-col gap-2">
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => { onPick(option); }}
          className="tap-ring flex h-tap-lg w-full items-center rounded-[12px] px-4 text-left"
        >
          <span className="text-[1.125rem] leading-[1.5rem] font-semibold">{LABEL[option]}</span>
        </button>
      ))}
    </div>
  );
}
