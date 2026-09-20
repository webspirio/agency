// mocks/driver-report/src/pages/driver/ShiftEndPage.tsx
/**
 * «Закінчити зміну» (§3.3 D-14, §8.2 D-14, beat 9) — the odometer in, and then the driver's own confirmation of the
 * day.
 *
 * TWO RECORDS, AND THE ORDER IS THE POINT. `SHIFT_END` is queued the moment the number is confirmed, BEFORE the
 * screen that asks for «Підтверджую»; `DRIVER_ATTESTED` is queued only if he taps it. So a driver who walks away at
 * the done screen has still ended his shift — the console shows the day with «водій не підтвердив» rather than an
 * open shift nobody closed (§8.2 D-14 #3). That is why this page does NOT hand `SHIFT_END` to `FlowApi.commit`:
 * `commit` is the LAST thing a flow does and it navigates home, and home is exactly where the shift end must not
 * land the driver.
 *
 * THE DONE SCREEN READS THE DAY PLUS WHAT IS STILL ON THE PHONE. `DriverToday.day` is the server's answer and the
 * server has not seen the `SHIFT_END` yet — it is in the outbox, possibly for hours (§3.3 D-02). So the end time
 * comes from the queued record, and the kilometres from its odometer minus the shift's start reading, until the
 * server's own `day` carries them; both agree from the acknowledgement on. This is the merge `project()` already
 * does for home with `pendingRecords` (I-11), for the same reason: nothing on this route waits for the office.
 *
 * R+C NEVER SHOOTS. On a Ruptela truck with CAN the card reader closes the shift and the home banner brings the
 * driver straight here, so the flow is the `done` screen alone (§3.3 D-14 «R+C: `done` only»).
 */
import { type JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Clock, CloudOff, FileCheck, Files, Gauge, MapPin, type LucideIcon } from 'lucide-react';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor, type DrawnSpec } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID } from '../../app/device';
import { discardDraft, useCommitOnce, useFlow } from '../../app/flow';
import { fmtDur, fmtKm, fmtTime, pluralN } from '../../app/format';
import { useServerNow } from '../../app/live';
import { enqueue, useOutbox, type OutboxEntry } from '../../app/outbox';
import { buildPages, buildRecord, type CapturedPage } from '../../app/records';
import { ActionBar, DriverSkeleton, LightPage, PrimaryAction, QuietButton, StatusLine } from '../../components/driver';
import { CameraScreen } from '../../components/driver/capture';
import { OdometerStep } from '../../components/driver/capture/odometer';
import { DC } from '../../copy/driver';
import type { DriverToday, RecordIn } from '../../domain/dto';
import { toInt } from '../../domain/num';
import { expectedOdometer, type LastTrusted } from '../../domain/odometer';
import type { Km, Odometer } from '../../domain/types';
import { useDriverGuard } from './DriverShell';

const FLOW_TITLE = DC.primary.end;
const DONE_TITLE = 'Зміну закінчено';
const SHOOT_TITLE = 'Сфотографуйте щиток';
const SHOOT_HINT = 'Щиток цілком — цифри і паливо';
const ON_SHIFT = 'На зміні';
const ON_SITE = 'На точках';
const ALERT = 'тривога';
const DOCS = (inOffice: number, total: number): string => `Документи: ${inOffice} з ${total} в офісі`;
const OWED = (nos: readonly string[]): string => `Здайте в офіс: ТТН ${nos.join(', ')}`;
const FOOTER = 'Перерви і керування — за тахографом';
const ATTEST = 'Підтверджую';
const SIGNATURE = 'підпис водія — діятиме після наказу КТЛ';
const LATER = 'Пізніше';
const CONFIRMED = 'підтверджено';
const UNSENT = 'ще в телефоні — підуть самі, щойно буде інтернет';
const DASH = '–';

type Step = 'shoot' | 'odometer' | 'done';
const RG_STEPS: readonly Step[] = ['shoot', 'odometer', 'done'];
const DONE_ONLY: readonly Step[] = ['done'];

const DIGITS = /^\d{1,9}$/u;
/** What the drawn dash «reads» (§6.11): the page's own simulated reading, or nothing at all. */
function readOf(page: CapturedPage | null): Km | null {
  const raw = page?.drawn?.sim_read ?? null;
  return raw === null || !DIGITS.test(raw) ? null : toInt(raw);
}

