// mocks/driver-report/src/stage/bar/BeatMenu.tsx
/** «Такт ▾» — the fourteen beats of §5.6, each with its clock (§5.4 #9).
 *
 *  Choosing one rebuilds the whole demo deterministically (§5.8): a fresh server from the seed, every entry of an
 *  earlier beat plus every AUTO entry up to the beat's clock, the clock set there, every toggle off and all four
 *  panes reloaded. That is the recovery for anything that went wrong on stage, so it must be reachable in one tap
 *  from anywhere — which is why it is a bar control and not a hidden-menu item.
 *
 *  Kept as plain buttons under `role="menu"` rather than a kit popover: the bar is dark chrome outside both
 *  products' token sets, and this needs no portal, no focus trap and no animation. Esc closes it (§5.10), and so
 *  does a pointer anywhere else. */
import { useEffect, useRef, useState, type JSX } from 'react';
import { fmtTime } from '../../app/format';
import { BEATS } from '../../domain/script';
import { BAR_CONTROL } from './StageToggle';

export function BeatMenu({ onPick }: { onPick(n: number): void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: PointerEvent): void => {
      const el = box.current;
      if (el !== null && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); };
  }, [open]);

  return (
    <div
      ref={box}
      className="relative shrink-0"
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={BAR_CONTROL}
      >
        Такт ▾
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Такт"
          className="absolute left-0 top-[36px] z-20 w-[360px] overflow-hidden rounded-[8px] bg-stage-bar py-[4px]
            shadow-[0_24px_60px_-20px_rgb(0_0_0/.9)] ring-1 ring-white/[0.10]"
        >
          {BEATS.map((b) => (
            <button
              key={b.n}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onPick(b.n); }}
              className="flex w-full items-center justify-between gap-[12px] px-[12px] py-[6px] text-left text-[13px]
                font-medium text-stage-text hover:bg-[#1b242a] focus-visible:outline-2
                focus-visible:-outline-offset-2 focus-visible:outline-stage-accent"
            >
              <span>{b.title}</span>
              <span className="font-mono text-stage-text-2">{fmtTime(b.clock)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
