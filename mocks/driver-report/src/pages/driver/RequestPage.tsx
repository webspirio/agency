// mocks/driver-report/src/pages/driver/RequestPage.tsx
/**
 * The deep link an office request opens (§2.4, §3.3 D-13): `#/request/:requestId` lands on the step that answers it
 * and on nothing else.
 *
 * `RETAKE_PHOTO` opens the capture step for EXACTLY the page the office named, with the hold banner «Диспетчер
 * просить: …» and the old photograph beside it as «Було так» — so the driver can see what was wrong before he frames
 * the new one. The numbering comes off `drawnFor`, which reads the pair (`doc_index`, `page_no`) out of the request
 * rather than out of where the shot sits in this one-page shoot: the replacement has to supersede that page and no
 * other. `CALL_ME` lands on the card with one call button.
 *
 * THE LOCK DOES NOT EAT THE LINK (§2.4). While the truck moves the SHELL raises its overlay over this page and the
 * route stays where it is — so the moment the truck stops, the driver is on the step the office sent him to, on the
 * step he was on (§8.2 D-19 #2). The lock is never this page's own: see `useDriverGuard`.
 *
 * The flow is a child component, mounted only once `getToday` has answered. `useFlow` keys a draft on the flow's
 * `stopId`, and a `stopId` that changes from `null` to the request's stop between two renders reads as a draft that
 * has gone — which would redirect home the moment the data arrived.
 */
import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID } from '../../app/device';
import { useCommitOnce, useFlow } from '../../app/flow';
import { buildPages, buildRecord, pageKey } from '../../app/records';
import { Artefact } from '../../components/artefacts';
import { CallButton, DriverSkeleton, LightPage } from '../../components/driver';
import { CameraScreen, ReviewSingle } from '../../components/driver/capture';
import type { DriverToday, RequestCardView } from '../../domain/dto';
import { titleOf } from './requests/RequestCard';

const TITLE = 'Потрібно від вас';
const ASKS = 'Диспетчер просить';
const BEFORE = 'Було так';
const RETAKE = 'Перезняти';
const REPLACED = 'Фото замінено';

const STEPS = ['shoot', 'review'] as const;
type Step = (typeof STEPS)[number];

/** The plan key of the stop the request's record was filed under — what `drawnFor` needs to find the same paper. */
const planKeyOf = (today: DriverToday, stopId: string | null): string | null =>
  today.plan?.stops.find((s) => s.stop_id === stopId)?.plan_key ?? null;

function RetakeFlow({ request, planKey }: { request: RequestCardView; planKey: string | null }): JSX.Element {
  const flow = useFlow<Step>({ flow: 'retake', steps: STEPS, stopId: request.stop_id, label: titleOf(request) });
  const once = useCommitOnce();
  const { artefact, doc_index, page_no } = request;
  const spec = useMemo(() => {
    const want = artefact === null || doc_index === null || page_no === null
      ? null
      : { artefact, doc_index, page_no };
    return drawnFor({ deviceId: DEVICE_ID, flow: 'retake', stopPlanKey: planKey, expectedKm: null, retake: want })[0] ?? null;
  }, [artefact, doc_index, page_no, planKey]);

  const page = flow.draft.pages[0] ?? null;

  const banner = (
    <div className="flex items-center gap-3 rounded-[12px] p-3"
      style={{ background: 'var(--cam-hold-bg)', color: 'var(--cam-hold)' }}>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[1.125rem] leading-[1.5rem] font-semibold">{`${ASKS}: ${request.reason_line}`}</span>
        <span className="text-[1rem] leading-[1.375rem]">{BEFORE}</span>
      </span>
      {request.thumb_variant === null
        ? null
        : <Artefact variant={request.thumb_variant} size="thumb" className="rounded-[8px]" />}
    </div>
  );

  if (flow.step === 'review' && page !== null) {
    return (
      <ReviewSingle
        page={page}
        onOk={() => {
          once.run(() => {
            const at = server.clock.nowIso();
            const key = flow.draft.key;
            flow.commit({
              record: buildRecord(
                { deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at, committedAt: at,
                  stopId: request.stop_id },
                'PHOTO_REPLACE',
                { request_id: request.id, page_key: pageKey(key, 1), supersedes: request.page_key ?? '' },
              ),
              pages: buildPages(key, [page]),
              receipt: { title: `${REPLACED} · ${request.target_label}`, next: null },
            });
          });
        }}
        onRetake={() => {
          flow.setPages([]);
          flow.go('shoot');
        }}
      />
    );
  }

  return (
    <CameraScreen
      title={RETAKE}
      hint={request.target_label}
      artefact={spec?.artefact ?? artefact ?? 'CLUSTER'}
      row2={[]}
      engine={chooseEngine()}
      drawn={spec}
      banner={banner}
      onBack={() => { flow.back(); }}
      onShot={(shot) => {
        flow.setPages([shot]);
        flow.go('review');
      }}
      onRow2={() => { /* a retake offers no way out: Back leaves it and the request stays open */ }}
    />
  );
}

export function RequestPage(): JSX.Element {
  const { requestId = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const data = today.data;
  const request = data?.requests.find((r) => r.id === requestId) ?? null;

  const missing = data !== undefined && request === null;
  useEffect(() => {
    if (missing) navigate('/', { replace: true });   // answered, cancelled, or a link from another day
  }, [missing, navigate]);

  if (data === undefined || request === null) {
    return <LightPage title={TITLE} onBack={() => { navigate('/'); }}><DriverSkeleton /></LightPage>;
  }

  if (request.type === 'RETAKE_PHOTO') {
    return <RetakeFlow request={request} planKey={planKeyOf(data, request.stop_id)} />;
  }

  return (
    <LightPage title={TITLE} onBack={() => { navigate('/'); }}>
      <p className="text-[1.25rem] leading-[1.75rem] font-semibold">{titleOf(request)}</p>
      <p className="font-mono text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>
        {request.by_short}
      </p>
      <CallButton person={{ name: data.on_call.name, role: data.on_call.role_label }} phone={data.on_call.phone} />
    </LightPage>
  );
}
