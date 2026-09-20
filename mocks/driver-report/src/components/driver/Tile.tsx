// mocks/driver-report/src/components/driver/Tile.tsx
/** The half-width tile of the action bar — «Заправка» and «Стою» (§3.3 D-02). 3.5rem, `tap-ring`, icon 1.5rem, the
 *  word 1.125rem/600 and one sub-line at 0.875rem `--text-2` that ellipses rather than wrapping, because a two-line
 *  tile pushes the primary out of the thumb zone.
 *
 *  `min-w-0` IS LOAD-BEARING, and it was missing until the Wave 2 exit gate measured this screen in a browser at the
 *  stage's own 360 px phone width (§5.2). A flex item's `min-width` defaults to `auto`, which floors it at its own
 *  min-content width — and `truncate` sets `white-space: nowrap`, so that floor is the WHOLE untruncated sub-line.
 *  The tile therefore refused to shrink and the ellipsis this docblock promises never happened: «Заправка» and
 *  «Стою» laid out 139 px + 257 px in a 328 px row, the second overflowed by 76 px, and the phone's scrollWidth was
 *  420 against a clientWidth of 360 — §8.2 D-02 #2 red on the first screen of the demo. With the floor removed the
 *  two tiles are 160 px + 160 px. `chrome.test.tsx` holds it. */
import type { JSX } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Tile({ icon: Icon, word, sub, onPress }: {
  icon: LucideIcon;
  word: string;
  sub: string;
  onPress(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onPress}
      className="tap-ring flex min-h-tap w-full min-w-0 flex-1 items-center gap-2 rounded-[12px] px-3 text-left"
    >
      <Icon aria-hidden="true" className="size-[1.5rem] shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[1.125rem] leading-[1.375rem] font-semibold">{word}</span>
        <span className="truncate text-[0.875rem] leading-[1.125rem] font-medium" style={{ color: 'var(--text-2)' }}>
          {sub}
        </span>
      </span>
    </button>
  );
}
