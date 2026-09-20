// mocks/driver-report/src/app/once.ts
/** ONE WRITE PER TAP, ON EITHER PANE (§8.6 #13, EC-137).
 *
 *  A `useState` flag cannot do this job. Two clicks 50 ms apart land in ONE React batch, so both handlers run
 *  against the SAME render and a state flag still reads its old value for the second — and a TanStack mutation's
 *  `isPending` is a state flag. MEASURED in this repo's `never.office.test.tsx`: «Прийняти друковані» wrote two
 *  audit lines, «Зберегти виправлення» filed two corrections, and «Підключити телефон» minted two bind codes and
 *  so invalidated the QR the driver was already looking at — each with `disabled={… .isPending}` on the button.
 *
 *  A REF, because a ref is written synchronously and the second handler in the same batch reads the new value.
 *
 *  KEYED, and cleared when the write SETTLES, because the console's commits are not one-shot screens: a review page
 *  sends «Прийняти друковані», then a typed time, then «Прийняти зупинку», and a refused write must be retryable.
 *  So the latch holds one write in flight, not one write per mounted component — which is the difference between
 *  this and `useCommitOnce` in `flow.ts`, whose flows END at their commit and therefore latch permanently. */
import { useRef } from 'react';

export type WriteOnce = {
  /** True when this write may go ahead; false when the identical write is already in flight. */
  claim(key: string): boolean;
  /** Called when the write settles — succeeded or refused — so the same write may be made again. */
  release(): void;
};

export function useWriteOnce(): WriteOnce {
  const inFlight = useRef<string | null>(null);
  return {
    claim(key: string): boolean {
      if (inFlight.current === key) return false;
      inFlight.current = key;
      return true;
    },
    release(): void {
      inFlight.current = null;
    },
  };
}
