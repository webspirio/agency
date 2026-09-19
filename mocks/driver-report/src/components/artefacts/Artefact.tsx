// mocks/driver-report/src/components/artefacts/Artefact.tsx
/**
 * I-15's one entry point into the drawn documents: a variant string and a size in, one picture out.
 *
 * Every caller — the viewfinder, the review grid, the office's lightbox, «Ось так» — names a variant and nothing
 * else, so what a `ttn-004518-back:soft` looks like is decided once, in `catalogue.ts`, and not at each call site.
 *
 * The three sizes are the three boxes §6.11 gives: `thumb` is 4 rem tall and takes its width from the drawing (a
 * receipt is a strip, a ТТН is a page); `view` fills the viewfinder it is given; `full` fills the lightbox with a
 * margin, so the paper is never edge to edge against the frame. Every drawing keeps its aspect ratio in all three —
 * a squashed document reads as a rendering bug, and on this stage it would read as a mock that cannot draw.
 */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { ActArt } from './ActArt';
import type { ArtefactPlan } from './catalogue';
import { planFor } from './catalogue';
import { ClusterArt } from './ClusterArt';
import { ReceiptArt } from './ReceiptArt';
import { TtnBack } from './TtnBack';
import { TtnFront } from './TtnFront';
import { TtnSigned } from './TtnSigned';
import { WeighTicket } from './WeighTicket';

export type ArtefactSize = 'thumb' | 'view' | 'full';

const FIT: Record<ArtefactSize, string> = {
  thumb: 'inline-flex h-16 shrink-0 items-center justify-center',
  view: 'flex h-full w-full items-center justify-center',
  full: 'flex h-full w-full items-center justify-center p-[2%]',
};

function Drawing({ plan }: { plan: ArtefactPlan }): JSX.Element {
  switch (plan.component) {
    case 'ClusterArt':
      return <ClusterArt {...plan.props} />;
    case 'TtnFront':
      return <TtnFront {...plan.props} />;
    case 'TtnBack':
      return <TtnBack {...plan.props} />;
    case 'TtnSigned':
      return <TtnSigned {...plan.props} />;
    case 'ReceiptArt':
      return <ReceiptArt {...plan.props} />;
    case 'WeighTicket':
      return <WeighTicket {...plan.props} />;
    case 'ActArt':
      return <ActArt {...plan.props} />;
  }
}

export function Artefact({ variant, value = null, size, className }: {
  variant: string; value?: string | null; size: ArtefactSize; className?: string;
}): JSX.Element {
  const plan = planFor(variant, value);
  return (
    <span className={cn(FIT[size], className)} data-artefact={variant} data-size={size} data-kind={plan.kind}>
      <Drawing plan={plan} />
    </span>
  );
}
