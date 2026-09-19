// mocks/driver-report/src/components/office/review/SummaryCell.tsx
/** One of the truck-day's four summary cells (§4.2 C-08): Одометр · Пальне · На зміні · Документи.
 *
 *  The value is one number; the lines under it are what that number MEANS — «234 км · з вантажем 175 · порожній 59 ·
 *  2 878 т·км» — and the hold lines are what it does NOT mean: «Залишки: немає даних з Регіс (фаза 1) · факт за день
 *  не рахується». Those two are separate arrays rather than one styled list because the distinction is the point of
 *  §8.3 C-08 #3: a cell that hides a missing input behind a confident number is exactly the report the office
 *  already cannot trust, and unknown renders «—», never «0» (§0.1).
 *
 *  The `SimChip` marks a cell whose number the mock invented (a CAN litre count, a tacho span). Nothing here decides
 *  that — `src/domain` does, and this component only shows what it was handed. */
import type { JSX } from 'react';
import type { SummaryCellView } from '../../../domain/dto';
import { SimChip } from '../../shared';

export function SummaryCell({ cell }: { cell: SummaryCellView }): JSX.Element {
  return (
    <div className="card-ring flex flex-col px-[20px] py-[16px]">
      <div className="flex items-center gap-[8px]">
        <p className="text-[13px] leading-[1.3] font-semibold text-text-2">{cell.label}</p>
        {cell.simulated ? <SimChip /> : null}
      </div>
      <p className="mt-[6px] font-mono text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">{cell.value}</p>
      {cell.lines.length === 0 ? null : (
        <div className="mt-[8px] flex flex-col gap-[2px]">
          {cell.lines.map((line, i) => (
            <p key={`l${i}:${line}`} className="text-[13px] leading-[1.45] text-text-2">{line}</p>
          ))}
        </div>
      )}
      {cell.hold_lines.length === 0 ? null : (
        <div className="mt-[6px] flex flex-col gap-[2px]">
          {cell.hold_lines.map((line, i) => (
            <p key={`h${i}:${line}`} className="text-[13px] leading-[1.45] text-hold">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
