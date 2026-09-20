// mocks/driver-report/src/stage/bar/BeatMenu.tsx
/** «Такт ▾» — the fourteen beats of §5.6, each with its clock (§5.4 #9).
 *
 *  Choosing one rebuilds the whole demo deterministically (§5.8): a fresh server from the seed, every entry of an
 *  earlier beat plus every AUTO entry up to the beat's clock, the clock set there, every toggle off and all four
 *  panes reloaded. That is the recovery for anything that went wrong on stage, so it must be reachable in one tap
 *  from anywhere — which is why it is a bar control and not a hidden-menu item, and why «T» opens it (§5.10).
 *
 *  The panel, the click-outside and the Esc are `BarMenu`'s, shared with «Перемотати до… ▾» and «⋯». Its OPEN state
 *  is the stage page's, because «T» and «R» open two of these from the keyboard and Esc closes whichever is open —
 *  so which one that is has to be known in one place. */
import type { JSX } from 'react';
import { fmtTime } from '../../app/format';
import { BEATS } from '../../domain/script';
import { BarMenu, BAR_MENU_ITEM } from './BarMenu';

export function BeatMenu({
  open,
  onOpen,
  onPick,
}: {
  open: boolean;
  onOpen(open: boolean): void;
  onPick(n: number): void;
}): JSX.Element {
  return (
    <BarMenu label="Такт ▾" name="Такт" open={open} onOpen={onOpen} width={360}>
      {BEATS.map((b) => (
        <button
          key={b.n}
          type="button"
          role="menuitem"
          onClick={() => { onOpen(false); onPick(b.n); }}
          className={BAR_MENU_ITEM}
        >
          <span>{b.title}</span>
          <span className="font-mono text-stage-text-2">{fmtTime(b.clock)}</span>
        </button>
      ))}
    </BarMenu>
  );
}
