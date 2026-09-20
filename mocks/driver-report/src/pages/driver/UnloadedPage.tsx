// mocks/driver-report/src/pages/driver/UnloadedPage.tsx
/**
 * «Вивантажено — фото ТТН з підписом» (§3.3 D-08): one photograph, of copy 3 — the one that comes back to КТЛ signed
 * by the consignee. Three taps and one photo, because that is the whole of what the office needs from a drop.
 *
 * THE FARM THAT FORBIDS CAMERAS IS ASKED FIRST, NOT REFUSED LATER. A place flagged «Фото на території заборонені»
 * opens on the no-photo screen instead of the camera, so the driver is never standing at the gate deciding whether
 * to break a rule he has just been reminded of. «Зніму після виїзду» commits the unloading NOW, with the tap's own
 * minute and no pages, and home carries «Потрібно від вас: фото ТТН з підписом і щитка — Лан» until the deferred
 * capture (`/stop/:stopId/later`) delivers them. «Все одно зняти зараз» is still there, quiet: the flag belongs to
 * the place and only the driver can see whether it is true today (§8.6 #11).
 *
 * WHAT IS ASKED FOR IS A SIGNATURE, and nothing else (§8.6 #18). The consignee signs copy 3; the older paper habit
 * of demanding a seal beside it is not reproduced here, and the word for that demand is on the banned list the words
 * test scans — over this file's comments as well as its strings, which is why this sentence does not spell it.
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
import { NoDocumentPage, NoPhotoScreen, ReviewSingle, type Row2Kind } from '../../components/driver/capture';
import { DC } from '../../copy/driver';
import type { DriverToday, PlannedStopView } from '../../domain/dto';
import type { Deferred, NoDocReason } from '../../domain/types';
import { useDriverGuard, useJustUnlocked } from './DriverShell';
import { CaptureSequence, HINT, type Shot } from './flows/CaptureSequence';
import { deferredAt, nextLine, stopAfter, unloadedTitle } from './flows/docReceipts';

const NO_PHOTO = 'nophoto';
const SHOOT = 'shoot';
const REVIEW = 'review';
const NO_DOC = 'nodoc';
const SIGNED_TITLE = 'ТТН з підписом одержувача';
const REVIEW_TITLE = 'Це те, що треба?';

export function UnloadedPage(): JSX.Element {
  const params = useParams();
  const today = useToday();
  const data = today.data;
  if (data === undefined) return <DriverSkeleton />;
  const stop = data.plan?.stops.find((s) => s.stop_id === params['stopId']) ?? null;
  if (stop === null) return <Navigate to="/" replace />;
  return <Unloading today={data} stop={stop} />;
}

function Unloading({ today, stop }: { today: DriverToday; stop: PlannedStopView }): JSX.Element {
  const steps = stop.no_photos ? [NO_PHOTO, SHOOT, REVIEW, NO_DOC] : [SHOOT, REVIEW, NO_DOC];
  const flow = useFlow({ flow: 'unloaded', steps, stopId: stop.stop_id, label: DC.primary.unloaded });
  const guard = useDriverGuard();
  const justUnlocked = useJustUnlocked();
  const once = useCommitOnce();
  const drawn = drawnFor({ deviceId: DEVICE_ID, flow: 'unloaded', stopPlanKey: stop.plan_key, expectedKm: null,
    retake: null });
  const next = stopAfter(today.plan?.stops ?? [], stop.stop_id);
  const page = flow.draft.pages[0] ?? null;

  const shot: Shot = {
    step: SHOOT,
    next: REVIEW,
    artefact: 'TTN_SIGNED',
    title: SIGNED_TITLE,
    hint: HINT.TTN_SIGNED,
    doc_index: 1,
    page_no: 1,
    // A drop that forbids photographs owes them «після виїзду»; everywhere else a put-off is «на стоянці» (D-06).
    row2: ['NO_DOC', stop.no_photos ? 'AFTER_EXIT' : 'AT_PARKING'],
    count: { index: 0, total: 2 },
    ...(page === null ? {} : { replaces: 0 }),
  };

  const commit = (p: { pages: readonly CapturedPage[]; deferred: Deferred | null; noDoc: NoDocReason | null }): void => {
    once.run(() => {
      const wire = buildPages(flow.draft.key, [...p.pages]);
      const record = buildRecord(
        { deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at,
          committedAt: server.clock.nowIso(), stopId: stop.stop_id, placeId: stop.place_id },
        'UNLOADED',
        { drop_index: stop.drop_index, pages: wire.map((x) => x.key), deferred: p.deferred, no_doc_reason: p.noDoc },
      );
      flow.commit({ record, pages: wire, receipt: {
        title: unloadedTitle(flow.draft.occurred_at, stop, { deferred: p.deferred, noDoc: p.noDoc }),
        next: nextLine(next),
      } });
    });
  };

  if (flow.step === NO_PHOTO) {
    return (
      <NoPhotoScreen
        onDefer={guard(() => { commit({ pages: [], deferred: deferredAt(stop), noDoc: null }); })}
        onShootAnyway={guard(() => { flow.go(SHOOT); })}
      />
    );
  }

  if (flow.step === NO_DOC) {
    return (
      <NoDocumentPage
        artefact="TTN_SIGNED"
        onCall={today.on_call}
        onBack={() => { flow.back(); }}
        onReason={(reason) => { commit({ pages: [], deferred: null, noDoc: reason }); }}
      />
    );
  }

  if (flow.step === REVIEW && page !== null) {
    const done = guard(() => { commit({ pages: [page], deferred: null, noDoc: null }); });
    return (
      <ReviewSingle page={page} title={REVIEW_TITLE} onOk={done} onKeep={done}
        onRetake={guard(() => { flow.go(SHOOT); })} />
    );
  }

  return (
    <CaptureSequence
      shots={[shot]}
      step={flow.step === REVIEW ? SHOOT : flow.step}
      pages={flow.draft.pages}
      engine={chooseEngine()}
      drawn={drawn}
      examplesSeen={today.first_time.examples_seen}
      deferred={null}
      justUnlocked={justUnlocked}
      guard={guard}
      onPage={(taken, replaces) => {
        if (replaces === null) flow.addPage(taken);
        else flow.replacePage(replaces, taken);
      }}
      onGo={(step) => { flow.go(step); }}
      onBack={() => { flow.back(); }}
      onRetake={() => { flow.go(SHOOT); }}
      onAdd={() => { /* a drop's one page has nothing to add to: the grid is not shown here */ }}
      onDone={() => { /* the single review commits, not the grid */ }}
      onRow2={(kind: Row2Kind) => {
        if (kind === 'NO_DOC') { flow.go(NO_DOC); return; }
        if (kind === 'AFTER_EXIT' || kind === 'AT_PARKING') {
          commit({ pages: [], deferred: kind === 'AFTER_EXIT' ? 'AFTER_EXIT' : 'AT_PARKING', noDoc: null });
        }
      }}
    />
  );
}
