// mocks/driver-report/src/pages/driver/ArrivePage.tsx
/**
 * «Я на місці» — D-04 (§3.3): the arrival mark, taken BEFORE the shipper writes his own time on the ТТН, and the one
 * question worth asking while the driver is still standing at the gate.
 *
 * A TAP ANSWERS AND ADVANCES. There is no «Далі» under the chips, because the chip IS the answer: six 4rem rows, one
 * column, and the flow moves on (§3.3 D-04, §8.2 D-04/05 #2). What is happening at the stop is the whole point of
 * the screen — the office's «Черга» that the paper never records — so it is asked first and the camera second.
 *
 * FOUR SHAPES OF THE SAME FLOW, each decided by a fact rather than a flag:
 *  - REGIS, photos allowed: `status` → `shoot` → `odometer` (4 taps · 1 photo, §3.4).
 *  - a place flagged «Фото на території заборонені»: `status` alone (2 taps · 0). The ТТН and the dash are
 *    photographed after the exit, which is what the hold line says out loud.
 *  - RUPTELA + CAN with GNSS OK: NO FLOW AT ALL. The server's own arrival fills the StopCard, so opening this page
 *    discards the draft it just minted and goes home rather than asking the driver to say something the truck has
 *    already said.
 *  - RUPTELA with «GPS зник»: the REGIS path minus the odometer step — CAN still knows the kilometres, only the
 *    position is gone.
 *
 * `location.state.arrive` IS READ EXACTLY ONCE (the `ArriveContext` of the Wave 2 preamble, from «Я в іншому місці»),
 * on the first render, and copied into the draft: `useFlow` replaces that history entry with its own `{ step,
 * draftId }` in an effect, so a second read would find nothing. An `UNPLANNED` arrival carries no `stop_id` at all —
 * the handler files it under a stop of its own — and it NEVER asks for a photograph of the surroundings (§8.6 #8):
 * the only thing photographed here is the dash of the truck the driver is sitting in.
 */
import { type JSX, useEffect, useRef, useState } from 'react';
import { Camera, Check, FileText } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID, IS_STAGE } from '../../app/device';
import { discardDraft, useCommitOnce, useFlow } from '../../app/flow';
import { useServerNow } from '../../app/live';
import { pendingRecords } from '../../app/outbox';
import { buildPages, buildRecord, type CapturedPage } from '../../app/records';
import { ActionBar, DriverSkeleton, LightPage, PrimaryAction, QuietButton } from '../../components/driver';
import { CameraScreen, ExampleCard } from '../../components/driver/capture';
import { OdometerStep } from '../../components/driver/capture/odometer';
import { DC } from '../../copy/driver';
import type { PlannedStopView } from '../../domain/dto';
import { toInt } from '../../domain/num';
import { expectedOdometer } from '../../domain/odometer';
import type { Odometer, SegmentChip } from '../../domain/types';
import { useDriverGuard } from './DriverShell';
import { arrivalChips, StatusChips, type StopKindHere } from './flows/StatusChips';
import { arriveReceipt, exampleNeeded, fromLabelOf, lastTrusted, rememberExample } from './flows/shiftReceipts';

/** The one way into this page from «Я в іншому місці» (W2-14 → W2-02), pinned in the Wave 2 preamble. A planned stop
 *  taken early is `OUT_OF_ORDER` — «порядок змінено», never off-plan; a place the plan does not have is `UNPLANNED`
 *  and arrives at `/stop/new/arrive`. */
export type ArriveContext =
  | { order: 'OUT_OF_ORDER' }
  | { order: 'UNPLANNED'; place_id: string | null; unplanned_kind: 'LOADING' | 'DROP' | 'OTHER'; new_place: boolean };

const RG_STEPS = ['status', 'shoot', 'odometer'] as const;
const NO_ODOMETER_STEPS = ['status', 'shoot'] as const;
const STATUS_ONLY = ['status'] as const;
type Step = (typeof RG_STEPS)[number];

const TITLE = 'Що зараз?';
const SHOOT_TITLE = 'Поки стоїте — сфотографуйте щиток';
const HINT = 'Щиток цілком — цифри і паливо';
const DROP_LINE = 'Покажіть ТТН на прохідній одразу — з цього часу рахується вивантаження';
const NO_PHOTO_LINE = 'Тут фото заборонені — ТТН і щиток знімете після виїзду';
const NEW_PLACE_LINE = 'Місце назве диспетчер — фото місцевості не потрібне';
const GPS_PROMPT = 'Телефон спитає про місце — щоб офіс бачив, що ви на місці, і не дзвонив. Тільки в момент натискання.';
const OK = 'Добре';
const SHOOT_TTN = 'Сфотографувати ТТН';
const NO_DOCUMENT = 'Немає документа';

