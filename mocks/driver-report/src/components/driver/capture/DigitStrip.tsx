// mocks/driver-report/src/components/driver/capture/DigitStrip.tsx
/** The odometer window of the dash photo, enlarged (§3.3 D-09 tier 2): 4.5rem tall, full width, radius 12, a 1 px
 *  `--cam-ring` boundary, the digits in JetBrains Mono at twice the size they have on the cluster. On a drawn photo
 *  those digits ARE the artefact's LCD line — there is no crop to take, so the strip renders them itself rather than
 *  pretending to zoom into an image.
 *
 *  It exists because the driver is asked to compare, not to read: the number the app offers sits directly under the
 *  digits it came from, at a size that survives a sunlit cab.
 *
 *  `boxedIndex` is the digit question's pointer (§3.3 D-09, EC-15): a 3 px `--cam-hold` outline on ONE position, the
 *  only place the app admits doubt. The state is in `data-boxed` as well as in the outline, so a test can read it and
 *  a grayscale screenshot keeps it. */
import type { JSX } from 'react';

export function DigitStrip({ digits, boxedIndex }: { digits: string; boxedIndex?: number }): JSX.Element {
  return (
    <div
      role="img"
      aria-label={digits}
      data-digit-strip=""
      className="flex h-[4.5rem] w-full items-center justify-center gap-[0.25rem] rounded-[12px] px-3"
      style={{ background: 'var(--cam-surface)', boxShadow: 'inset 0 0 0 1px var(--cam-ring)' }}
    >
      {[...digits].map((digit, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-boxed={i === boxedIndex ? '' : undefined}
          className="flex h-[3.25rem] min-w-[1.75rem] items-center justify-center rounded-[6px] px-[0.125rem] font-mono text-[2.25rem] leading-none font-semibold"
          style={{
            color: 'var(--cam-ink)',
            boxShadow: i === boxedIndex ? 'inset 0 0 0 3px var(--cam-hold)' : undefined,
          }}
        >
          {digit}
        </span>
      ))}
    </div>
  );
}
