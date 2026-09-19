// mocks/driver-report/src/components/shared/SimChip.tsx
/** The two confessions (§6.5): «імітація» on every value the mock invents (a simulated CAN read, an "OCR" read, a drawn
 *  QR's decode — D9) and «приклад» on every example row. Only «імітація» can be hidden, and only by the stage's hidden
 *  menu (`hideSimChips`, for screenshots); an example is always marked.
 *
 *  20 px high, radius 6, 12 px/500 on the console; on the driver route the same chip in rem (1.25rem) with its text
 *  floored at 0.875rem, because nothing on the driver route is smaller (§8.5). */
import type { JSX } from 'react';
import { PROFILE_ID } from '../../app/device';
import { useServerValue } from '../../app/live';
import { DC } from '../../copy/driver';

const BOX = PROFILE_ID === 'driver'
  ? 'h-[1.25rem] px-[0.375rem] text-[0.875rem]'
  : 'h-[20px] px-[6px] text-[12px]';
const CHIP = `inline-flex shrink-0 items-center whitespace-nowrap rounded-[6px] align-middle font-medium leading-none ${BOX}`;

export function SimChip({ text = DC.simChip }: { text?: string }): JSX.Element | null {
  const hidden = useServerValue((s) => s.toggles.hideSimChips);
  if (hidden) return null;
  return <span className={`${CHIP} bg-hold-wash text-hold`}>{text}</span>;
}

export function ExampleChip({ text = DC.exampleChip }: { text?: string }): JSX.Element {
  return <span className={`${CHIP} bg-bench text-text-2`}>{text}</span>;
}
