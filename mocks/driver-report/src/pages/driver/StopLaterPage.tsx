// mocks/driver-report/src/pages/driver/StopLaterPage.tsx
/**
 * The deferred capture (§3.3 D-08 «Deferred capture»): the photographs a stop owed, taken once the truck is off the
 * farm. Signed ТТН, then the dash, then the number — and the stop that was committed hours ago gains its documents
 * without being re-opened.
 *
 * THE PAGES CARRY THEIR DEFERRAL, so the office reads «після виїзду» beside them rather than wondering why a 15:16
 * photograph belongs to a 15:08 unloading. The record is a `DOCS_ADDED` of its own with the stop's id on it: the
 * unloading is not rewritten, which is what keeps a confirmed day's audit honest.
 *
 * THE DASH IS THE POINT OF THE SECOND SHOT. At «Лан» the drawn cluster reads 412 866 while the plan expects
 * 412 566 — one digit apart — so the odometer step asks «На щитку 5 чи 8?» with two buttons of exactly equal weight
 * and no accent anywhere (§3.3 D-09, §8.2 D-07/08 #4). The app does not lean: the driver is the one looking at the
 * cluster. Everything about that number is decided in `src/domain/odometer.ts`; this page only says which moment it
 * is asking about.
 */
import type { JSX } from 'react';
import { Navigate, useParams } from 'react-router';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID } from '../../app/device';
import { useCommitOnce, useFlow } from '../../app/flow';
import { buildPages, buildRecord, type CapturedPage } from '../../app/records';
import { DriverSkeleton } from '../../components/driver';
import { ReviewSingle } from '../../components/driver/capture';
import { OdometerStep } from '../../components/driver/capture/odometer';
import { DC } from '../../copy/driver';
import type { DriverToday, OdometerRefView, PlannedStopView } from '../../domain/dto';
import { toInt } from '../../domain/num';
import { expectedOdometer, type LastTrusted } from '../../domain/odometer';
import type { Km, Odometer } from '../../domain/types';
import { useDriverGuard, useJustUnlocked } from './DriverShell';
import { CaptureSequence, HINT, type Shot } from './flows/CaptureSequence';
import { deferredAt, docsAddedTitle, nextLine, stopAfter } from './flows/docReceipts';

const TTN = 'ttn';
const REVIEW = 'review';
const DASH = 'dash';
const ODOMETER = 'odometer';
const SIGNED_TITLE = 'ТТН з підписом одержувача';
const REVIEW_TITLE = 'Це те, що треба?';
const DASH_TITLE = 'Сфотографуйте щиток';
const TOTAL = 4;
/** Typed as plain strings, like the other two document flows: a step name travels through `CaptureSequence`,
 *  which knows nothing of any one flow's own four. */
const STEPS: readonly string[] = [TTN, REVIEW, DASH, ODOMETER];

/** The reading every expectation starts from, as the driver's own view of it carries it. A CAN point and a bare
 *  point behave alike here — only a shift start reads «від виїзду», and a deferred capture is never one. */
function lastTrusted(ref: OdometerRefView): LastTrusted | null {
  if (ref.value === null || ref.at === null || ref.kind === 'NONE') return null;
  return { value: ref.value, at: ref.at, kind: ref.kind === 'CAN' ? 'POINT' : ref.kind, place_short: ref.place_short };
}

/** What the simulated read of a dash photograph says: the digits the artefact was drawn with (§6.11). */
function readOf(page: CapturedPage | null): Km | null {
  const digits = page?.drawn?.sim_read ?? null;
  return digits === null || !/^\d+$/u.test(digits) ? null : toInt(digits);
}

export function StopLaterPage(): JSX.Element {
  const params = useParams();
  const today = useToday();
  const data = today.data;
  if (data === undefined) return <DriverSkeleton />;
  const stop = data.plan?.stops.find((s) => s.stop_id === params['stopId']) ?? null;
  if (stop === null) return <Navigate to="/" replace />;
  return <Later today={data} stop={stop} />;
}

