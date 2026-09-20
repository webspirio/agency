// mocks/driver-report/src/pages/driver/ShiftStartPage.tsx
/**
 * «Почати зміну» — D-03 (§3.3), the first thing the driver touches in the morning.
 *
 * THREE STEPS ON REGIS, ONE ON RUPTELA+CAN, and the difference is a fact rather than a setting: an R+C truck reports
 * its own odometer, so the number is shown on the confirm screen as a FACT with «імітація» beside it and there is no
 * camera and no question (§3.3 D-09 tier 1). The tap budget of §3.4 is 4 · 1 photo against 2 · 0, and both are met by
 * the same three screens with the middle two simply absent.
 *
 * NOTHING HERE COMPUTES A KILOMETRE. `expectedOdometer` decides what may be offered and how the basis line reads, and
 * at a shift start it is handed `plannedKm: null` and `canDelta: null` DELIBERATELY: the truck stood at the base
 * overnight, so the offer is the last reading itself («вчора о 17:48 на базі: 412 355 — порівняйте з фото») and the
 * one thing §8.6 #2 forbids — last + 0 while the plan says the truck has moved — cannot be reached from here.
 *
 * «ІНША МАШИНА» NEVER BLOCKS. It opens a light list, and choosing «Інша — скажу диспетчеру» records `plan_match:
 * false` on the record; the office sees it in «Перевірка» and the driver drives (§7.5). The picker is kept in the
 * DRAFT rather than in a `useState`, because `LightPage` keys its body on the step index and a step change would
 * otherwise take the answer with it.
 */
import { type JSX, useState } from 'react';
import { Check, Truck } from 'lucide-react';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID } from '../../app/device';
import { useCommitOnce, useFlow } from '../../app/flow';
import { fmtKm } from '../../app/format';
import { useServerNow } from '../../app/live';
import { pendingRecords } from '../../app/outbox';
import { buildPages, buildRecord, type CapturedPage } from '../../app/records';
import { ActionBar, DriverSkeleton, LightPage, PrimaryAction, QuietButton } from '../../components/driver';
import { CameraScreen, ExampleCard } from '../../components/driver/capture';
import { OdometerStep } from '../../components/driver/capture/odometer';
import { Plate, SimChip } from '../../components/shared';
import { DC } from '../../copy/driver';
import { toInt } from '../../domain/num';
import { expectedOdometer } from '../../domain/odometer';
import { project } from '../../domain/project';
import type { Odometer } from '../../domain/types';
import { useDriverGuard } from './DriverShell';
import { nextLine } from './flows/docReceipts';
import { exampleNeeded, lastTrusted, rememberExample, shiftStartReceipt } from './flows/shiftReceipts';

const RG_STEPS = ['confirm', 'shoot', 'odometer'] as const;
const RC_STEPS = ['confirm'] as const;
type Step = (typeof RG_STEPS)[number];

const TITLE = 'Машина і причіп сьогодні';
const SHOOT_TITLE = 'Сфотографуйте щиток';
const HINT = 'Щиток цілком — цифри і паливо';
const YES = 'Так, ці';
const OTHER_TRUCK = 'Інша машина';
const OTHER_TRAILER = 'Інший причіп';
const OTHER_ROW = 'Інша — скажу диспетчеру';
const WHICH_TRUCK = 'Яка машина?';
const WHICH_TRAILER = 'Який причіп?';

/** What this flow keeps in its draft between steps (§2.2: answers survive Back). */
type StartData = { picker?: 'TRUCK' | 'TRAILER' | null; plan_match?: boolean };

/** A 4rem fact row: the plate as the physical object it is, then what it is in words. */
function VehicleRow({ plate, sub }: { plate: string; sub: string }): JSX.Element {
  return (
    <div className="flex h-tap-lg w-full items-center gap-3 rounded-[12px] px-4"
      style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
      <Plate plate={plate} size="lg" />
      <span className="min-w-0 truncate text-[1rem] leading-[1.375rem]">{sub}</span>
    </div>
  );
}

/** The same row in the picker, where it is a target. */
function PickRow({ plate, sub, onPress }: { plate: string; sub: string; onPress(): void }): JSX.Element {
  return (
    <button type="button" onClick={onPress}
      className="tap-ring flex h-tap-lg w-full items-center gap-3 rounded-[12px] px-4 text-left">
      <Plate plate={plate} size="md" />
      <span className="min-w-0 truncate text-[1rem] leading-[1.375rem]">{sub}</span>
    </button>
  );
}

