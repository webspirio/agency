// mocks/driver-report/src/pages/office/board/HoldBar.tsx
/** «3 машини потребують дії — показати» (§4.2 C-01 «Live», §8.3 C-01 #4, §8.6 #15).
 *
 *  The bar is the PRICE of not reordering under the pointer. The board is sorted by what needs a person, so a live
 *  record that raises a row wants to jump it to the top — under a cursor that is two rows down, at the exact moment
 *  someone is about to click. So the order freezes while the pointer is over the table, and what would have moved
 *  collects here instead: the office keeps its click AND learns that something arrived.
 *
 *  It is a button, not a banner: the whole point is that the operator decides when the board may move. */
import type { JSX } from 'react';
import { ArrowUp } from 'lucide-react';
import { plural, pluralN } from '../../../app/format';

const TRUCK_FORMS = ['машина', 'машини', 'машин'] as const;
const NEED_FORMS = ['потребує', 'потребують', 'потребують'] as const;

export function HoldBar({ count, onShow }: { count: number; onShow(): void }): JSX.Element | null {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onShow}
      className="flex w-full items-center gap-[8px] border-b border-line/70 bg-hold-wash px-[20px] py-[10px] text-left text-[13px] leading-[1.4] font-medium text-hold"
    >
      <ArrowUp size={14} aria-hidden="true" className="shrink-0" />
      {`${pluralN(count, TRUCK_FORMS)} ${plural(count, NEED_FORMS)} дії — показати`}
    </button>
  );
}
