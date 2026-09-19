// mocks/driver-report/src/components/office/review/ReasonChips.tsx
/** The one reason control of the console (§4.2 C-02, C-03, C-05, C-06): 32 px chips, one row, no dropdown.
 *
 *  Every «why» in the review lane is a CLOSED set — three resolve reasons, nine correction reasons, five retake
 *  reasons — and a closed set is a row of chips, not a select: the operator reads all of them at once and picks with
 *  one click, which is what makes «З'ясовано» impossible to complete without saying why (§8.3 C-02/C-03 #3).
 *
 *  Chips are `<button>`s carrying `aria-pressed`, NOT menu items. That is load-bearing rather than incidental: a
 *  radix `DropdownMenu.Item` renders `role="menuitem"`, and the kit's own contract for this row — the pinned test —
 *  asks for `getByRole('button', { name: 'Не є проблемою' })`. A toggle button also says its state to a screen
 *  reader, which a menu item cannot.
 *
 *  `multi` decides the arithmetic and nothing else: single-select answers with `[value]` (so a second click on the
 *  same chip re-confirms rather than clearing — a reason is required, and an empty answer would be a trap), and
 *  multi-select toggles membership. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';

const CHIP = 'inline-flex h-[32px] shrink-0 cursor-pointer items-center rounded-[8px] border px-[12px] '
  + 'text-[13px] leading-none font-medium whitespace-nowrap transition-colors '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';
const ON = 'border-ink bg-ink text-label';
const OFF = 'border-line-strong bg-label text-ink hover:bg-bench';

export function ReasonChips<T extends string>({ options, value, multi = false, onChange }: {
  options: { value: T; label: string }[];
  value: T[];
  multi?: boolean;
  onChange(v: T[]): void;
}): JSX.Element {
  const chosen = new Set<string>(value);
  const pick = (v: T): void => {
    if (!multi) return onChange([v]);
    onChange(chosen.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div role="group" className="flex flex-wrap items-center gap-[8px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={chosen.has(o.value)}
          onClick={() => pick(o.value)}
          className={cn(CHIP, chosen.has(o.value) ? ON : OFF)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
