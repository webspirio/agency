// mocks/driver-report/src/components/office/SkeletonRows.tsx
/** Loading is STATIC bench rows — no shimmer, no spinner (§4.1 «Loading»).
 *
 *  A pulse on a projector reads as something going wrong, and a spinner says «wait» without saying for what. These
 *  are `--bench` blocks at the real row height, so the page does not jump when the data lands.
 *
 *  It is the kit's `Skeleton` with `animate-none`: the kit ships `animate-pulse`, tailwind-merge resolves the two in
 *  the same group and the later class wins, so the component is consumed rather than re-implemented while this
 *  surface still obeys §4.1. The whole block is `aria-hidden` — there is nothing here to read out; the page's own
 *  `aria-busy` is what a screen reader needs. */
import type { JSX } from 'react';
import { Skeleton } from '@agency/kit/skeleton';

export function SkeletonRows({ rows = 5 }: { rows?: number }): JSX.Element {
  const bench = Array.from({ length: rows }, (_, index) => `bench-${index}`);
  return (
    <div aria-hidden="true" className="flex flex-col">
      {bench.map((id) => (
        <div key={id} className="flex h-[52px] items-center gap-[16px] border-b border-line/70 px-[20px] last:border-b-0">
          <span className="h-[28px] w-[2px] shrink-0 rounded-[1px] bg-bench" />
          <Skeleton className="h-[12px] w-[112px] animate-none bg-bench" />
          <Skeleton className="h-[12px] w-[180px] animate-none bg-bench" />
          <Skeleton className="ml-auto h-[12px] w-[72px] animate-none bg-bench" />
        </div>
      ))}
    </div>
  );
}
