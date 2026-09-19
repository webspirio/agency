// mocks/driver-report/src/components/shared/Plate.tsx
/** The Ukrainian number plate (§6.9): the one domain object with its own colour. A physical object, so it is identical
 *  in both themes; on a dark surface it only gains a 1 px `--line-2` outer ring to stay separated from the ink.
 *
 *  Every measurement is a fraction of the plate's height `h`, written as `calc(h * k)` so the rem heights of the driver
 *  route (md 2rem, lg 2.5rem) keep scaling with the OS text size and the console's sm stays at 22 px. */
import type { JSX } from 'react';

const HEIGHT = { sm: '22px', md: '2rem', lg: '2.5rem' } as const;

export function Plate({ plate, size, onDark = false }: { plate: string; size: 'sm' | 'md' | 'lg'; onDark?: boolean }): JSX.Element {
  const h = HEIGHT[size];
  const of = (k: string): string => `calc(${h} * ${k})`;
  return (
    <span
      role="img"
      aria-label={`Номер ${plate}`}
      className="inline-flex shrink-0 select-none items-stretch overflow-hidden whitespace-nowrap align-middle leading-none"
      style={{
        height: h,
        borderRadius: of('0.15'),
        border: `${size === 'sm' ? '1px' : '1.5px'} solid var(--plate-ink)`,
        background: 'var(--plate-bg)',
        boxShadow: onDark ? '0 0 0 1px var(--line-2)' : undefined,
      }}
    >
      <span
        className="flex flex-col items-center justify-between"
        style={{ width: of('0.34'), background: 'var(--plate-band)', paddingBlock: of('0.1') }}
      >
        <span
          className="block"
          style={{
            width: of('0.22'),
            height: of('0.16'),
            background: 'linear-gradient(to bottom, var(--plate-flag-blue) 50%, var(--plate-flag-yellow) 50%)',
          }}
        />
        <span className="block font-sans font-semibold" style={{ fontSize: of('0.26'), color: 'var(--plate-bg)' }}>
          UA
        </span>
      </span>
      <span
        className="flex items-center font-mono font-semibold"
        style={{ fontSize: of('0.56'), letterSpacing: '0.04em', paddingInline: of('0.28'), color: 'var(--plate-ink)' }}
      >
        {plate.replaceAll(' ', ' ')}
      </span>
    </span>
  );
}