/** The `ArriveContext` a history entry carries, or null when the flow was opened the ordinary way. */
function arriveOf(state: unknown): ArriveContext | null {
  if (typeof state !== 'object' || state === null) return null;
  const { arrive } = state as { arrive?: unknown };
  if (typeof arrive !== 'object' || arrive === null) return null;
  const { order } = arrive as { order?: unknown };
  return order === 'OUT_OF_ORDER' || order === 'UNPLANNED' ? arrive as ArriveContext : null;
}

type ArriveData = { arrive?: ArriveContext; chip?: SegmentChip };

export function ArrivePage(): JSX.Element {
  const { stopId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const today = useToday().data ?? null;
  const now = useServerNow();
  const truck = today?.truck ?? null;
  const rc = truck !== null && truck.has_can && truck.gnss === 'OK';
  const stop: PlannedStopView | null = today?.plan?.stops.find((s) => s.stop_id === stopId) ?? null;
  const steps: readonly Step[] = stop?.no_photos === true ? STATUS_ONLY
    : truck?.has_can === true ? NO_ODOMETER_STEPS : RG_STEPS;
  const flow = useFlow<Step>({ flow: 'arrive', steps, stopId: stopId === 'new' ? null : stopId, label: DC.primary.here });
  const commit = useCommitOnce();
  const guard = useDriverGuard();
  const [exampleSeen, setExampleSeen] = useState(false);
  const [prompted, setPrompted] = useState(false);
  const [preStepDone, setPreStepDone] = useState(false);
  /** Read on the FIRST render, before `useFlow`'s effect writes its own keys over this entry's state. (Since
   *  W3-06 the flow MERGES rather than replaces, so `arrive` would survive there too — but a mount-only ref is
   *  what the draft copy below needs either way, and it is the draft that every later step reads.) */
  const opened = useRef(arriveOf(location.state));
  const copied = useRef(false);

  // The context reaches the draft once, so every later step (and a resume from home) sees the same arrival.
  useEffect(() => {
    if (copied.current) return;
    copied.current = true;
    if (opened.current !== null) flow.patch({ arrive: opened.current });
    // Mount only, deliberately: after `useFlow`'s first effect this entry's state carries the flow's own keys, and
    // the draft openOnce minted during this render already exists. A dep list on `flow` would re-run every render.
  }, []);

  // R+C with a trusted position: the truck marked its own arrival, so there is nothing to ask. The draft this render
  // minted goes with it, and `useFlow` takes the page home once it is gone.
  useEffect(() => {
    if (rc) discardDraft(DEVICE_ID, flow.draft.id);
  }, [rc, flow.draft.id]);

  if (today === null) return <DriverSkeleton />;
  if (rc) return <></>;

  const data: ArriveData = flow.draft.data;
  const arrive = data.arrive ?? opened.current ?? null;
  const unplanned = arrive !== null && arrive.order === 'UNPLANNED' ? arrive : null;
  const order = arrive?.order ?? 'PLANNED';
  const kind: StopKindHere = (unplanned === null ? stop?.kind : unplanned.unplanned_kind) === 'DROP' ? 'DROP' : 'LOADING';
  const pending = pendingRecords(DEVICE_ID);
  const last = lastTrusted(today, pending, now);
  const fromLabel = fromLabelOf(today, last);
  const expected = expectedOdometer({ moment: 'ARRIVAL', last, canDelta: null, plannedKm: stop?.planned_km ?? null,
    fromLabel, now, rc: false });
  const engine = chooseEngine();
  const spec = drawnFor({ deviceId: DEVICE_ID, flow: 'arrive', stopPlanKey: stop?.plan_key ?? null,
    expectedKm: expected.value, retake: null })[0] ?? null;
  const page = flow.draft.pages[0] ?? null;
  const simRead = page?.drawn?.sim_read ?? null;
  const read = simRead === null ? null : toInt(simRead);
  const needExample = !exampleSeen && exampleNeeded(today, 'CLUSTER');

  const commitArrive = (odometer: Odometer | null, chip: SegmentChip | null): void => {
    commit.run(() => {
      const record = buildRecord(
        { deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at,
          committedAt: server.clock.nowIso(),
          stopId: unplanned === null ? stop?.stop_id ?? null : null,
          placeId: unplanned === null ? stop?.place_id ?? null : unplanned.place_id },
        'ARRIVED',
        { order, claimed_at: null, chip, odometer, unplanned_kind: unplanned?.unplanned_kind ?? null,
          new_place: unplanned?.new_place ?? false },
      );
      flow.commit({ record, pages: buildPages(flow.draft.key, flow.draft.pages),
        receipt: arriveReceipt(flow.draft.occurred_at, odometer) });
    });
  };

  /* ── pre-steps (§3.3 D-04), each only when it applies ─────────────── */

  // A drop with nothing recorded at the loading stop: the ТТН is the only proof the cargo was ever taken on.
  const loadingStop = today.plan?.stops.find((s) => s.kind === 'LOADING') ?? null;
  const loadedSomewhere = today.records.some((r) => r.type === 'LOADED' && !r.voided)
    || pending.some((r) => r.type === 'LOADED');
  if (!preStepDone && stop?.kind === 'DROP' && loadingStop !== null && !loadedSomewhere) {
    const toLoading = (noDoc: boolean): void => {
      setPreStepDone(true);
      navigate(`/stop/${loadingStop.stop_id}/loaded`, { state: noDoc ? { noDoc: true } : undefined });
    };
    return (
      <LightPage title={DC.primary.here} onBack={() => { flow.back(); }}
        bar={(
          <ActionBar>
            <PrimaryAction icon={Camera} verb={SHOOT_TTN} onPress={() => { toLoading(false); }} />
            <QuietButton icon={FileText} label={NO_DOCUMENT} onPress={() => { toLoading(true); }} />
          </ActionBar>
        )}>
        <p className="text-[1.25rem] leading-[1.75rem] font-semibold">
          {`Завантаження у ${loadingStop.town_loc} не записано — сфотографуйте ТТН зараз`}
        </p>
      </LightPage>
    );
  }

  // Off the stage, the first arrival ever: say what the phone is about to ask for, and why (D4 — never on the stage).
  if (!prompted && !IS_STAGE && today.first_time.first_arrival) {
    return (
      <LightPage title={DC.primary.here} onBack={() => { flow.back(); }}
        bar={<ActionBar><PrimaryAction icon={Check} verb={OK} onPress={() => { setPrompted(true); }} /></ActionBar>}>
        <p className="text-[1.125rem] leading-[1.625rem]">{GPS_PROMPT}</p>
      </LightPage>
    );
  }

  /* ── the steps ────────────────────────────────────────────────────── */

  if (flow.step === 'shoot') {
    const shot = (captured: CapturedPage): void => {
      flow.setPages([captured]);
      if (steps.includes('odometer')) flow.go('odometer');
      else commitArrive(null, data.chip ?? null);
    };
    return (
      <>
        <CameraScreen title={SHOOT_TITLE} hint={HINT} artefact="CLUSTER" row2={[]} engine={engine} drawn={spec}
          onBack={() => { flow.back(); }} onShot={shot} onRow2={() => { /* the dash has no second row (D-06) */ }} />
        {needExample
          ? <ExampleCard artefact="CLUSTER" hint={HINT}
            onOk={() => { rememberExample('CLUSTER'); setExampleSeen(true); }} />
          : null}
      </>
    );
  }

  if (flow.step === 'odometer') {
    return (
      <OdometerStep expected={expected} read={read} rc={false} photo={page}
        realFrame={page !== null && page.source !== 'DRAWN'} plannedKm={stop?.planned_km ?? null}
        last={last?.value ?? null} fromLabel={fromLabel} onRetake={() => { flow.go('shoot'); }}
        onDone={(odometer) => { commitArrive(odometer, data.chip ?? null); }} />
    );
  }

  const pick = guard((chip: SegmentChip) => {
    if (steps.length === 1) { commitArrive(null, chip); return; }
    flow.patch({ chip });
    flow.go('shoot');
  });
  return (
    <LightPage title={DC.primary.here} step={{ index: flow.index, total: flow.total }}
      onBack={() => { flow.back(); }}>
      <h1 className="text-[1.25rem] leading-[1.75rem] font-semibold">{TITLE}</h1>
      {kind === 'DROP' ? <p className="text-[1rem] leading-[1.375rem]">{DROP_LINE}</p> : null}
      {stop?.no_photos === true
        ? <p className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--hold)' }}>{NO_PHOTO_LINE}</p>
        : null}
      {unplanned?.new_place === true
        ? <p className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{NEW_PLACE_LINE}</p>
        : null}
      <StatusChips options={arrivalChips(kind)} onPick={pick} />
    </LightPage>
  );
}
