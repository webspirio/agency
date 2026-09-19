// mocks/driver-report/src/components/driver/PrimaryAction.tsx
/** The ONE accent-filled button of a driver screen: the one that advances the state (§3.1). Every other control on the
 *  screen is outline or quiet, so «що мені зараз робити?» is answered by the fill and not by reading.
 *
 *  It renders `data-accent=""`, and a screen test counts `[data-accent]` — one per screen. That is the only mechanical
 *  form the "exactly one" rule has; a colour cannot be counted.
 *
 *  `busy` is the double-tap guard made visible (EC-137): the verb becomes «Записую…», the button takes
 *  `aria-disabled` rather than `disabled` (a disabled button drops out of the a11y tree mid-sentence) and
 *  `pointer-events: none` stops the second tap. There is never a second button to reach for.
 *
 *  On a dark surface the fill is `--cam-accent` with `--cam-accent-ink` text, which is 9.27:1; on light it is
 *  `--accent-ink` with white, 9.40:1 (§8.5). */
import type { JSX } from 'react';
import type { LucideIcon } from 'lucide-react';
import { DC } from '../../copy/driver';

export function PrimaryAction({ icon: Icon, verb, place, busy = false, dark = false, onPress }: {
  icon: LucideIcon;
  verb: string;
  place?: string | null;
  busy?: boolean;
  dark?: boolean;
  onPress(): void;
}): JSX.Element {
  const twoLine = place !== undefined && place !== null && place !== '';
  return (
    <button
      type="button"
      data-accent=""
      aria-disabled={busy ? true : undefined}
      onClick={busy ? undefined : onPress}
      className={`flex w-full items-center gap-3 rounded-[14px] px-4 text-left ${
        twoLine ? 'h-tap-xl py-2' : 'h-tap-lg'
      } ${busy ? 'pointer-events-none' : ''}`}
      style={{
        background: dark ? 'var(--cam-accent)' : 'var(--accent-ink)',
        color: dark ? 'var(--cam-accent-ink)' : '#ffffff',
      }}
    >
      <Icon aria-hidden="true" className="size-[1.75rem] shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[1.25rem] leading-[1.5rem] font-semibold">{busy ? DC.primary.busy : verb}</span>
        {twoLine ? <span className="text-[1rem] leading-[1.375rem] font-medium">{place}</span> : null}
      </span>
    </button>
  );
}
