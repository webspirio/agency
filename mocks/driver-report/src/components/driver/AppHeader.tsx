// mocks/driver-report/src/components/driver/AppHeader.tsx
/** The app header of every non-flow driver screen (§3.1): the KTL lockup, a hairline divider, «Звіт водія», then the
 *  рейс number and the theme toggle.
 *
 *  The toggle is named for what it DOES, not for where it is: light → «Темна тема», dark → «Світла тема» (§8.5, the
 *  aria-label rule for an icon-only control). The choice is the kit's stored preference through `useDarkTheme`, so
 *  nothing here follows `prefers-color-scheme` (D15).
 *
 *  The рейс number is hidden below 22.5rem of viewport, which is the width at which the lockup, the title and the
 *  3rem toggle stop fitting on one 3.5rem row.
 *
 *  WHICH OF THE TWO GIVES WAY IS A DECISION, and it was the wrong one. Both the app name and the рейс number were
 *  free to shrink, and the app name is the flex item that came first, so at 130 % text on a 360 px phone it took
 *  the squeeze: «Звіт водія» needed 106 px of a 101 px cell and read «Звіт води…» (W3-05, measured at the gate
 *  size). The product's own name is the identity of the screen and the рейс number is a convenience, so the name
 *  is `shrink-0` and the number is the one that truncates. */
import type { JSX } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useDarkTheme } from '../../app/theme';
import { DC } from '../../copy/driver';
import { KtlLockup } from '../shared';

export function AppHeader({ tripNo }: { tripNo?: string }): JSX.Element {
  const { dark, setDark } = useDarkTheme();
  const Icon = dark ? Sun : Moon;
  return (
    <header
      className="sticky top-0 z-20 shrink-0 bg-label"
      style={{ boxShadow: 'inset 0 -1px 0 var(--line)' }}
    >
      <div className="mx-auto flex h-[3.5rem] w-full max-w-[35rem] items-center gap-2 pr-2 pl-gutter">
        <KtlLockup size={15} />
        <span aria-hidden="true" className="block h-[1.25rem] w-px shrink-0" style={{ background: 'var(--line-2)' }} />
        <span className="min-w-0 truncate text-[1.0625rem] leading-[1.375rem] font-semibold">{DC.appName}</span>
        <span className="ml-auto flex min-w-0 items-center gap-1">
          {tripNo === undefined ? null : (
            <span
              className="hidden min-w-0 truncate font-mono text-[0.875rem] font-medium min-[22.5rem]:inline"
              style={{ color: 'var(--text-2)' }}
            >
              {tripNo}
            </span>
          )}
          <button
            type="button"
            aria-label={dark ? 'Світла тема' : 'Темна тема'}
            onClick={() => { setDark(!dark); }}
            className="grid size-[3rem] shrink-0 place-items-center rounded-[10px]"
          >
            <Icon aria-hidden="true" className="size-[1.375rem]" />
          </button>
        </span>
      </div>
    </header>
  );
}
