// mocks/driver-report/src/components/driver/MotionLock.tsx
/** «Ви в дорозі» (§3.3 D-19). While the truck moves, nothing asks for attention: a full-viewport overlay on
 *  `--lock-bg` in either theme, four lines of text, and NOTHING else.
 *
 *  What is absent is the component (§8.6 #19). No button, because a button is something to press while driving. No
 *  count and no dot, because a badge that says «2» is a reason to look. No sound. A request that arrives while this
 *  is up stays invisible until it comes down. It renders from `nextStop` alone, so there is nothing else it COULD
 *  show — and the test that counts zero buttons and zero digits is what keeps it that way.
 *
 *  `role="status"` with `aria-live="polite"`: it announces itself once and never steals focus.
 *
 *  The 200 ms is an opacity fade IN (§6.8). The fade OUT belongs to whoever unmounts it — `useMotionLock` decides
 *  when the truck has stopped, and an exit animation needs the element to outlive that decision — so this component
 *  does not pretend to own it. */
import type { JSX } from 'react';
import { Truck } from 'lucide-react';
import { DC } from '../../copy/driver';

export function MotionLock({ nextStop }: { nextStop: string }): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      data-surface="dark"
      className="fixed inset-0 z-50 flex flex-col items-start px-6 duration-200 animate-in fade-in"
      style={{ background: 'var(--lock-bg)', paddingTop: '35dvh' }}
    >
      <Truck aria-hidden="true" className="size-[2.5rem]" style={{ color: 'var(--lock-text-2)' }} />
      <p className="mt-4 text-[2rem] leading-[2.5rem] font-semibold" style={{ color: 'var(--lock-ink)' }}>
        {DC.lock.title}
      </p>
      <p className="mt-2 text-[1.375rem] leading-[1.75rem] font-medium" style={{ color: 'var(--lock-text-2)' }}>
        {nextStop}
      </p>
      <p className="mt-4 text-[1.25rem] leading-[1.625rem]" style={{ color: 'var(--lock-text-2)' }}>
        {DC.lock.hint}
      </p>
    </div>
  );
}
