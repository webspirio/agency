// mocks/driver-report/src/components/driver/DriverSkeleton.tsx
/** What home shows while it is loading: static `--bench` blocks in the shape of the cards that are coming (§3.3
 *  D-02).
 *
 *  No spinner, and no shimmer either. A spinner in a cab says "something is wrong with the connection" to the one
 *  person who has been told his records are safe offline — and this mock's data is local, so the blocks are gone
 *  within a frame anyway. */
import type { JSX } from 'react';

const BLOCK = 'block w-full rounded-[12px]';

export function DriverSkeleton(): JSX.Element {
  return (
    <div aria-hidden="true" className="flex w-full flex-col gap-3">
      <span className={`${BLOCK} h-[9rem]`} style={{ background: 'var(--bench)' }} />
      <span className={`${BLOCK} h-[3.5rem]`} style={{ background: 'var(--bench)' }} />
      <span className={`${BLOCK} h-[3.5rem]`} style={{ background: 'var(--bench)' }} />
    </div>
  );
}