/** The phone's own `SHIFT_END`, for as long as the server has not answered for it. */
function queuedEnd(entries: readonly OutboxEntry[]): Extract<RecordIn, { type: 'SHIFT_END' }> | null {
  for (const e of [...entries].reverse()) {
    if (!e.undone && e.record.type === 'SHIFT_END') return e.record;
  }
  return null;
}

/** The facts the done screen states, his own first: the server's day with the queued end folded in (§3.3 D-14). */
type DayFacts = { endedAt: string | null; onShiftMin: number; onSiteMin: number; alertMin: number; km: Km | null;
  docsInOffice: number; docsTotal: number; owed: readonly string[] };
function factsOf(today: DriverToday, queued: Extract<RecordIn, { type: 'SHIFT_END' }> | null): DayFacts | null {
  const day = today.day;
  if (day === null) return null;
  const localKm = queued?.payload.odometer?.value ?? null;
  const start = today.shift?.start_odometer ?? null;
  const fresh = day.ended_at === null && queued !== null;
  return {
    endedAt: day.ended_at ?? queued?.occurred_at ?? null,
    onShiftMin: day.on_shift_min,
    onSiteMin: day.on_site_min,
    alertMin: day.alert_min,
    km: fresh && localKm !== null && start !== null ? localKm - start : day.km,
    docsInOffice: day.docs_in_office,
    docsTotal: day.docs_total,
    owed: day.owed,
  };
}

/** One 3.5rem fact of the closed day: a muted icon and the sentence, nothing to tap (§3.3 D-14). */
function FactRow({ icon: Icon, text }: { icon: LucideIcon; text: string }): JSX.Element {
  return (
    <div className="flex min-h-[3.5rem] w-full items-center gap-3">
      <Icon aria-hidden="true" className="size-[1.5rem] shrink-0" style={{ color: 'var(--text-2)' }} />
      <span className="tnum min-w-0 text-[1.125rem] leading-[1.625rem]">{text}</span>
    </div>
  );
}

/** `today` is loaded BEFORE the flow opens: the step list depends on the truck, and `useFlow` mints its draft at the
 *  first render (D11) — a draft opened against the wrong list could not be walked back. */
export function ShiftEndPage(): JSX.Element {
  const navigate = useNavigate();
  const today = useToday();
  const data = today.data;
  if (data === undefined) {
    return <LightPage title={FLOW_TITLE} onBack={() => { navigate('/'); }}><DriverSkeleton /></LightPage>;
  }
  return <EndShift today={data} />;
}

