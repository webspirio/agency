// mocks/driver-report/src/stage/bar/PhoneSwitch.tsx
/** Which phone is in the frame (§5.4 #4). All three iframes stay mounted and live; this moves the frame, so
 *  switching is instant, neither pane reloads or reseeds, and a phone keeps the screen it was left on (§5.1).
 *
 *  The visible label shortens to the first name below 1 440 px (§5.2), but `aria-label` always carries the full
 *  segment — «Ruptela-машина · Олег» is the sentence that tells the audience WHICH machine they are looking at, and
 *  a control whose name changes with the window is a control no test and no screen reader can address twice. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { STAGE_PHONES } from '../hub';
import { BAR_CONTROL } from './StageToggle';

export function PhoneSwitch({
  phone,
  compact,
  onSelect,
}: {
  phone: string;
  compact: boolean;
  onSelect(deviceId: string): void;
}): JSX.Element {
  return (
    <div role="radiogroup" aria-label="Телефон у рамці" className="flex shrink-0 items-center gap-[2px]">
      {STAGE_PHONES.map((p) => {
        const on = p.id === phone;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={p.segment}
            onClick={() => onSelect(p.id)}
            className={cn(BAR_CONTROL, 'border-b-2 border-transparent rounded-b-none',
              on && 'border-stage-accent bg-[#1b242a]')}
          >
            {compact ? p.short : p.segment}
          </button>
        );
      })}
    </div>
  );
}
