// mocks/driver-report/src/components/artefacts/SeatBackdrop.tsx
/**
 * The passenger seat a document is photographed on (§6.11): `--seat`, a 3 px diagonal weave at 4 % white, and the
 * artefact itself tipped −1.5° with a soft shadow under it.
 *
 * The tilt and the shadow are what make a drawn document read as a PHOTOGRAPH of a document rather than a file the
 * mock happens to hold — the same reason the ballpoint rows on the reverse are rotated. The shadow is a `box-shadow`,
 * never a CSS `filter`: the artefacts' one filter is the smudge on a soft page, and a test counts them.
 *
 * TWO THINGS HERE WERE MEASURED IN A BROWSER AT THE WAVE 2 EXIT GATE, and `fit.test.tsx` is the record of both.
 *
 * 1. THE INNER WRAPPER CARRIES A DEFINITE BOX. It used to be `max-h-full max-w-full` and nothing else, which caps
 *    without ever stretching — and because the outer is `items-center`, the flex default stretch is off as well. So
 *    it had no size, every `h-full`/`w-full` beneath it was a percentage of an indefinite box, and the whole chain
 *    resolved to **0×0**: the camera viewfinder, `ReviewSingle` and the «Ось так» card each drew an empty frame with
 *    the artefact present in the a11y tree. jsdom has no layout, so every test in this repo was green over it.
 *
 * 2. THE SHADOW IS ON THE PAPER, THE TILT IS ON THE BOX. This wrapper fills the seat, while the drawing inside it
 *    hugs its own ratio (see `FIT_SCALE` in catalogue.ts) — 455×601 against a 445×202 cluster. A `box-shadow` here
 *    therefore outlined a rectangle three times the height of the dashboard it was meant to sit under, plainly
 *    visible on the dark seat; on the «Ось так» card it was seven times the width of the receipt. It is set on the
 *    svg instead, which is the element that hugs. The ROTATION stays here on purpose: this wrapper turns about the
 *    same centre as the centred drawing inside it, so the picture is identical either way, and keeping it inline is
 *    what lets `artefacts.test.tsx` go on asserting it.
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
        className="flex h-full w-full items-center justify-center [&_svg]:[box-shadow:0_0.75rem_2rem_rgb(0_0_0/0.45)]"
        style={{ transform: 'rotate(-1.5deg)' }}
      >
        {children}
      </div>
    </div>
  );
}
