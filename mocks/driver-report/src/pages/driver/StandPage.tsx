// mocks/driver-report/src/pages/driver/StandPage.tsx
/**
 * «Стою» → «Що сталося?» (§3.3 D-11, D2, beat 8): ONE tap for a lawful stop, and the same one tap for a problem at
 * the point. Alerts, curfew and checkpoints are lawful stops, not faults a driver confesses (02 F12), so the eight
 * road reasons come first, under one quiet group label, with no confirmation between the tap and the record.
 *
 * WHAT THE SHEET SHOWS DEPENDS ON WHERE HE IS. With a stop open, the four at-the-point problems follow the road ones
 * under «На точці · <label>», and which two of them appear is the stop's KIND: «Не завантажили» belongs to a
 * loading, «Є розбіжність» to a drop. «Подзвоніть мені» is always last, separated, because asking for a call is not
 * a problem report.
 *
 * AN ALERT INSIDE AN OPEN STOP IS A SEGMENT OF THE STOP, not a road stop beside it (EC-58): the truck is not
 * standing on the road, it is standing at «Злагода» with the siren on, and home must keep drawing the stop.
 * `project()` folds either shape into `openStop.alert`, so the choice here is about what the OFFICE reads — one
 * timer on the stop rather than two rows that both claim the same minutes.
 *
 * THE MOMENT IS THE FIRST TAP (D11). `useFlow` mints `occurred_at` when the sheet opens, so «Тривога · з 12:30» is
 * the minute he reached for the phone, not the minute the record left it.
 */
