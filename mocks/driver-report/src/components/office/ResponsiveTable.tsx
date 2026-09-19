// mocks/driver-report/src/components/office/ResponsiveTable.tsx
/** Every list in the console, and the four promises §4.1 makes about one.
 *
 *  1. NEVER A HORIZONTAL SCROLL. A column is dropped at `compact`/`rail` by `hideAt`, and where it still matters it
 *     names a `mergeInto` column and becomes that column's second line. A console the office has to scroll sideways
 *     is a console they read one half of.
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
  width?: number;
  hideAt?: ('compact' | 'rail')[];
  mergeInto?: string;
  align?: 'left' | 'right';
};

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

  return (
    <table className="w-full border-collapse text-left" {...hover}>
      <thead>
        <tr className="h-[40px]">
          {visible.map((c) => (
            <th
              key={c.id}
              scope="col"
              style={c.width === undefined ? undefined : { width: `${c.width}px` }}
              className={cn(
                'border-b border-line/70 px-[12px] text-[13px] leading-[1.3] font-semibold text-text-2 first:pl-[20px]',
                c.align === 'right' ? 'text-right' : 'text-left',
              )}
            >
              {c.header}
            </th>
          ))}
          <th scope="col" className="w-[40px] border-b border-line/70 pr-[16px]">
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
                  <div className="min-w-0">
                    <div>{c.cell(r)}</div>
                    {(merged.get(c.id) ?? []).map((m) => (
                      <div key={m.id} className="text-[13px] leading-[1.4] text-text-2">
                        {m.cell(r)}
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
