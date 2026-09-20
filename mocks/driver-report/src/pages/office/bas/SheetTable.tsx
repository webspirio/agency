// mocks/driver-report/src/pages/office/bas/SheetTable.tsx
/** One of the four sheets of «В BAS» (§4.2 C-11), rendered as what the FILE carries — not as a console list.
 *
 *  So: no `ResponsiveTable`. Its rows are buttons that open something, and a sheet row opens nothing; its chevron
 *  column would be a sixteenth column in a picture whose whole point is that these are the columns BAS receives.
 *  Every cell arrives finished from `src/domain/export.ts` — dates `dd.mm.yyyy`, Kyiv `HH:MM`, decimal commas,
 *  «так» / «ні», «—» for unknown — and this file formats nothing and computes nothing.
 *
 *  Three things the spec asks of the table, and where each one is:
 *  - every value column is followed by its source column: that is the COLUMN LIST's shape, already so in the view;
 *  - every row ends with «Підтверджено» «так» / «ні», «ні» in hold, because an unconfirmed day is not in the file;
 *  - compact and rail show the first six columns and say how many the file still has. The note is deliberately a
 *    sentence rather than a horizontal scrollbar (§4.1 rule 1: a console the office has to scroll sideways is one
 *    they read one half of). At `mobile` the sheet becomes a CARD LIST — one definition list per row, every column
 *    of the file labelled — because §8.3 Shell #4 asks that at 390 px «every table is a card list», and W3-05
 *    measured this as the one console route that still rendered a `<table>` there: 509 px of it inside a 390 px
 *    `main`, which scrolled sideways and put the four-tab strip and «Імпорт у BAS (імітація)» off screen.
 *
 *  THE COLUMNS ARE SHARES, not content widths. `table-layout: fixed` plus a `<colgroup>` of equal percentages is
 *  what makes the table exactly its container at every console width; under `auto` the fifteen columns of
 *  «Подорожні» measured 1 370 px inside a 1 136 px pane at 1 440 and the last column was clipped away. `data-fit`
 *  is the declared total `src/pages/office/fit.test.tsx` holds against the pane.
 *
 *  `exported_line` renders as its own row under the row it belongs to, spanning the table: «У BAS 21.09 16:07 ·
 *  версія 1» is a fact about the DAY, not a column of the file, and the file writers never emit it.
 *
 *  The е-ТТН line joins it THERE when the «е-ТТН» column is one of the narrowed-away ones. Measured: the stage's
 *  console frame is 946 px (§5.2), which is `compact`, and «е-ТТН» is column 11 of «Ділянки» — so on the machine the
 *  demo actually runs on, the row §8.3 C-11 #2 asks for would have been invisible behind «Ще 8 колонок у файлі».
 *  `SheetRow.ettn` is what makes that row findable without this file knowing anything about ТТН platforms. */