import { type JSX } from 'react';
import { Ban, CarFront, LockOpen, MoonStar, PackageX, PhoneCall, Route, Scale, ShieldAlert, Siren,
  ThermometerSun, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { DEVICE_ID } from '../../app/device';
import { useCommitOnce, useFlow } from '../../app/flow';
import { fmtTime } from '../../app/format';
import { pendingRecords, useOutbox } from '../../app/outbox';
import { buildRecord } from '../../app/records';
import { ChipRow, DriverSkeleton, LightPage } from '../../components/driver';
import { DC } from '../../copy/driver';
import type { OnCallView } from '../../domain/dto';
import { project, type OpenStop } from '../../domain/project';
import type { Instant, Payloads, RoadStopReason, StopProblemKind } from '../../domain/types';
import { AccidentPage, BreakdownQuestion, DiscrepancyPage, SealPage } from './stand/ProblemPages';

const STEPS = ['reasons', 'breakdown', 'accident', 'seal', 'discrepancy'] as const;
type Step = (typeof STEPS)[number];

const TITLE = 'Стою';
const ASKS = 'Що сталося?';
const ON_ROAD = 'На дорозі';
const CALL_ME = 'Подзвоніть мені';
/** «Об'їзд» commits without a timer and closes at the next arrival, so its receipt says what it costs instead. */
const DETOUR_LINE = 'зайві кілометри офіс побачить без питань';

/** The eight of §3.3 D-11, in the spec's order — the order is the point: lawful first, faults after. */
const ROAD: readonly { reason: RoadStopReason; icon: LucideIcon }[] = [
  { reason: 'ALERT', icon: Siren },
  { reason: 'CURFEW', icon: MoonStar },
  { reason: 'HEAT', icon: ThermometerSun },
  { reason: 'CHECKPOINT', icon: ShieldAlert },
  { reason: 'BREAKDOWN', icon: Wrench },
  { reason: 'DETOUR', icon: Route },
  { reason: 'ACCIDENT', icon: CarFront },
  { reason: 'WEIGH_CONTROL', icon: Scale },
];

const PROBLEM: Record<StopProblemKind, { word: string; icon: LucideIcon }> = {
  NOT_ACCEPTED: { word: 'Не приймають', icon: Ban },
  SEAL: { word: 'Проблема з пломбою', icon: LockOpen },
  NOT_LOADED: { word: 'Не завантажили', icon: PackageX },
  DISCREPANCY: { word: 'Є розбіжність', icon: Scale },
};

/** «Не приймають» and «Проблема з пломбою» happen at any point; the other two are about what the point was FOR. */
const problemsAt = (open: OpenStop): StopProblemKind[] => [
  'NOT_ACCEPTED', 'SEAL',
  ...(open.stop.kind === 'LOADING' ? ['NOT_LOADED' as const] : []),
  ...(open.stop.kind === 'DROP' ? ['DISCREPANCY' as const] : []),
];

const Group = ({ label }: { label: string }): JSX.Element => (
  <p className="pt-1 text-[1rem] leading-[1.375rem] font-semibold" style={{ color: 'var(--text-2)' }}>{label}</p>
);

export function StandPage(): JSX.Element {
  const flow = useFlow<Step>({ flow: 'stand', steps: STEPS, label: TITLE });
  const today = useToday().data ?? null;
  const entries = useOutbox(DEVICE_ID);
  const once = useCommitOnce();

  if (today === null) return <DriverSkeleton />;

  const { draft } = flow;
  const at: Instant = draft.occurred_at;
  const pending = entries.length === 0 ? [] : pendingRecords(DEVICE_ID);
  const open = project(today, pending, today.server_time).openStop;
  const onCall: OnCallView = today.on_call;
  const back = (): void => { flow.back(); };

  const commit = <T extends 'ROAD_STOP' | 'SEGMENT' | 'STOP_PROBLEM' | 'CALL_ME'>(
    type: T, payload: Payloads[T], title: string, stopId: string | null,
  ): void => {
    once.run(() => {
      const record = buildRecord({ deviceId: DEVICE_ID, seq: draft.seq, occurredAt: at,
        committedAt: server.clock.nowIso(), stopId }, type, payload);
      flow.commit({ record, pages: [], receipt: { title, next: null } });
    });
  };

  /** A lawful stop, «Об'їзд» and the two that asked a question first all arrive here. */
  const roadStop = (reason: RoadStopReason, canDrive: boolean | null): void => {
    if (reason === 'ALERT' && open !== null) {
      commit('SEGMENT', { chip: 'ALERT' }, `${DC.segments.ALERT} · з ${fmtTime(at)}`, open.stop.stop_id);
      return;
    }
    const short = DC.roadStopShort[reason];
    const title = reason === 'DETOUR' ? `${short} з ${fmtTime(at)} · ${DETOUR_LINE}` : `${short} · з ${fmtTime(at)}`;
    commit('ROAD_STOP', { reason, can_drive: canDrive }, title, null);
  };

  const stopProblem = (kind: StopProblemKind): void => {
    commit('STOP_PROBLEM', { kind, reason: null }, `${PROBLEM[kind].word} · з ${fmtTime(at)}`,
      open === null ? null : open.stop.stop_id);
  };

  if (flow.step === 'breakdown') {
    return <BreakdownQuestion onBack={back} onAnswer={(canDrive) => { roadStop('BREAKDOWN', canDrive); }} />;
  }
  if (flow.step === 'accident') {
    return <AccidentPage onBack={back} onCall={onCall} onRecord={() => { roadStop('ACCIDENT', null); }} />;
  }
  if (flow.step === 'seal') {
    return <SealPage onBack={back} onCall={onCall} onOk={() => { stopProblem('SEAL'); }} />;
  }
  if (flow.step === 'discrepancy') {
    return <DiscrepancyPage onBack={back} onOk={() => { stopProblem('DISCREPANCY'); }} />;
  }

  const road = (reason: RoadStopReason): void => {
    if (reason === 'BREAKDOWN') { flow.go('breakdown'); return; }
    if (reason === 'ACCIDENT') { flow.go('accident'); return; }
    roadStop(reason, null);
  };
  const problem = (kind: StopProblemKind): void => {
    if (kind === 'SEAL') { flow.go('seal'); return; }
    if (kind === 'DISCREPANCY') { flow.go('discrepancy'); return; }
    stopProblem(kind);
  };

  return (
    <LightPage title={TITLE} onBack={back}>
      <h1 className="text-[1.25rem] leading-[1.75rem] font-semibold">{ASKS}</h1>
      <Group label={ON_ROAD} />
      {ROAD.map(({ reason, icon }) => (
        <ChipRow key={reason} icon={icon} label={DC.roadStops[reason]} onPress={() => { road(reason); }} />
      ))}
      {open === null ? null : (
        <>
          <Group label={`На точці · ${open.stop.label}`} />
          {problemsAt(open).map((kind) => (
            <ChipRow key={kind} icon={PROBLEM[kind].icon} label={PROBLEM[kind].word}
              onPress={() => { problem(kind); }} />
          ))}
        </>
      )}
      <div className="pt-4">
        <ChipRow icon={PhoneCall} label={CALL_ME}
          onPress={() => { commit('CALL_ME', {}, `Попросили подзвонити · ${fmtTime(at)}`, null); }} />
      </div>
    </LightPage>
  );
}
