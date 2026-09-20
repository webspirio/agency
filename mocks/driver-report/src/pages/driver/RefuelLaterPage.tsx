// mocks/driver-report/src/pages/driver/RefuelLaterPage.tsx
/**
 * The receipt he put off (D7, §3.3 D-10 «Зніму пізніше»): `shoot` → `review` → commit, and NOTHING ELSE.
 *
 * NO ODOMETER, DELIBERATELY. A dash photographed at the parking is 96 km past the pump, and storing it as the
 * refuel's reading puts the litres at the wrong kilometre (04 EC-29). So the reading stays what it already was: CAN
 * on an R+C truck, and `OFFICE_CALC` on a Регіс one, which the office fills from the plan.
 *
 * The record is a `DOCS_ADDED` with NO `stop_id`, which is exactly how W0-15's handler recognises it: a stop-less
 * later-photos record is filed against the device's newest deferred `REFUEL`, and its pages with it.
 *
 * The decoded card and «Ось так» are `RefuelPage`'s — one table, one gate, so the same receipt cannot read one way
 * at the pump and another way on the parking.
 */
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID } from '../../app/device';
import { useFlow } from '../../app/flow';
import { fmtTime } from '../../app/format';
import { buildPages, buildRecord, pageKey } from '../../app/records';
import { DriverSkeleton } from '../../components/driver';
import { CameraScreen, ExampleCard, ReviewSingle } from '../../components/driver/capture';
import type { Instant, Payloads } from '../../domain/types';
import { DecodedCard, decodedOf, SHOOT_RECEIPT, useExample } from './RefuelPage';

const STEPS = ['receipt', 'review'] as const;
type Step = (typeof STEPS)[number];

/** «Чек із заправки 08:57» — named by the refuel it completes, not by the minute the photograph was taken. */
const laterReceiptTitle = (at: Instant): string => `Чек із заправки ${fmtTime(at)}`;

export function RefuelLaterPage(): JSX.Element {
  const { recordKey = '' } = useParams();
  const flow = useFlow<Step>({ flow: 'refuel-later', steps: STEPS, label: 'Чек із заправки' });
  const today = useToday().data ?? null;
  const example = useExample('RECEIPT', today);

  if (today === null) return <DriverSkeleton />;

  const { draft } = flow;
  // The stub the driver left at the pump carries the moment the refuel happened; the receipt is read as of THAT.
  const stub = today.records.find((r) => r.key === recordKey && r.type === 'REFUEL') ?? null;
  const at = stub?.occurred_at ?? draft.occurred_at;

  const page = draft.pages[0] ?? null;
  const decoded = decodedOf(page);
  const plan = drawnFor({ deviceId: DEVICE_ID, flow: 'refuel-later', stopPlanKey: null, expectedKm: null,
    retake: null });

  if (page === null) {
    if (example.show) return <ExampleCard artefact="RECEIPT" hint={SHOOT_RECEIPT.hint} onOk={example.ok} />;
    return (
      <CameraScreen
        {...SHOOT_RECEIPT}
        artefact="RECEIPT"
        row2={[]}
        engine={chooseEngine()}
        drawn={plan.find((spec) => spec.artefact === 'RECEIPT') ?? null}
        onBack={() => { flow.back(); }}
        onShot={(shot) => { flow.setPages([{ ...shot, deferred: 'AT_PARKING' }]); flow.go('review'); }}
        onRow2={() => { /* the receipt is the whole of this flow: there is nothing to put off twice */ }}
      />
    );
  }

  const commit = (): void => {
    const payload: Payloads['DOCS_ADDED'] = { pages: [pageKey(draft.key, 1)], odometer: null, deferred: 'AT_PARKING' };
    const record = buildRecord({ deviceId: DEVICE_ID, seq: draft.seq, occurredAt: draft.occurred_at,
      committedAt: server.clock.nowIso() }, 'DOCS_ADDED', payload);
    flow.commit({ record, pages: buildPages(draft.key, [page]), receipt: { title: laterReceiptTitle(at), next: null } });
  };

  return (
    <ReviewSingle
      page={page}
      onOk={commit}
      onRetake={() => { flow.setPages([]); flow.go('receipt'); }}
      decoded={decoded === null ? undefined : <DecodedCard decoded={decoded} at={at} />}
    />
  );
}
