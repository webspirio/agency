// mocks/driver-report/src/components/office/DocDots.tsx
/** Three 10 px dots — ТТН · підписані · чеки — ring (none), half (part), full (§4.1 «Codes and sources»).
 *
 *  The dots are the glance; the WORDS are the answer, and they are the `label` the caller builds from the row's own
 *  counts («ТТН: 2 з 2 · підписані: 1 з 2 · чеки: 1»). So the group is one `role="img"` carrying that sentence as its
 *  accessible name and the three circles are `aria-hidden` inside it: a screen reader reads the counts, never «dot
 *  dot dot», and the shape carries the state for a viewer who cannot separate ink from ochre (§8.5). */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import type { DocDot } from '../../domain/dto';

const INK: Record<DocDot, string> = {
  none: 'text-line-strong',
  part: 'text-hold',
  full: 'text-ink',
};

function Dot({ state }: { state: DocDot }): JSX.Element {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" focusable="false" className={cn('shrink-0', INK[state])}>
      <circle cx={5} cy={5} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {state === 'full' ? <circle cx={5} cy={5} r={4} fill="currentColor" stroke="none" /> : null}
      {/* Half a disc: the right semicircle, so «part» reads as a dial that is filling rather than as a smaller dot. */}
      {state === 'part' ? <path d="M5 1.25 A3.75 3.75 0 0 1 5 8.75 Z" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

export function DocDots({ ttn, signed, receipts, label }: { ttn: DocDot; signed: DocDot; receipts: DocDot; label: string }): JSX.Element {
  const dots = [
    { id: 'ttn', state: ttn },
    { id: 'signed', state: signed },
    { id: 'receipts', state: receipts },
  ];
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-[4px] align-middle">
      {dots.map((d) => (
        <Dot key={d.id} state={d.state} />
      ))}
    </span>
  );
}
