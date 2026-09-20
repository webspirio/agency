// mocks/driver-report/src/pages/driver/SegmentPanel.tsx
/**
 * «Що зараз?» — D-05 (§3.3): the same question D-04 asked on arrival, asked again at 07:52 because the answer has
 * changed. It splits the stop's hours into the driver's own segments, which is the office's whole view of a wait the
 * paper never records.
 *
 * A PANEL, NOT A ROUTE. It is opened from the StopCard's status line by history state on `/`, so a pasted link can
 * never drop anybody into it and Back simply closes it. It still runs a real `useFlow`: the seq, the idempotency key
 * and the moment are minted at the tap that OPENED the panel (D11, EC-137), so a repeat, a retry and a resume all
 * carry the same key and the server dedupes on it.
 *
 * TWO TAPS, and the first one is not here (§3.4). So closing the panel leaves nothing behind: a one-tap question
 * that left a «Продовжимо: …» card on home would be a chore invented by the app. `discardDraft` on Back is the whole
 * of that.
 *
 * The kind's own mark goes FIRST — «Заїхав — вантажать» at a loading stop, «ТТН показав — чекаю розвантаження» at a
 * drop — and «Тривога / укриття» LAST, because it splits the timer rather than describing the queue (EC-58). Both
 * orders live in `segmentChips`, beside the arrival's six, so the two screens cannot drift.
 */
import type { JSX } from 'react';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { DEVICE_ID } from '../../app/device';
import { discardDraft, useCommitOnce, useFlow } from '../../app/flow';
import { fmtTime } from '../../app/format';
import { useServerNow } from '../../app/live';
import { pendingRecords } from '../../app/outbox';
import { buildRecord } from '../../app/records';
import { DriverSkeleton, LightPage } from '../../components/driver';
import { DC } from '../../copy/driver';
import { project } from '../../domain/project';
import type { SegmentChip } from '../../domain/types';
import { useDriverGuard } from './DriverShell';
import { segmentChips, StatusChips, type StopKindHere } from './flows/StatusChips';
import { segmentReceipt } from './flows/shiftReceipts';

const STEPS = ['pick'] as const;
const TITLE = 'Що зараз?';

export function SegmentPanel({ stopId, onDone }: { stopId: string; onDone(): void }): JSX.Element {
  const today = useToday().data ?? null;
  const now = useServerNow();
  const flow = useFlow({ flow: 'segment', steps: STEPS, stopId, label: TITLE });
  const commit = useCommitOnce();
  const guard = useDriverGuard();

  if (today === null) return <DriverSkeleton />;

  const pending = pendingRecords(DEVICE_ID);
  const projection = project(today, pending, now);
  const open = projection.openStop?.stop.stop_id === stopId ? projection.openStop : null;
  const stop = open?.stop ?? today.plan?.stops.find((s) => s.stop_id === stopId) ?? null;
  const kind: StopKindHere = stop?.kind === 'DROP' ? 'DROP' : 'LOADING';
  const since = open?.segment ?? null;

  const pick = guard((chip: SegmentChip) => {
    commit.run(() => {
      const record = buildRecord(
        { deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at,
          committedAt: server.clock.nowIso(), stopId, placeId: stop?.place_id ?? null },
        'SEGMENT',
        { chip },
      );
      flow.commit({ record, pages: [], receipt: segmentReceipt(chip, flow.draft.occurred_at) });
      onDone();
    });
  });

  return (
    <>
      <LightPage title={TITLE} onBack={() => { discardDraft(DEVICE_ID, flow.draft.id); onDone(); }}>
        {since === null ? null : (
          <p className="text-[1rem] leading-[1.375rem]">
            {`Зараз: ${DC.segments[since.chip]} · з ${fmtTime(since.since)}`}
          </p>
        )}
        <StatusChips options={segmentChips(kind)} onPick={pick} />
      </LightPage>
    </>
  );
}
