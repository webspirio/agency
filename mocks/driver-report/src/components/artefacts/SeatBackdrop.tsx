// mocks/driver-report/src/components/artefacts/SeatBackdrop.tsx
/**
 * The passenger seat a document is photographed on (§6.11): `--seat`, a 3 px diagonal weave at 4 % white, and the
 * artefact itself tipped −1.5° with a soft shadow under it.
 *
 * The tilt and the shadow are what make a drawn document read as a PHOTOGRAPH of a document rather than a file the
 * mock happens to hold — the same reason the ballpoint rows on the reverse are rotated. The shadow is a `box-shadow`,
 * never a CSS `filter`: the artefacts' one filter is the smudge on a soft page, and a test counts them.
 */
import type { JSX, ReactNode } from 'react';

export function SeatBackdrop({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden p-[6%]"
      style={{
        backgroundColor: 'var(--seat)',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.04) 0 1px, rgb(255 255 255 / 0) 1px 3px)',
      }}
    >
      <div
        className="flex max-h-full max-w-full items-center justify-center"
        style={{ transform: 'rotate(-1.5deg)', boxShadow: '0 0.75rem 2rem rgb(0 0 0 / 0.45)' }}
      >
        {children}
      </div>
    </div>
  );
}
