// mocks/driver-report/src/components/driver/capture/FrameGuide.tsx
/** The shape of the thing being photographed, drawn on the viewfinder (§3.3 D-06).
 *
 *  It is the one instruction on the screen that needs no words: a driver who has never used the app puts the paper
 *  inside the corners. So the box is the artefact's OWN proportion — A4 is upright, a чек is a strip, a щиток is
 *  wider than it is tall — and the four corners are white at full strength while everything outside them sits under
 *  `--cam-scrim`, because a guide that only tints cannot be seen through a windscreen at noon.
 *
 *  `data-frame` carries the shape into the DOM: §8.2 D-06 #1 asks that a ТТН is framed A4 and the cluster wide, and
 *  that is a claim a test can only read here — a percentage width in a style attribute proves nothing about which
 *  artefact it was chosen for. */
import type { JSX } from 'react';
import type { ArtefactKind } from '../../../domain/types';

export type FrameKind = 'A4' | 'RECEIPT' | 'CLUSTER' | 'TICKET';

/** §3.3 D-06: the width of the viewfinder each guide takes, and its aspect ratio. */
const BOX: Record<FrameKind, { width: string; ratio: string }> = {
  A4: { width: '76%', ratio: '1 / 1.414' },
  RECEIPT: { width: '46%', ratio: '1 / 2.4' },
  CLUSTER: { width: '92%', ratio: '2.2 / 1' },
  TICKET: { width: '62%', ratio: '1 / 1.6' },
};

/** Which guide an artefact gets. Every paper document is A4 — a ТТН, its reverse, примірник 3 and an акт are all
 *  printed on one — so only the three that are not need naming. */
export function frameFor(artefact: ArtefactKind): FrameKind {
  if (artefact === 'CLUSTER') return 'CLUSTER';
  if (artefact === 'RECEIPT') return 'RECEIPT';
  if (artefact === 'WEIGH_TICKET') return 'TICKET';
  return 'A4';
}

const CORNER = 'absolute h-[1.75rem] w-[1.75rem] border-white';

export function FrameGuide({ kind }: { kind: FrameKind }): JSX.Element {
  const box = BOX[kind];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        data-frame={kind}
        className="relative"
        style={{
          width: box.width,
          aspectRatio: box.ratio,
          maxHeight: '86%',
          // The scrim is the guide's own shadow, so the dimmed area can never drift out of step with the box.
          boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.4), 0 0 0 100vmax var(--cam-scrim)',
        }}
      >
        <span className={`${CORNER} top-0 left-0 border-t-[3px] border-l-[3px]`} />
        <span className={`${CORNER} top-0 right-0 border-t-[3px] border-r-[3px]`} />
        <span className={`${CORNER} bottom-0 left-0 border-b-[3px] border-l-[3px]`} />
        <span className={`${CORNER} right-0 bottom-0 border-r-[3px] border-b-[3px]`} />
      </div>
    </div>
  );
}
