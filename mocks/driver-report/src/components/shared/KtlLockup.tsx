// mocks/driver-report/src/components/shared/KtlLockup.tsx
/** The client's identity (§6.10): «KTL» in Onest 600, letter-spacing 0.08 em, with a 2 px rule of the same colour under
 *  the word — the logo's underline, and the echo of the accent stem. `--accent-ink` on light surfaces, `--accent-lift`
 *  on dark ones. `size` is the cap size in CSS pixels; the driver route renders it in rem so it follows the OS text size.
 *
 *  The trailing letter-spacing is cancelled with an equal negative margin, so the rule spans the glyphs and not the
 *  invisible space after the «L». */
import type { JSX } from 'react';
import { PROFILE_ID } from '../../app/device';

const length = (px: number): string => (PROFILE_ID === 'driver' ? `${px / 16}rem` : `${px}px`);

export function KtlLockup({ size, onDark = false }: { size: number; onDark?: boolean }): JSX.Element {
  const tone = onDark ? 'text-accent-lift' : 'text-accent-ink';
  return (
    <span
      className={`inline-flex shrink-0 flex-col items-stretch font-sans font-semibold leading-none ${tone}`}
      style={{ fontSize: length(size) }}
    >
      <span style={{ letterSpacing: '0.08em', marginRight: '-0.08em' }}>KTL</span>
      <span aria-hidden="true" className="mt-[0.14em] block h-[2px] bg-current" />
    </span>
  );
}