export function ShiftStartPage(): JSX.Element {
  const today = useToday().data ?? null;
  const now = useServerNow();
  const truck = today?.truck ?? null;
  const rc = truck !== null && truck.has_can && truck.gnss === 'OK';
  const steps: readonly Step[] = rc ? RC_STEPS : RG_STEPS;
  const flow = useFlow<Step>({ flow: 'shift-start', steps, label: DC.primary.start });
  const commit = useCommitOnce();
  const guard = useDriverGuard();
  const [exampleSeen, setExampleSeen] = useState(false);

  if (today === null || truck === null) return <DriverSkeleton />;

  const { trailer } = today;
  const data: StartData = flow.draft.data;
  const planMatch = data.plan_match !== false;
  const pending = pendingRecords(DEVICE_ID);
  const projection = project(today, pending, now);
  const last = lastTrusted(today, pending, now);
  const expected = expectedOdometer({ moment: 'SHIFT_START', last, canDelta: null, plannedKm: null, fromLabel: null,
    now, rc });
  const engine = chooseEngine();
  const spec = drawnFor({ deviceId: DEVICE_ID, flow: 'shift-start', stopPlanKey: null, expectedKm: expected.value,
    retake: null })[0] ?? null;
  const page = flow.draft.pages[0] ?? null;
  const simRead = page?.drawn?.sim_read ?? null;
  const read = simRead === null ? null : toInt(simRead);
  /** R+C: the bus's own count, or the reading it left at the base overnight. */
  const canReading = truck.can_km ?? today.odometer_ref.value;
  const canOdometer: Odometer | null = canReading === null ? null
    : { value: canReading, source: 'CAN', basis: 'CAN_DELTA', expected: canReading, read: null, choice: 'AUTO',
      page_key: null };
  const needExample = !exampleSeen && exampleNeeded(today, 'CLUSTER');

  const commitStart = (odometer: Odometer | null): void => {
    commit.run(() => {
      const record = buildRecord(
        { deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at,
          committedAt: server.clock.nowIso() },
        'SHIFT_START',
        { truck_id: truck.id, trailer_id: trailer?.id ?? '', plan_match: planMatch, odometer, inline: null },
      );
      flow.commit({ record, pages: buildPages(flow.draft.key, flow.draft.pages),
        receipt: shiftStartReceipt(flow.draft.occurred_at, odometer, nextLine(projection.nextStop)) });
    });
  };


  if (data.picker === 'TRUCK' || data.picker === 'TRAILER') {
    const truckList = data.picker === 'TRUCK';
    const close = (match: boolean): void => { flow.patch({ picker: null, plan_match: planMatch && match }); };
    return (
      <LightPage title={truckList ? WHICH_TRUCK : WHICH_TRAILER} onBack={() => { flow.patch({ picker: null }); }}>
        {truckList
          ? <PickRow plate={truck.plate} sub={truck.model} onPress={() => { close(true); }} />
          : trailer === null ? null
            : <PickRow plate={trailer.plate} sub={trailer.body_label} onPress={() => { close(true); }} />}
        <button type="button" onClick={() => { close(false); }}
          className="tap-ring flex h-tap-lg w-full items-center gap-3 rounded-[12px] px-4 text-left">
          <Truck aria-hidden="true" className="size-[1.5rem] shrink-0" />
          <span className="min-w-0 truncate text-[1.125rem] leading-[1.5rem] font-semibold">{OTHER_ROW}</span>
        </button>
      </LightPage>
    );
  }

  if (flow.step === 'shoot') {
    const shot = (captured: CapturedPage): void => {
      flow.setPages([captured]);
      flow.go('odometer');
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
      <OdometerStep expected={expected} read={read} rc={rc} photo={page}
        realFrame={page !== null && page.source !== 'DRAWN'} plannedKm={null} last={last?.value ?? null}
        fromLabel={null} onRetake={() => { flow.go('shoot'); }} onDone={commitStart} />
    );
  }

  const confirm = guard(() => {
    if (rc) { commitStart(canOdometer); return; }
    flow.go('shoot');
  });
  return (
    <LightPage
      title={DC.primary.start}
      step={{ index: flow.index, total: flow.total }}
      onBack={() => { flow.back(); }}
      bar={(
        <ActionBar>
          <PrimaryAction icon={Check} verb={YES} busy={commit.busy} onPress={confirm} />
          <div className="flex gap-2">
            <QuietButton half label={OTHER_TRUCK} onPress={() => { flow.patch({ picker: 'TRUCK' }); }} />
            <QuietButton half label={OTHER_TRAILER} onPress={() => { flow.patch({ picker: 'TRAILER' }); }} />
          </div>
        </ActionBar>
      )}
    >
      <h1 className="text-[1.25rem] leading-[1.75rem] font-semibold">{TITLE}</h1>
      <VehicleRow plate={truck.plate} sub={truck.model} />
      {trailer === null ? null : <VehicleRow plate={trailer.plate} sub={trailer.body_label} />}
      {rc && canReading !== null ? (
        <div className="flex items-center gap-2">
          <p className="font-mono text-[1rem] leading-[1.5rem]">{`Одометр ${fmtKm(canReading)} км · CAN`}</p>
          <SimChip />
        </div>
      ) : null}
    </LightPage>
  );
}
