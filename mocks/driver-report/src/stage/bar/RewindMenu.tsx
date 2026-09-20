// mocks/driver-report/src/stage/bar/RewindMenu.tsx
/** «Перемотати до… ▾» (§5.4 #5) — the ten script checkpoints of §5.6, and only the ones still AHEAD of the demo
 *  clock.
 *
 *  Forward only, and that is a property of the runner rather than of this list: `rewindTo` returns without doing
 *  anything when its moment is not after the clock, because "rewinding" to 06:10 at 12:30 would mean unwriting
 *  eleven records. So the menu shows what the presenter can actually reach — at «Такт 8» that is four rows, not
 *  ten — and a demo that has run past the last checkpoint offers an empty control rather than a lying one.
 *
 *  What a row DOES is skip the dead time: every undone script entry before its moment is applied through the same
 *  route table a live tap uses, the clock is set there, and every bound phone sends a heartbeat, so nothing the
 *  script does not contain (a «Без зв'язку» banner, a 2 h unseen request) appears on the way. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { fmtTime } from '../../app/format';
import type { Instant } from '../../domain/types';
import { checkpointsAfter } from '../runner';
import { BarMenu, BAR_MENU_ITEM } from './BarMenu';

export function RewindMenu({
  now,
  open,
  onOpen,
  onPick,
}: {
  now: Instant;
  open: boolean;
  onOpen(open: boolean): void;
  onPick(at: Instant): void;
}): JSX.Element {
  const ahead = checkpointsAfter(now);
  return (
    <BarMenu
      label="Перемотати до… ▾"
      name="Перемотати до…"
      open={open}
      onOpen={onOpen}
      disabled={ahead.length === 0}
      width={280}
    >
      {ahead.map((c) => (
        <button
          key={c.at}
          type="button"
          role="menuitem"
          onClick={() => { onOpen(false); onPick(c.at); }}
          className={cn(BAR_MENU_ITEM, 'justify-start gap-0')}
        >
          {/* Two spans and no gap, so the row reads «12:30 · тривога» as ONE string — the time in mono, as every
              time in this product is (§6.1), without a space the separator did not ask for. */}
          <span className="font-mono">{fmtTime(c.at)}</span>
          <span>{` · ${c.label}`}</span>
        </button>
      ))}
    </BarMenu>
  );
}