function EndShift({ today }: { today: DriverToday }): JSX.Element {
  const now = useServerNow();
  const entries = useOutbox(DEVICE_ID);
  const attesting = useCommitOnce();
  const truck = today.truck;
  const rc = truck !== null && truck.telematics === 'RUPTELA' && truck.has_can;
  const queued = queuedEnd(entries);
  const over = today.shift?.ended_at != null || queued !== null;
  // Frozen at mount: a shift that ends while this page is open must not renumber the rail under the driver's thumb.
  const [steps] = useState<readonly Step[]>(() => (rc || over ? DONE_ONLY : RG_STEPS));
  const flow = useFlow<Step>({ flow: 'shift-end', steps, label: FLOW_TITLE });
  const guard = useDriverGuard();

  /** The shift is ended either way, so the draft goes with the screen: home has nothing left to resume. */
  const leave = (): void => {
    discardDraft(DEVICE_ID, flow.draft.id);
    flow.leave();
  };

  const ref = today.odometer_ref;
  const startedAt = today.shift?.started_at ?? null;
  // `OdometerRefView` keeps every kind `expectedOdometer` words differently, so the shift end reads «+N км від
  // виїзду» when nothing stopped between, and «+23 км від «Лану»» when the last reading was the arrival there.
  const last: LastTrusted | null = ref.value === null || ref.at === null || ref.kind === 'NONE' ? null : {
    value: ref.value,
    at: ref.at,
    kind: ref.kind === 'CAN' ? 'POINT' : ref.kind,
    place_short: ref.place_short,
  };
  const base = today.plan?.stops.find((s) => s.kind === 'BASE') ?? null;
  const plannedKm = base?.planned_km ?? null;
  const fromLabel = last === null || last.kind === 'SHIFT_START' ? null : ref.place_gen;
  const canKm = truck?.can_km ?? null;
  const expected = expectedOdometer({
    moment: 'SHIFT_END',
    last,
    canDelta: canKm === null || last === null ? null : canKm - last.value,
    plannedKm,
    fromLabel,
    now,
    rc,
  });

  const photo = flow.draft.pages[0] ?? null;
  const step: Step = over ? 'done' : flow.step;

  if (step === 'shoot') {
    const drawn: DrawnSpec | null = drawnFor({ deviceId: DEVICE_ID, flow: 'shift-end', stopPlanKey: null,
      expectedKm: expected.value, retake: null })[0] ?? null;
    return (
      <CameraScreen
        title={SHOOT_TITLE}
        hint={SHOOT_HINT}
        artefact="CLUSTER"
        row2={[]}
        engine={chooseEngine()}
        drawn={drawn}
        onBack={() => { flow.back(); }}
        onShot={(page) => {
          if (flow.draft.pages.length === 0) flow.addPage(page);
          else flow.replacePage(0, page);
          flow.go('odometer');
        }}
        onRow2={() => { /* row 2 is hidden here: there is always a cluster to photograph */ }}
      />
    );
  }

  if (step === 'odometer') {
    const endShift = (odometer: Odometer): void => {
      enqueue(DEVICE_ID, {
        record: buildRecord({ deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at,
          committedAt: server.clock.nowIso(), placeId: base?.place_id ?? null },
        'SHIFT_END', { odometer, place_id: base?.place_id ?? null }),
        pages: buildPages(flow.draft.key, [...flow.draft.pages]),
        receipt: null,
      });
      flow.go('done');
    };
    return (
      <OdometerStep
        expected={expected}
        read={readOf(photo)}
        rc={rc}
        photo={photo}
        realFrame={photo !== null && photo.source !== 'DRAWN'}
        plannedKm={plannedKm}
        last={last?.value ?? null}
        fromLabel={fromLabel}
        onRetake={() => { flow.go('shoot'); }}
        onDone={endShift}
      />
    );
  }

  const facts = factsOf(today, queued);
  const endedAt = facts?.endedAt ?? null;
  const unsent = entries.filter((e) => e.acked_at === null && !e.undone && e.key !== flow.draft.key).length;
  const span = startedAt === null || endedAt === null ? null : `${fmtTime(startedAt)} ${DASH} ${fmtTime(endedAt)}`;
  const summary = facts === null || startedAt === null || endedAt === null ? null
    : `зміна ${fmtTime(startedAt)}${DASH}${fmtTime(endedAt)} · ${fmtKm(facts.km)} км · документів ${facts.docsTotal}`;

  const attest = (): void => {
    if (facts === null) return;
    attesting.run(() => {
      const seq = server.mintSeq(DEVICE_ID);
      const at = server.clock.nowIso();
      flow.commit({
        record: buildRecord({ deviceId: DEVICE_ID, seq, occurredAt: at, committedAt: at }, 'DRIVER_ATTESTED',
          { shift_id: today.shift?.id ?? null, km: facts.km, documents: facts.docsTotal }),
        pages: [],
        receipt: { title: `${DONE_TITLE} ${fmtTime(endedAt ?? at)} · ${CONFIRMED}`, next: null },
      });
    });
  };

  return (
    <LightPage
      title={DONE_TITLE}
      onBack={leave}
      bar={facts === null ? undefined : (
        <ActionBar>
          <PrimaryAction icon={Check} verb={ATTEST} place={summary} busy={attesting.busy} onPress={guard(attest)} />
          <p className="text-center text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>{SIGNATURE}</p>
          <QuietButton label={LATER} onPress={leave} />
        </ActionBar>
      )}
    >
      {facts === null ? <DriverSkeleton /> : (
        <>
          <FactRow icon={Clock}
            text={span === null ? `${ON_SHIFT} —` : `${ON_SHIFT} ${span} · ${fmtDur(facts.onShiftMin)}`} />
          <FactRow icon={MapPin} text={facts.alertMin === 0
            ? `${ON_SITE} ${fmtDur(facts.onSiteMin)}`
            : `${ON_SITE} ${fmtDur(facts.onSiteMin)} · ${ALERT} ${fmtDur(facts.alertMin)}`} />
          <FactRow icon={Gauge} text={`${fmtKm(facts.km)} км`} />
          <FactRow icon={FileCheck} text={DOCS(facts.docsInOffice, facts.docsTotal)} />
          {facts.owed.length === 0 ? null : <FactRow icon={Files} text={OWED(facts.owed)} />}
          {unsent === 0 ? null : (
            <StatusLine tone="hold" icon={CloudOff} text={`${pluralN(unsent, DC.plurals.record)} ${UNSENT}`} />
          )}
          <p className="text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>{FOOTER}</p>
        </>
      )}
    </LightPage>
  );
}
