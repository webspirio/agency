// mocks/driver-report/src/pages/office/drivers/Countdown.tsx
/**
 * The bind code's fifteen minutes, mono 20 px (§4.2 C-16).
 *
 * TWO CLOCKS, ON PURPOSE (§5.8). How MUCH time is left is read once, from the SERVER clock, against the code's own
 * `expires_at` — that is the number the server will judge the code by, and reading it from the wall would let the
 * two disagree. How the number RUNS DOWN is wall clock, `Date.now() - wall`, exactly as `ReceiptCard` measures its
 * undo window: on the stage the demo clock is frozen at the beat, and a countdown that does not move is a countdown
 * a client reads as a dead screenshot.
 *
 * IT OPENS AT «14:59», not «15:00», and that is the spec's number rather than an off-by-one: the fifteenth minute is
 * already being spent at the instant the code is minted, so what the screen promises is the whole seconds that are
 * still to come. At zero it says «0:00» and the card's «Код застарів» arrives with the next refetch of the row,
 * because expiry is the server's verdict and not this component's.
 *
 * Relational operators and `/` are off under `src/pages/**` by design; nothing here is money.
 */
import { useEffect, useState, type JSX } from 'react';
import { secondsBetween } from '../../../domain/clock';
import type { Instant } from '../../../domain/types';

/** Whole seconds still to come, floored at zero. */
function shown(startSeconds: number, elapsedMs: number): number {
  return Math.max(0, startSeconds - Math.floor(elapsedMs / 1000) - 1);
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Countdown({ expiresAt, now }: { expiresAt: Instant; now: Instant }): JSX.Element {
  // A fresh code re-anchors the run: the render-phase reset `ReceiptCard` uses, so no effect is needed to notice.
  const [anchor, setAnchor] = useState(() => ({ at: expiresAt, seconds: secondsBetween(now, expiresAt), wall: Date.now() }));
  if (anchor.at !== expiresAt) setAnchor({ at: expiresAt, seconds: secondsBetween(now, expiresAt), wall: Date.now() });
  const [left, setLeft] = useState(() => shown(anchor.seconds, 0));

  useEffect(() => {
    setLeft(shown(anchor.seconds, 0));
    const id = setInterval(() => { setLeft(shown(anchor.seconds, Date.now() - anchor.wall)); }, 1000);
    return () => { clearInterval(id); };
  }, [anchor]);

  return <span className="font-mono text-[20px] leading-[1.2] font-semibold text-ink">{mmss(left)}</span>;
}
