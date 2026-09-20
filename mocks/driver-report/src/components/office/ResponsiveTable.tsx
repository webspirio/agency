// mocks/driver-report/src/components/office/ResponsiveTable.tsx
/** Every list in the console, and the four promises §4.1 makes about one.
 *
 *  1. NEVER A HORIZONTAL SCROLL. A column is dropped at `compact`/`rail` by `hideAt`, and where it still matters it
 *     names a `mergeInto` column and becomes that column's second line. A console the office has to scroll sideways
 *     is a console they read one half of.
 *
 *     THAT PROMISE WAS PROSE UNTIL W3-06, and W3-05 measured it broken at the one width the demo runs at. At 946 px
 *     the pane is 690 px and `table-layout: auto` let cell CONTENT override every pinned width: «Зв'язок» took
 *     203 px for «42 хв · тоді в телефоні 3», the table grew to 796 px, and the panel's `overflow-hidden` cut every
 *     row's «…» menu and its chevron off the right-hand edge. «Машини» was 829 px in the same 690 px pane. In
 *     «Пілот» the table fitted and failed the other way — «Стан» got 92 px and one row became 299 px tall.
 *
 *     `table-layout: fixed` ALONE IS WORSE, measured: it hands every column exactly what it declared, so «Машини»
 *     went from 829 px to 1 312 px. So the widths are declared as PERCENTAGES of their own total, in a `<colgroup>`,
 *     under fixed layout. The table is then exactly its container at every console width — it can neither overflow
 *     nor be pushed by content — and a pinned width survives as a RATIO. Where the declared total already fits the
 *     pane the ratio and the pixel are the same number; where it does not, every column compresses together instead
 *     of one of them eating the rest. `data-fit` publishes that total so `src/pages/office/fit.test.tsx` can hold
 *     each page to the pane §8.3 measures its mode in (1 136 · 690 · 766) — the half a percentage cannot check,
 *     because a table twice its pane still FITS, by being squeezed to half of everything.
 *
 *     `width` is therefore REQUIRED, per mode where §4.2's column table gives more than one number. An undeclared
 *     column has no share under fixed layout, and «the flex column» is a decision that has to be written down.
 *  2. EVERY ROW IS A BUTTON. `role="button"`, `tabIndex={0}`, Enter (and Space) opens it, and it ends in a 16 px
 *     chevron at 55 % — so the row is reachable by Tab and openable without a mouse (§8.5). The first cell opens
 *     with the `RowRule`, which is the only place a tone appears.
 *  3. BELOW A PHONE WIDTH EACH ROW IS A CARD. `card(row)` is the caller's, because what survives the fold is a
 *     page's decision, not a table's. `mode` decides it and nothing else: the console reflows by its own width
 *     (`useConsoleMode`), and reading the viewport a second time here would disagree with the shell inside the
 *     stage's iframe. §4.1 gives this one fold TWO numbers — the sidebar's mobile breakpoint is < 720 while «tables
 *     become cards below 640» — and `ConsoleMode` has no 640 member, so the fold happens at `mobile` and a page that
 *     wants it at 640 passes `mode="mobile"` itself (W1-04's INTEGRATOR NOTE, accepted at the round gate).
 *  4. A LIVE CHANGE DOES NOT REORDER UNDER THE POINTER. With `frozen`, the order at the moment the table was
 *     hovered or focused is held until the pointer leaves, and `onHoverChange` lets the page raise «N машин
 *     потребують дії — показати» instead (§8.3 C-01 #4). The held order is applied by KEY, so a row that arrives
 *     while frozen is appended rather than dropped, and one that leaves simply disappears from the order.
 *     `setHeld` is gated on `frozen` so a table nobody froze does no work on every mouse move.
 *
 *  Relational operators and `*`/`/` are off under `src/components/**` by design; nothing here is money. Every value
 *  in a cell arrives finished from `src/domain`. */
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { ChevronRight } from 'lucide-react';
import type { Tone } from '../../domain/types';
import { RowRule } from './RowRule';
import type { ConsoleMode } from './useConsoleMode';

export type RTColumn<R> = {
  id: string;
  header: string;
  cell(r: R): ReactNode;
  /** What this column reads as a SECOND LINE under `mergeInto`, where its own header is not on screen to label it.
   *  Merging drops the header — that is what merging IS — so a bare «32,0» under «33,9 CAN» says nothing until the
   *  line reads «норма 32,0». Absent, the merged line is `cell`, which is right for a column whose value speaks for
   *  itself. A page that composed this itself had to re-derive `hideAt` in a ternary per column — the table's own
   *  answer, read back out of it (W2-08's integrator note, applied at the round gate). */
  mergedCell?(r: R): ReactNode;
  /** The column's share of the table, in the px §4.2's column table pins. Required: see promise 1. */
  width: number;
  hideAt?: ('compact' | 'rail')[];
  mergeInto?: string;
  align?: 'left' | 'right';
};

/** The chevron column of promise 2 — the one column no page declares, so the table declares it here. */
const CHEVRON = 40;

/** A column's share at `mode`. TWO numbers, not four: `rail` hides a superset of what `compact` hides, so the
 *  compact total is always the binding one and one «narrow» number serves both bands; `mobile` renders cards and
 *  no column at all. The two totals every console list is held to are 1 136 (the pane at 1 440) and 690 (the pane
 *  at 946, the width the stage's console frame runs at) — `src/pages/office/fit.test.tsx`. */
export const colW = (mode: ConsoleMode, w: { wide: number; narrow: number }): number =>
  (mode === 'wide' ? w.wide : w.narrow);

