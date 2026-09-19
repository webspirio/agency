// mocks/driver-report/src/app/capture/similarity.ts
/**
 * «Схоже, та сама сторінка двічі» (§3.3 D-06, EC-137): the two ways two shots can be the same page.
 *
 * DRAWN pages are the easy half and the only half the stage reaches — the same drawn variant twice IS the same page,
 * because the viewfinder showed one document and the driver shot it twice.
 *
 * REAL frames are compared at the ≤ 400 px thumbnail `grabFrame` already made, never at the kept picture: two shots
 * of one page differ in the last JPEG byte and agree in the thumbnail. The thumbnail is not on `CapturedPage` — that
 * type is the wire body's shape (I-10) and a thumbnail is never sent — so the engine leaves it here, keyed by the
 * picture it belongs to, and this module falls back to comparing the pictures themselves when it has none. The
 * fallback can only ever MISS a duplicate; it cannot invent one, and a missed duplicate costs the driver one extra
 * «Перезняти» rather than a wrong page in the office.
 */
import type { CapturedPage } from '../records';

/** picture → its ≤ 400 px thumbnail, written by the in-page engine as it captures. Bounded: a flow is a handful of
 *  pages and the map is cleared when the phone's local state is. */
const thumbs = new Map<string, string>();

export function rememberThumb(image: string, thumb: string): void {
  thumbs.set(image, thumb);
}

export function forgetThumbs(): void {
  thumbs.clear();
}

const frameKey = (image: string): string => thumbs.get(image) ?? image;

/** I-15: whether these two shots look like the same page. It compares WHAT they are, never which object they are —
 *  the grid pairs two POSITIONS in its list, and a list that holds one object twice holds two shots. */
export function looksDuplicate(a: CapturedPage, b: CapturedPage): boolean {
  if (a.drawn !== null && b.drawn !== null) return a.drawn.variant === b.drawn.variant;
  if (a.image !== null && b.image !== null) return frameKey(a.image) === frameKey(b.image);
  return false;
}
