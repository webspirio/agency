// mocks/driver-report/src/stage/bar/StageToggle.tsx
/** One of the three stage conditions — «Офлайн», «Швидкість 60 км/год», «GPS зник» (§5.4 #6–#8).
 *
 *  A toggle SAYS its state in words, never in colour alone: on, it renders «<label>: увімкнено» in `--stage-hold` on
 *  `--stage-hold-bg`. Below 1 440 px the bar drops the off-state word and keeps the icon (§5.2), so the accessible
 *  name comes from `aria-label` rather than from the text — the presenter's screen reader and the test both read the
 *  same sentence at every window size, and the bar still fits at 1 280.
 *
 *  The disabled form is the whole point of «GPS зник» being on the bar at all (D3): it is visible, and unavailable,
 *  while an RG phone is framed, which is what removes the misclick that made the lead hide it. `title` carries the
 *  reason; it never becomes the accessible name, because `aria-label` is always set. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import type { LucideIcon } from 'lucide-react';

/** Every control on the bar: 32 px tall, radius 8, hover `#1b242a`, focus ring 2 px `--stage-accent` (§5.4). */
export const BAR_CONTROL =
  'flex h-[32px] shrink-0 items-center gap-[6px] rounded-[8px] px-[8px] text-[13px] font-medium '
  + 'text-stage-text hover:bg-[#1b242a] focus-visible:outline-2 focus-visible:outline-offset-1 '
  + 'focus-visible:outline-stage-accent disabled:cursor-not-allowed disabled:text-stage-text-2/60 '
  + 'disabled:hover:bg-transparent';

export function StageToggle({
  icon: Icon,
  label,
  on,
  compact,
  disabled = false,
  hint,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  on: boolean;
  compact: boolean;
  disabled?: boolean;
  hint?: string;
  onPress(): void;
}): JSX.Element {
  const said = `${label}: увімкнено`;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? said : label}
      title={hint}
      disabled={disabled}
      onClick={onPress}
      className={cn(BAR_CONTROL, on && 'bg-stage-hold-bg text-stage-hold hover:bg-stage-hold-bg')}
    >
      <Icon size={15} aria-hidden="true" />
      {on ? <span>{said}</span> : compact ? null : <span>{label}</span>}
    </button>
  );
}