/** The held order, applied by key: kept rows first in their frozen positions, newcomers after, in arrival order. */
function applyOrder<R>(rows: R[], rowKey: (r: R) => string, order: string[]): R[] {
  const byKey = new Map(rows.map((r) => [rowKey(r), r]));
  const out: R[] = [];
  for (const key of order) {
    const row = byKey.get(key);
    if (row !== undefined) {
      out.push(row);
      byKey.delete(key);
    }
  }
  for (const row of byKey.values()) out.push(row);
  return out;
}

export function ResponsiveTable<R>({
  columns,
  rows,
  rowKey,
  onOpen,
  card,
  rule,
  mode,
  frozen,
  onHoverChange,
  empty,
}: {
  columns: RTColumn<R>[];
  rows: R[];
  rowKey(r: R): string;
  onOpen?(r: R): void;
  card(r: R): ReactNode;
  rule?(r: R): { tone: Tone; live: boolean };
  mode: ConsoleMode;
  frozen?: boolean;
  onHoverChange?(h: boolean): void;
  empty?: ReactNode;
}): JSX.Element {
  const [held, setHeld] = useState(false);
  const orderRef = useRef<string[]>(rows.map(rowKey));
  useEffect(() => {
    if (!held) orderRef.current = rows.map(rowKey);
  });

  const ordered = frozen === true && held ? applyOrder(rows, rowKey, orderRef.current) : rows;

  const hold = (on: boolean): void => {
    if (frozen === true) setHeld(on);
    onHoverChange?.(on);
  };
  const hover = {
    onMouseEnter: () => hold(true),
    onMouseLeave: () => hold(false),
    onFocus: () => hold(true),
    onBlur: () => hold(false),
  };

  const open = (r: R): void => onOpen?.(r);
  const rowProps = (r: R) =>
    onOpen === undefined
      ? {}
      : {
          role: 'button',
          tabIndex: 0,
          onClick: () => open(r),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            open(r);
          },
        };

  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;

  if (mode === 'mobile') {
    return (
      <div className="flex flex-col gap-[10px]" {...hover}>
        {ordered.map((r) => (
          <div
            key={rowKey(r)}
            {...rowProps(r)}
            className={cn(
              'card-ring flex items-start gap-[12px] px-[16px] py-[14px] text-[14px]',
              onOpen === undefined ? null : 'cursor-pointer',
            )}
          >
            {rule === undefined ? null : <RowRule tone={rule(r).tone} live={rule(r).live} />}
            <div className="min-w-0 flex-1">{card(r)}</div>
          </div>
        ))}
      </div>
    );
  }

  const visible = columns.filter((c) => !(c.hideAt ?? []).some((m) => m === mode));
  const shown = new Set(visible.map((c) => c.id));
  const merged = new Map<string, RTColumn<R>[]>();
  for (const c of columns) {
    if (shown.has(c.id) || c.mergeInto === undefined) continue;
    const list = merged.get(c.mergeInto) ?? [];
    list.push(c);
    merged.set(c.mergeInto, list);
  }

  // The declared total, and each column's share of it. A share rather than a pixel is what makes the table exactly
  // its container at every console width (promise 1); `data-fit` is the total the fit test holds to the pane.
  const fit = visible.reduce((sum, c) => sum + c.width, CHEVRON);
  const share = (w: number): string => `${String((w * 100) / fit)}%`;

  return (
    <table className="w-full table-fixed border-collapse text-left" data-fit={fit} {...hover}>
      <colgroup>
        {visible.map((c) => <col key={c.id} data-w={c.width} style={{ width: share(c.width) }} />)}
        <col data-w={CHEVRON} style={{ width: share(CHEVRON) }} />
      </colgroup>
      <thead>
        <tr className="h-[40px]">
          {visible.map((c) => (
            <th
              key={c.id}
              scope="col"
              className={cn(
                'border-b border-line/70 px-[12px] text-[13px] leading-[1.3] font-semibold text-text-2 first:pl-[20px]',
                c.align === 'right' ? 'text-right' : 'text-left',
              )}
            >
              {c.header}
            </th>
          ))}
          <th scope="col" className="border-b border-line/70 pr-[16px]">
            <span className="sr-only">Відкрити</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((r) => (
          <tr
            key={rowKey(r)}
            {...rowProps(r)}
            className={cn(
              'border-b border-line/70 last:border-b-0',
              onOpen === undefined ? null : 'cursor-pointer hover:bg-bench/55',
            )}
          >
            {visible.map((c, index) => (
              <td
                key={c.id}
                className={cn(
                  'h-[52px] px-[12px] py-[10px] align-middle text-[14px] text-ink first:pl-[20px]',
                  c.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                <div className={cn('flex items-center gap-[10px]', c.align === 'right' ? 'justify-end' : null)}>
                  {index === 0 && rule !== undefined ? <RowRule tone={rule(r).tone} live={rule(r).live} /> : null}
                  {/* `break-words`: under fixed layout a cell cannot widen its column, so a word longer than the
                      column would paint over the next one instead. It wraps. */}
                  <div className="min-w-0 break-words">
                    <div>{c.cell(r)}</div>
                    {(merged.get(c.id) ?? []).map((m) => (
                      <div key={m.id} className="text-[13px] leading-[1.4] text-text-2">
                        {m.mergedCell === undefined ? m.cell(r) : m.mergedCell(r)}
                      </div>
                    ))}
                  </div>
                </div>
              </td>
            ))}
            <td className="pr-[16px] text-right align-middle">
              <ChevronRight size={16} aria-hidden="true" className="inline-block shrink-0 text-ink opacity-55" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
