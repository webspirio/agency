// mocks/driver-report/src/pages/office/stop/ZoomInset.tsx
/**
 * The 2× crop the operator types against (§4.2 C-04, §8.3 C-04 #4): focusing «Прибуття» puts the reverse's
 * operations table beside the field at twice the size the photo column shows it, with the one cell being copied
 * outlined in `--accent-ink`.
 *
 * WHY A CROP AND NOT A BIGGER PHOTO. The page in the photo column is a whole A4 at column width; the handwritten
 * mark inside it is about four millimetres tall, which is exactly the size at which an operator stops trusting what
 * they read and starts typing what they remember. The crop is the answer the spec gives — and it is a crop of the
 * TABLE, not of the cell, because the columns either side («Операція», «Вибуття») are what say the number under the
 * cursor is the arrival and not the departure.
 *
 * EXACTLY 2×, AND THAT IS ARITHMETIC RATHER THAN A CHOICE. The window is half the page wide (`VIEW_W = A4_W / 2`),
 * so the page drawn to fill it is drawn at twice the scale the photo column draws it at. Everything else here is
 * that one decision projected into percentages: the artefact kit draws A4 into a `0 0 210 297` viewBox (§6.11), so
 * millimetres ARE the coordinate system and every offset below is a millimetre divided by a millimetre.
 *
 * The outline is drawn OVER the artefact rather than inside it, because `Artefact` takes a variant and nothing else
 * (I-15) and a page may not reach into the drawing to add a rectangle. The cell geometry is therefore duplicated
 * here from `components/artefacts/TtnBack.tsx`; the drawing carries `data-cell="arrival"` for the same reason, and
 * the two would drift apart silently — which is why the caption says what is outlined in words as well.
 */
import type { JSX } from 'react';
import { Artefact } from '../../../components/artefacts';

/** The artefact kit's A4, in millimetres (`viewBox="0 0 210 297"`). */
const A4_W = 210;
const A4_H = 297;
/** «ВАНТАЖНО-РОЗВАНТАЖУВАЛЬНІ ОПЕРАЦІЇ»: an 11 mm header at y 44 and two 18 mm rows under it. */
const TABLE_TOP = 44;
const TABLE_BOTTOM = 91;
/** The one row the loading point fills in by hand. */
const ROW_TOP = 55;
const ROW_BOTTOM = 73;
/** Column edges of «Операція · Маса брутто, т · Прибуття · Вибуття · Час простою · Підпис». */
const CELL = {
  gross: { x0: 62, x1: 92 },
  arrival: { x0: 92, x1: 118 },
  departure: { x0: 118, x1: 144 },
} as const;

export type ZoomCell = keyof typeof CELL;

/** Half the page across: the page inside the window is therefore drawn at 2× the photo column's scale. */
const VIEW_W = A4_W / 2;
const VIEW_H = TABLE_BOTTOM - TABLE_TOP;

const pct = (v: number): string => `${Math.round(v * 1000) / 1000}%`;

export function ZoomInset({ variant, cell, caption }: {
  variant: string;
  cell: ZoomCell;
  caption: string;
}): JSX.Element {
  const c = CELL[cell];
  const centre = (c.x0 + c.x1) / 2;
  // The window slides along the page to keep the cell in the middle, and stops at either edge of the paper.
  const x0 = Math.min(Math.max(centre - VIEW_W / 2, 0), A4_W - VIEW_W);
  // The page, measured in windows: 2 across, and as many down as A4 is tall at that scale.
  const pageW = (A4_W / VIEW_W) * 100;
  const pageH = (A4_H / VIEW_H) * 100;

  return (
    <figure data-zoom-inset={cell} className="flex flex-col gap-[6px]">
      <div
        className="relative w-full overflow-hidden rounded-[10px] border border-line bg-paper"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      >
        <div
          className="absolute"
          style={{
            width: pct(pageW),
            height: pct(pageH),
            left: pct(-(x0 / A4_W) * pageW),
            top: pct(-(TABLE_TOP / A4_H) * pageH),
          }}
        >
          <Artefact variant={variant} size="view" />
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: pct(((c.x0 - x0) / VIEW_W) * 100),
            top: pct(((ROW_TOP - TABLE_TOP) / VIEW_H) * 100),
            width: pct(((c.x1 - c.x0) / VIEW_W) * 100),
            height: pct(((ROW_BOTTOM - ROW_TOP) / VIEW_H) * 100),
            outline: '2px solid var(--accent-ink)',
          }}
        />
      </div>
      <figcaption className="text-[12px] leading-[1.4] text-text-2">{caption}</figcaption>
    </figure>
  );
}
