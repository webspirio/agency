// mocks/driver-report/src/components/office/useConsoleMode.ts
/** The console reflows by ITS OWN width, never by the device's (§4.1).
 *
 *  That distinction is load-bearing on the stage: the console runs in an iframe beside the phone frame (§5.2), so a
 *  1 440 px laptop can be showing a 900 px console. `window.innerWidth` inside that iframe IS the console's width,
 *  which is why this reads the viewport rather than a media query against the outer screen.
 *
 *  Relational operators are legal here: `src/components/**` is where `agency/no-decimal-comparison` is off by design
 *  (a pixel count is not money), and these four numbers are the breakpoints of §4.1 and nothing else. */
import { useEffect, useState } from 'react';

export type ConsoleMode = 'wide' | 'compact' | 'rail' | 'mobile';

/** §4.1: ≥ 1 200 wide (sidebar 240) · 900–1 199 compact (208) · 720–899 rail (76) · < 720 mobile (a 288 px sheet). */
export const WIDE_FROM = 1200;
export const COMPACT_FROM = 900;
export const RAIL_FROM = 720;

export function modeOf(width: number): ConsoleMode {
  if (width >= WIDE_FROM) return 'wide';
  if (width >= COMPACT_FROM) return 'compact';
  if (width >= RAIL_FROM) return 'rail';
  return 'mobile';
}

/** `window.innerWidth`, or the widest layout where there is no window (a node render). */
function viewportWidth(): number {
  return typeof window === 'undefined' ? WIDE_FROM : window.innerWidth;
}

export function useConsoleMode(): ConsoleMode {
  const [mode, setMode] = useState<ConsoleMode>(() => modeOf(viewportWidth()));
  useEffect(() => {
    const read = (): void => setMode(modeOf(viewportWidth()));
    // Read once on mount as well: a server-rendered or hydrated first paint can have guessed a different width.
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return mode;
}
