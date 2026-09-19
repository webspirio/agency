// mocks/driver-report/src/components/office/RowRule.tsx
/** The 2 × 28 px tone rule that opens every console row (§4.1 «Tables», §6.6 office tones).
 *
 *  It is decorative — `aria-hidden`, and never the only carrier of a state: the row always says the same thing in
 *  words (§8.5 «Status is never colour alone»), so a grayscale screenshot loses nothing.
 *
 *  `live` is NOT a fifth tone and is not a status (D10): it is the 3 px accent stroke that marks the row a driver's
 *  record just changed, the same accent the `cl-stem` draws under `LiveLine`, and it lasts `LIVE_MS` (§5.9). */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import type { Tone } from '../../domain/types';

const FILL: Record<Tone, string> = {
  plain: 'bg-ink',
  hold: 'bg-hold',
  reject: 'bg-reject',
  muted: 'bg-text-2',
};

export function RowRule({ tone, live }: { tone: Tone; live?: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cn(
        'inline-block h-[28px] shrink-0 rounded-[1px]',
        live === true ? 'w-[3px] bg-accent-ink' : cn('w-[2px]', FILL[tone]),
      )}
    />
  );
}