function Later({ today, stop }: { today: DriverToday; stop: PlannedStopView }): JSX.Element {
  const deferred = deferredAt(stop);
  const flow = useFlow({ flow: 'later', steps: STEPS, stopId: stop.stop_id,
    label: deferred === 'AFTER_EXIT' ? DC.status.afterExit : DC.status.atParking });
  const guard = useDriverGuard();
  const justUnlocked = useJustUnlocked();
  const once = useCommitOnce();
  const truck = today.truck;
  const rc = truck !== null && truck.has_can && truck.gnss === 'OK';
  const last = lastTrusted(today.odometer_ref);
  const canDelta = truck?.can_km === undefined || truck.can_km === null || last === null
    ? null : truck.can_km - last.value;
  // «+116 км від «Злагоди» · за планом 116»: the genitive is authored on the place and rides on the reference.
  const fromLabel = last === null || last.kind === 'SHIFT_START' ? null : today.odometer_ref.place_gen;
  const expected = expectedOdometer({ moment: 'LATER', last, canDelta, plannedKm: stop.planned_km,
    fromLabel, now: today.server_time, rc });
  // The drawn cluster is asked for by the value the flow EXPECTS, so a rewound stage redraws today's number — and
  // «Лан»'s authored misread survives, because that pair is the whole point of the digit question (§8.2 D-08 #4).
  const drawn = drawnFor({ deviceId: DEVICE_ID, flow: 'later', stopPlanKey: stop.plan_key,
    expectedKm: expected.value, retake: null });
  const next = stopAfter(today.plan?.stops ?? [], stop.stop_id);
  const signed = flow.draft.pages.find((p) => p.artefact === 'TTN_SIGNED') ?? null;
  const dash = flow.draft.pages.find((p) => p.artefact === 'CLUSTER') ?? null;

  const shots: Shot[] = [
    { step: TTN, next: REVIEW, artefact: 'TTN_SIGNED', title: SIGNED_TITLE, hint: HINT.TTN_SIGNED, doc_index: 1,
      page_no: 1, row2: [], count: { index: 0, total: TOTAL },
      ...(signed === null ? {} : { replaces: flow.draft.pages.indexOf(signed) }) },
    { step: DASH, next: ODOMETER, artefact: 'CLUSTER', title: DASH_TITLE, hint: HINT.CLUSTER, doc_index: 1,
      page_no: 1, row2: [], count: { index: 2, total: TOTAL },
      ...(dash === null ? {} : { replaces: flow.draft.pages.indexOf(dash) }) },
  ];

  const commit = (odometer: Odometer): void => {
    once.run(() => {
      const wire = buildPages(flow.draft.key, [...flow.draft.pages]);
      const record = buildRecord(
        { deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at,
          committedAt: server.clock.nowIso(), stopId: stop.stop_id, placeId: stop.place_id },
        'DOCS_ADDED',
        { pages: wire.map((x) => x.key), odometer, deferred },
      );
      flow.commit({ record, pages: wire, receipt: {
        title: docsAddedTitle(flow.draft.occurred_at, stop, odometer.value),
        next: nextLine(next),
      } });
    });
  };

  if (flow.step === REVIEW && signed !== null) {
    const ok = guard(() => { flow.go(DASH); });
    return (
      <ReviewSingle page={signed} title={REVIEW_TITLE} onOk={ok} onKeep={ok}
        onRetake={guard(() => { flow.go(TTN); })} />
    );
  }

  if (flow.step === ODOMETER && dash !== null) {
    return (
      <OdometerStep
        expected={expected}
        read={readOf(dash)}
        rc={rc}
        photo={dash}
        realFrame={dash.image !== null}
        plannedKm={stop.planned_km}
        last={today.odometer_ref.value}
        fromLabel={fromLabel}
        onRetake={() => { flow.go(DASH); }}
        onDone={commit}
      />
    );
  }

  return (
    <CaptureSequence
      shots={shots}
      step={flow.step === REVIEW ? TTN : flow.step === ODOMETER ? DASH : flow.step}
      pages={flow.draft.pages}
      engine={chooseEngine()}
      drawn={drawn}
      examplesSeen={today.first_time.examples_seen}
      deferred={deferred}
      justUnlocked={justUnlocked}
      guard={guard}
      onPage={(taken, replaces) => {
        if (replaces === null) flow.addPage(taken);
        else flow.replacePage(replaces, taken);
      }}
      onGo={(step) => { flow.go(step); }}
      onBack={() => { flow.back(); }}
      onRetake={() => { flow.go(TTN); }}
      onAdd={() => { /* the deferred capture asks for exactly the two pages the stop owes */ }}
      onDone={() => { /* it ends in the odometer question, never in a grid */ }}
      onRow2={() => { /* neither step offers a way out: a `DOCS_ADDED` carries no reason, and Back keeps the card */ }}
    />
  );
}
