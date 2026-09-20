// mocks/driver-report/src/stage/ConsoleFrame.tsx
/** The office pane (§5.1, §5.3): one iframe at `?profile=dispatcher&user=natalia&stage=1`, opened on the beat's own
 *  route.
 *
 *  No bezel and no chrome — the console is a browser window on a desk, and drawing a laptop around it would be a
 *  second thing for the audience to decode. Radius 12, a white 10 % ring and a shadow, so it reads as a pane rather
 *  than as part of the stage background.
 *
 *  It is an iframe rather than a mounted component for the reason §5.1 gives: its media queries must see ITS width,
 *  not the stage's, or the console renders its 720 px rail layout on a 1 440 px stage. Its `src` is read once, in
 *  state, and «Такт» re-navigates it through the hub (see hub.ts). Kept mounted even when hidden: a hidden pane
 *  stays live, and a remount would reseed nothing but would lose the screen the presenter left it on. */
import { useCallback, useState, type JSX } from 'react';
import type { Beat } from '../domain/script';
import { consoleSrc, type Hub } from './hub';

export function ConsoleFrame({
  beat,
  visible,
  x,
  y,
  w,
  h,
  hub,
}: {
  beat: Beat;
  visible: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  hub: Hub;
}): JSX.Element {
  const [src] = useState(() => consoleSrc(beat));
  /** Stable for the same reason as the phone's (see PhoneFrame). */
  const setFrame = useCallback((el: HTMLIFrameElement | null) => { hub.frames.register('console', el); }, [hub]);
  return (
    <div
      data-console=""
      className="absolute overflow-hidden rounded-[12px] shadow-[0_30px_80px_-30px_rgb(0_0_0/.8)] ring-1
        ring-white/[0.10]"
      style={{ left: x, top: y, width: w, height: h, visibility: visible ? 'visible' : 'hidden' }}
    >
      <iframe ref={setFrame} src={src} title="Офіс" className="block size-full border-0 bg-white" />
    </div>
  );
}
