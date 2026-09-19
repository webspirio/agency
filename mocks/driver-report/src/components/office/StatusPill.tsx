// mocks/driver-report/src/components/office/StatusPill.tsx
/** The office's status grammar, whole: 2 px rule · 14 px icon · 13 px/500 word (§4.1, §6.6).
 *
 *  Three carriers, never one. Colour alone would vanish in a grayscale screenshot and for a viewer who cannot tell
 *  ochre from ink; the icon and the word survive both (§8.5).
 *
 *  THE ACCENT IS NOT A TONE (D10). `--accent-ink` fills one state-advancing button per driver screen and draws the
 *  `cl-stem`; a «Прийнято» pill is plain ink with `CheckCheck`, which is why `shell.test.tsx` asserts the rendered
 *  markup of a plain pill contains no `accent` at all. `reject` is the brick, and it is office-only — no driver
 *  surface may reach these classes (§6.6, §8.6 #4). */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import type { LucideIcon } from 'lucide-react';
import type { Tone } from '../../domain/types';

const WORD: Record<Tone, string> = {
  plain: 'text-ink',
  hold: 'text-hold',
  reject: 'text-reject',
  muted: 'text-text-2',
};
const RULE: Record<Tone, string> = {
  plain: 'bg-ink',
  hold: 'bg-hold',
  reject: 'bg-reject',
  muted: 'bg-text-2',
};

export function StatusPill({ tone, icon: Icon, word }: { tone: Tone; icon: LucideIcon; word: string }): JSX.Element {
  return (
    <span
      data-tone={tone}
      className={cn('inline-flex items-center gap-[6px] align-middle whitespace-nowrap text-[13px] font-medium leading-[1.4]', WORD[tone])}
    >
      <span aria-hidden="true" className={cn('inline-block h-[14px] w-[2px] shrink-0 rounded-[1px]', RULE[tone])} />
      <Icon size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      {word}
    </span>
  );
}
