// mocks/driver-report/src/components/shared/SourceBadge.tsx
/** Where a number came from, in the office's words (§6.5): the `code` utility at 12 px/600. A value the driver typed or
 *  the office estimated is not a reading, so those two sources are drawn in hold; every other source is plain ink. */
import type { JSX } from 'react';
import { OC } from '../../copy/office';
import type { SourceKey } from '../../domain/dto';

const HOLD: ReadonlySet<SourceKey> = new Set<SourceKey>(['TYPED', 'ESTIMATE']);

export function SourceBadge({ source }: { source: SourceKey }): JSX.Element {
  const tone = HOLD.has(source) ? 'text-hold' : 'text-ink';
  return (
    <span className={`code inline-block whitespace-nowrap text-[12px] font-semibold leading-[1.3] ${tone}`}>
      {OC.source[source]}
    </span>
  );
}
