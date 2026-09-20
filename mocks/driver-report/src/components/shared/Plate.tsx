// mocks/driver-report/src/components/shared/Plate.tsx
/** The Ukrainian number plate (§6.9): the one domain object with its own colour. A physical object, so it is identical
 *  in both themes; on a dark surface it only gains a 1 px `--line-2` outer ring to stay separated from the ink.
 *
 *  Every measurement is a fraction of the plate's height `h`, written as `calc(h * k)` so the rem heights of the driver
 *  route (md 2rem, lg 2.5rem) keep scaling with the OS text size and the console's sm stays at 22 px.
 *
 *  THE `min(…, vw)` IS THE ONE THING THAT IS NOT A PLAIN REM, and it is load-bearing at 200 % text. A plate is a
 *  PICTURE with a fixed aspect (about 4.15 : 1), so it cannot wrap, cannot truncate and cannot shrink — `shrink-0` is
 *  correct, because half a licence plate is not a licence plate. At 200 % root size a `lg` plate is 80 px tall and
 *  therefore 332 px wide, which is wider than the 360 px gate phone's content column: MEASURED on «Почати зміну»,
 *  where two of them drove `documentElement.scrollWidth` to 425 and §8.5's «no horizontal scroll at 200 %» failed.
 *  The cap binds only when the text scale would push the plate past the viewport: at 100 % and 130 %, on 360 px and
 *  390 px alike, `2rem`/`2.5rem` still win the `min()` and nothing moves. Inside the stage the phone is an iframe, so
 *  `vw` is that pane's own width and the plate is identical to the standalone phone's. */
import type { JSX } from 'react';

const HEIGHT = { sm: '22px', md: 'min(2rem, 11vw)', lg: 'min(2.5rem, 13vw)' } as const;

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
