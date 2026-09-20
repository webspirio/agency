// mocks/driver-report/src/stage/bar/BarMenu.tsx
/** The one menu the presenter bar has, wearing three labels: «Такт ▾» (§5.4 #9), «Перемотати до… ▾» (#5) and «⋯»
 *  (#11).
 *
 *  Plain buttons under `role="menu"` rather than the kit's radix popover, for the reason W2-10 wrote down when it
 *  built the first of them: the bar is dark chrome outside both products' token sets, and a portal into `body`
 *  would carry `bg-popover` and a product border onto the stage. Nothing here needs a portal, a focus trap or an
 *  animation — it needs to open, to close on Esc and on a click anywhere else, and to be addressable by role.
 *
 *  OPEN IS A PROP, NOT STATE. «T» and «R» open two of these from the keyboard and Esc closes whichever is open
 *  (§5.10), so the one thing the three must agree on is which of them is open — and that is the stage page's to
 *  know, not each menu's. */
import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { BAR_CONTROL } from './StageToggle';

/** A row in one of these menus: full width, left-aligned, the bar's own hover and focus ring. */
export const BAR_MENU_ITEM =
  'flex w-full items-center justify-between gap-[12px] px-[12px] py-[6px] text-left text-[13px] font-medium '
  + 'text-stage-text hover:bg-[#1b242a] focus-visible:outline-2 focus-visible:-outline-offset-2 '
  + 'focus-visible:outline-stage-accent aria-disabled:text-stage-text-2/60 aria-disabled:hover:bg-transparent';

export function BarMenu({
  label,
  name,
  open,
  onOpen,
  disabled = false,
  align = 'start',
  width,
  children,
}: {
  /** What the trigger says, and — because nothing overrides it — its accessible name. */
  label: string;
  /** The menu's own accessible name: the trigger's sentence without the ▾. */
  name: string;
  open: boolean;
  onOpen(open: boolean): void;
  /** Visible and unavailable, never absent: a control that disappears is one the presenter has to look for. */
  disabled?: boolean;
  /** Which edge the panel hangs from. MEASURED IN CHROME, 2026-09-20: «⋯» sits at x = 1 181 on the 1 440 px canvas,
   *  so a 320 px panel hung from its LEFT edge ended at 1 501 — 61 px past a canvas that is `overflow-hidden`, with
   *  the right of every row cut off and nothing red anywhere. jsdom reports zeros for every rect, so no test in this
   *  tree could have caught it. A control in the last third of the bar hangs its panel from the right. */
  align?: 'start' | 'end';
  width: number;
  children: ReactNode;
}): JSX.Element {
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: PointerEvent): void => {
      const el = box.current;
      if (el !== null && e.target instanceof Node && !el.contains(e.target)) onOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); };
  }, [open, onOpen]);

  return (
    <div
      ref={box}
      className="relative shrink-0"
      onKeyDown={(e) => { if (e.key === 'Escape') onOpen(false); }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { onOpen(!open); }}
        className={BAR_CONTROL}
      >
        {label}
      </button>
      {open && !disabled ? (
        <div
          role="menu"
          aria-label={name}
          style={{ width }}
          className={cn(`absolute top-[36px] z-20 overflow-hidden rounded-[8px] bg-stage-bar py-[4px]
            shadow-[0_24px_60px_-20px_rgb(0_0_0/.9)] ring-1 ring-white/[0.10]`,
            align === 'end' ? 'right-0' : 'left-0')}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
