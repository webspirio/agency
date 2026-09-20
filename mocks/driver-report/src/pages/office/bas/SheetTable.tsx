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
 *    they read one half of). `mobile` is treated as `rail` — §4.1 gives that fold two numbers and `ConsoleMode` has
 *    no 640 member; the band is already logged for W3-05.
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
  return (
    <>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{view.title}</caption>
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
                        'h-[44px] px-[12px] py-[8px] align-middle text-[13px] text-ink first:pl-[20px] last:pr-[20px]',
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
