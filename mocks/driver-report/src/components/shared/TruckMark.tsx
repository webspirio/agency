// mocks/driver-report/src/components/shared/TruckMark.tsx
/** The product's Mark (§6.10): a trailer, a cab, three filled wheels and the road's dashes, drawn on a 24 × 24 grid in
 *  `currentColor` at stroke 1.5 with round caps. `--accent-ink` on light surfaces by default; a caller on ink (the
 *  sidebar brand, the stage bar) passes `text-accent-lift`. The favicon in index.html is the same drawing. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';

export function TruckMark({ size = 24, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0 text-accent-ink', className)}
    >
      <rect x={2} y={6.5} width={12} height={8} rx={1} />
      <path d="M14 9.5h4.2l2.3 3v2h-6.5z" />
      <g fill="currentColor" stroke="none">
        <circle cx={5.5} cy={16.5} r={1.7} />
        <circle cx={11} cy={16.5} r={1.7} />
        <circle cx={18} cy={16.5} r={1.7} />
      </g>
      <path d="M3 20.5h3M10 20.5h3M17 20.5h3" opacity={0.55} />
    </svg>
  );
}
