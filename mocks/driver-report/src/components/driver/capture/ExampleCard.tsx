// mocks/driver-report/src/components/driver/capture/ExampleCard.tsx
/**
 * «Ось так» (§3.3 D-06): the first time this phone is asked for a kind of document, it is shown one.
 *
 * A drawn example, not a photograph of one: the driver is about to photograph the real paper, and two pictures of
 * the same ТТН — one real, one drawn — would be the demo's one confusing frame. It shows once per artefact kind per
 * device and never returns (the server's `first_time` flags are the truth; `examplesKey` in `src/app/device.ts` is
 * the per-viewer convenience beside them), and on the stage Павло and Олег are in their third week, so they never
 * see it at all.
 *
 * One way out and no second choice: «Зрозумів» is 3.5rem, and there is nothing else to read.
 */
import type { JSX } from 'react';
import { Check } from 'lucide-react';
import type { ArtefactKind } from '../../../domain/types';
import { Artefact, SeatBackdrop } from '../../artefacts';
import { PrimaryAction } from '../PrimaryAction';

/** One drawing per kind (§6.11). The number on the paper does not matter here — only the SHAPE of the page and
 *  which part of it must be in the frame. */
const EXAMPLE: Record<ArtefactKind, string> = {
  TTN_FRONT: 'ttn-004517-front',
  TTN_BACK: 'ttn-004517-back',
  TTN_SIGNED: 'ttn-004517-signed',
  RECEIPT: 'receipt-okko-58213',
  CLUSTER: 'cluster:412355',
  WEIGH_TICKET: 'weigh-ticket-3317',
  ACT: 'act-214',
};

export function ExampleCard({ artefact, hint, onOk }: {
  artefact: ArtefactKind;
  hint: string;
  onOk(): void;
}): JSX.Element {
  return (
    <div data-surface="dark"
      className="fixed inset-0 z-30 flex items-end justify-center p-gutter"
      style={{ background: 'var(--cam-scrim)' }}>
      <div className="flex w-full max-w-[35rem] flex-col gap-3 rounded-[14px] p-4"
        style={{ background: 'var(--cam-surface)', color: 'var(--cam-ink)' }}>
        <h2 className="text-[1.25rem] leading-[1.75rem] font-semibold">Ось так</h2>
        <div className="relative h-[12rem] overflow-hidden rounded-[10px]">
          <div className="absolute inset-0">
            <SeatBackdrop><Artefact variant={EXAMPLE[artefact]} size="view" /></SeatBackdrop>
          </div>
        </div>
        <p className="text-[1.125rem] leading-[1.5rem]" style={{ color: 'var(--cam-text-2)' }}>{hint}</p>
        <PrimaryAction icon={Check} verb="Зрозумів" dark onPress={onOk} />
      </div>
    </div>
  );
}