import { Fragment, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { pluralN } from '../../../app/format';
import type { ConsoleMode } from '../../../components/office';
import { ExampleChip } from '../../../components/shared';
import type { SheetView } from '../../../domain/dto';

/** «Ще 9 колонок у файлі» — the count declines, because «Ще 4 колонок» is the kind of seam a client reads as a mock. */
const COLUMN_FORMS = ['колонка', 'колонки', 'колонок'] as const;
/** §4.2 C-11: compact and rail show the first six. */
const NARROW = 6;
/** Every column of a sheet is the same share of it: the file has no column that deserves more room than another,
 *  and fifteen of them at 74 px add up to 1 110 — inside the 1 136 px pane 1 440 gives (`fit.test.tsx`). */
const EVEN = 74;
/** The «Ділянки» column §4.2 C-11 names by hand; `src/domain/export.ts` writes the header, this only reads it. */
const ETTN = 'е-ТТН';

export function SheetTable({ view, mode }: { view: SheetView; mode: ConsoleMode }): JSX.Element {
  const columns = mode === 'wide' ? view.columns : view.columns.slice(0, NARROW);
  const hidden = view.columns.length - columns.length;
  const lastIndex = view.columns.length - 1;
  const ettnIndex = columns.includes(ETTN) ? -1 : view.columns.indexOf(ETTN);
  /** What goes under a row: the е-ТТН line when its column was narrowed away, then «У BAS … · версія N». */
  const under = (row: SheetView['rows'][number]): string[] =>
    [row.ettn && ettnIndex !== -1 ? (row.cells[ettnIndex] ?? null) : null, row.exported_line]
      .filter((line): line is string => line !== null && line !== '' && line !== '—');
  if (mode === 'mobile') {
    return (
      <div className="flex flex-col gap-[10px] p-[16px]">
        {view.rows.map((row, r) => (
          <div key={`${String(r)}-${row.cells[0] ?? ''}`} data-ettn={row.ettn ? '' : undefined} className="card-ring px-[16px] py-[14px]">
            <dl className="flex flex-col gap-[4px]">
              {view.columns.map((c, i) => (
                <div key={`${String(i)}-${c}`} className="flex items-baseline justify-between gap-[12px]">
                  <dt className="text-[13px] leading-[1.35] text-text-2">{c}</dt>
                  <dd className={cn('text-right text-[13px] leading-[1.35] break-words text-ink',
                    i === lastIndex && !row.confirmed ? 'text-hold' : null)}
                  >
                    <span className="inline-flex items-center gap-[8px]">
                      <span>{row.cells[i] ?? '—'}</span>
                      {i === 0 && row.example ? <ExampleChip /> : null}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            {row.exported_line === null || row.exported_line === '' ? null : (
              <p className="mt-[8px] text-[12px] leading-[1.35] text-text-2">{row.exported_line}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  const fit = columns.length * EVEN;
  return (
    <>
      <table className="w-full table-fixed border-collapse text-left" data-fit={fit}>
        <caption className="sr-only">{view.title}</caption>
        <colgroup>
          {columns.map((c, i) => (
            <col key={`${String(i)}-${c}`} data-w={EVEN} style={{ width: `${String((EVEN * 100) / fit)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="h-[40px] border-b border-line/70">
            {columns.map((c, i) => (
              <th
                key={`${String(i)}-${c}`}
                scope="col"
                className="px-[12px] text-[13px] leading-[1.3] font-semibold text-text-2 first:pl-[20px] last:pr-[20px]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row, r) => {
            const lines = under(row);
            return (
              <Fragment key={`${String(r)}-${row.cells[0] ?? ''}`}>
                <tr
                  data-ettn={row.ettn ? '' : undefined}
                  className={cn('border-b border-line/70', lines.length === 0 ? 'last:border-b-0' : 'border-b-0')}
                >
                  {columns.map((c, i) => (
                    <td
                      key={`${String(i)}-${c}`}
                      className={cn(
                        'h-[44px] px-[12px] py-[8px] align-middle text-[13px] break-words text-ink first:pl-[20px] last:pr-[20px]',
                        i === lastIndex && !row.confirmed ? 'text-hold' : null,
                      )}
                    >
                      <span className="inline-flex items-center gap-[8px]">
                        <span>{row.cells[i] ?? '—'}</span>
                        {i === 0 && row.example ? <ExampleChip /> : null}
                      </span>
                    </td>
                  ))}
                </tr>
                {lines.length === 0 ? null : (
                  <tr className="border-b border-line/70 last:border-b-0">
                    <td colSpan={columns.length} className="pb-[10px] pl-[20px] text-[12px] leading-[1.35] text-text-2">
                      {lines.map((line) => (
                        <span key={line} className="block">{line}</span>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {hidden === 0 ? null : (
        <p className="border-t border-line/70 px-[20px] py-[12px] text-[13px] text-text-2">
          Ще {pluralN(hidden, COLUMN_FORMS)} у файлі
        </p>
      )}
    </>
  );
}
