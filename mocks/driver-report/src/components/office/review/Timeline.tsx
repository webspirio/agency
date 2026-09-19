// mocks/driver-report/src/components/office/review/Timeline.tsx
/** «Хронологія» — the truck-day read as one column of moments (§4.2 C-08).
 *
 *  EVERY ROW CARRIES ITS SOURCE. That is the whole argument of the page: «412 391 ФОТО» and «241 512 CAN» and
 *  «прибуття за ТТН» are three different kinds of fact, and a waybill that presents them as one column of numbers is
 *  the report the office has to re-check by hand. The `SourceBadge` sits in a fixed 96 px column so the eye can run
 *  down it and see, without reading a word, how much of the day the machine witnessed.
 *
 *  A span renders as «12:30–12:48», not as two rows: a road stop is one event with a length, and splitting it would
 *  put «Стою: Тривога / укриття» twice in a list the office is counting.
 *
 *  `highlight` draws the accent stroke a live write leaves behind — the same 3 px `RowRule live` the board uses, and
 *  the same reason it is not a tone (D10): the accent marks WHAT JUST MOVED, never a status. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { fmtKm, fmtTime } from '../../../app/format';
import type { TimelineRow } from '../../../domain/dto';
import { Artefact } from '../../artefacts';
import { ExampleChip, SimChip, SourceBadge } from '../../shared';
import { RowRule } from '../index';

export function Timeline({ rows, highlight }: { rows: TimelineRow[]; highlight?(r: TimelineRow): boolean }): JSX.Element {
  return (
    <ol className="flex flex-col">
      {rows.map((r, i) => {
        const live = highlight?.(r) ?? false;
        return (
          <li
            key={`${r.at}:${i}`}
            data-live={live ? '' : undefined}
            className={cn(
              'flex min-h-[48px] items-center gap-[12px] border-b border-line/70 px-[20px] py-[8px] last:border-b-0',
              live ? 'bg-accent-wash/40' : null,
            )}
          >
            {live ? <RowRule tone="plain" live /> : <span aria-hidden="true" className="w-[3px] shrink-0" />}
            <span className="w-[104px] shrink-0 font-mono text-[14px] leading-[1.4] whitespace-nowrap text-ink">
              {r.to === null ? fmtTime(r.at) : `${fmtTime(r.at)}–${fmtTime(r.to)}`}
            </span>
            <span className="w-[96px] shrink-0">
              <SourceBadge source={r.source} />
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-[8px] text-[14px] leading-[1.45] text-ink">
              <span className="min-w-0">{r.event}</span>
              {r.simulated ? <SimChip /> : null}
              {r.example ? <ExampleChip /> : null}
            </span>
            {r.thumbs.length === 0 ? null : (
              <span className="flex shrink-0 items-center gap-[6px]">
                {r.thumbs.map((variant, n) => (
                  <Artefact key={`${variant}:${n}`} variant={variant} size="thumb" className="h-[40px]" />
                ))}
              </span>
            )}
            {r.odometer === null ? null : (
              <span className="flex shrink-0 items-center gap-[8px]">
                <span className="font-mono text-[14px] leading-[1.4] whitespace-nowrap text-ink">{fmtKm(r.odometer.value)}</span>
                <SourceBadge source={r.odometer.source} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
