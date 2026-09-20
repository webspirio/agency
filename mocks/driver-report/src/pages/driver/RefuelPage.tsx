// mocks/driver-report/src/pages/driver/RefuelPage.tsx
/**
 * «Заправка» (§3.3 D-10, beat 7): the receipt FIRST, because it fades on the seat, then the odometer that ties the
 * litres to the kilometres (R06 R-20).
 *
 * THE DRIVER IS NEVER ASKED A NUMBER HERE. Litres are not in the QR and the payment method is never asked (02
 * UC-D07 step 6): the only question on the review is «Бак повний», pre-set «так», because full-to-full is the one
 * fact the office cannot derive from a receipt. Everything else on the card is READ, and the card carries «імітація»
 * — the QR is drawn, never encoded (D9).
 *
 * FOUR STEPS, ONE ARRAY. R+C commits at the end of the review (the CAN reading IS the odometer, §3.3 D-09 tier 1),
 * so `dash` and `odometer` are simply never entered — rather than a second, shorter `steps` array, which `useFlow`
 * would see change under it on the render after `useToday` resolves, and would then resolve back to the first step.
 *
 * What the phone knows about the station, and what it does not, is the whole of `DECODED` below.
 */
import { type JSX, useState } from 'react';
import { asDecimal2 } from '@agency/mock';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID, examplesKey } from '../../app/device';
import { useCommitOnce, useFlow } from '../../app/flow';
import { fmtDateTime, fmtDec, fmtKm, fmtTime } from '../../app/format';
import { pendingRecords, useOutbox } from '../../app/outbox';
import { buildPages, buildRecord, pageKey, type CapturedPage } from '../../app/records';
import { DriverSkeleton } from '../../components/driver';
import { CameraScreen, ExampleCard, ReviewSingle } from '../../components/driver/capture';
import { OdometerStep } from '../../components/driver/capture/odometer';
import { SimChip } from '../../components/shared';
import { cmpInstant, isBefore } from '../../domain/clock';
import type { DriverToday, RecordIn } from '../../domain/dto';
import { toInt } from '../../domain/num';
import { expectedOdometer, type LastTrusted } from '../../domain/odometer';
import type { ArtefactKind, Decimal2, Instant, Km, Odometer, Payloads } from '../../domain/types';

/* ── what the phone «reads» off the paper ──────────────────────────────── */

/** The simulated decode of one drawn receipt (D9): the QR is a drawn pattern, so the values come from a table keyed
 *  by the variant the viewfinder showed, and the card built from them wears «імітація».
 *
 *  `planned_km` is the one field that is NOT printed on the receipt. It is the plan's distance from the last trusted
 *  odometer point to that station, which the place library holds and `DriverToday` does not carry — an INTEGRATOR
 *  NOTE of this task. Where it is null the odometer step falls back to basis `NONE` (D6): no number at all and
 *  «Число з фото прочитає офіс», which is the right answer for a station the demo day does not script. */
type Decoded = { brand: string; station: string; receipt_no: string; rro_no: string | null; sum_uah: Decimal2;
  card_mask: string; planned_km: Km | null };

const DECODED: Record<string, Decoded> = {
  'receipt-okko-58213': { brand: 'ОККО', station: 'ОККО Н-08', receipt_no: '58213', rro_no: '3000211458',
    sum_uah: asDecimal2('22800.00'), card_mask: '****4417', planned_km: 7 },
  'receipt-wog-30744': { brand: 'WOG', station: 'WOG Синельникове', receipt_no: '30744', rro_no: null,
    sum_uah: asDecimal2('18240.00'), card_mask: '****6032', planned_km: null },
};

export const decodedOf = (page: CapturedPage | null): Decoded | null =>
  (page === null || page.drawn === null ? null : DECODED[page.drawn.variant] ?? null);

/** «ОККО · 21.09 08:57 · 22 800,00 грн · чек 58213 · картка ****4417» — one mono line beside «імітація». `at` is the
 *  moment of the REFUEL, never of the photograph: a receipt shot on the parking hours later still reads 08:57. */
export function DecodedCard({ decoded, at }: { decoded: Decoded; at: Instant }): JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-[12px] p-3" style={{ background: 'var(--cam-surface)' }}>
      <p className="font-mono text-[1rem] leading-[1.5rem] font-medium" style={{ color: 'var(--cam-ink)' }}>
        {`${decoded.brand} · ${fmtDateTime(at)} · ${fmtDec(decoded.sum_uah)} грн · чек ${decoded.receipt_no} · картка ${decoded.card_mask}`}
      </p>
      <div><SimChip /></div>
    </div>
  );
}

/* ── «Ось так» (§3.3 D-06, the Wave 2 cross-page contract) ─────────────── */

const seenList = (): ArtefactKind[] => {
  try {
    const raw = window.localStorage.getItem(examplesKey(DEVICE_ID));
    return raw === null ? [] : (JSON.parse(raw) as ArtefactKind[]);
  } catch {
    return [];
  }
};

/** Shown once per artefact kind per device, before the camera it explains. The server's `first_time` flags are the
 *  seed's truth; the localStorage list is the per-viewer convenience beside them (I-10). */
export function useExample(kind: ArtefactKind, today: DriverToday | null): { show: boolean; ok(): void } {
  const [dismissed, setDismissed] = useState(false);
  const known = today === null ? [] : today.first_time.examples_seen;
  return {
    show: !dismissed && !known.includes(kind) && !seenList().includes(kind),
    ok() {
      setDismissed(true);
      try {
        window.localStorage.setItem(examplesKey(DEVICE_ID), JSON.stringify([...new Set([...seenList(), kind])]));
      } catch { /* a viewer with site data blocked simply meets the card again (I-10) */ }
    },
  };
}

/* ── the reading every expectation starts from ─────────────────────────── */

const REF_KIND: Record<DriverToday['odometer_ref']['kind'], LastTrusted['kind'] | null> = {
  SHIFT_END_AT_BASE: 'SHIFT_END_AT_BASE', MECHANIC: 'MECHANIC', SHIFT_START: 'SHIFT_START', POINT: 'POINT',
  CAN: 'POINT', NONE: null };

const odometerIn = (r: RecordIn): Odometer | null =>
  (r.type === 'SHIFT_START' || r.type === 'SHIFT_END' || r.type === 'ARRIVED' || r.type === 'REFUEL'
    || r.type === 'DOCS_ADDED' ? r.payload.odometer : null);

/** The office's last trusted reading, or a NEWER one still in this phone's outbox — beat 7 is offline, and a record
 *  that has not left the phone moved the truck all the same (§3.2: the phone answers the same with no network). */
export function lastTrusted(today: DriverToday, pending: readonly RecordIn[], before: Instant): LastTrusted | null {
  const ref = today.odometer_ref;
  const kind = REF_KIND[ref.kind];
  let best: LastTrusted | null = ref.value === null || ref.at === null || kind === null
    ? null : { value: ref.value, at: ref.at, kind, place_short: ref.place_short };
  for (const r of pending) {
    const value = odometerIn(r)?.value ?? null;
    const at = r.occurred_at as Instant;
    if (value === null || !isBefore(at, before)) continue;
    if (best === null || cmpInstant(at, best.at) !== -1) best = { value, at, kind: 'POINT', place_short: null };
  }
  return best;
}

/* ── the flow ──────────────────────────────────────────────────────────── */

const STEPS = ['receipt', 'review', 'dash', 'odometer'] as const;
type Step = (typeof STEPS)[number];

export const SHOOT_RECEIPT = { title: 'Сфотографуйте чек', hint: 'Чек цілком, з QR-кодом' };
const SHOOT_DASH = { title: 'Сфотографуйте щиток', hint: 'Щиток цілком — цифри і паливо' };

const FULL_TANK = 'Бак повний';
const YES = 'так';
const NO = 'ні';

/** «так | ні», two segments of one 3.5rem row. Radios rather than a checkbox: the two answers are equal offers and
 *  both must be readable without opening anything (§6.5). */
function TankSwitch({ full, onPick }: { full: boolean; onPick(v: boolean): void }): JSX.Element {
  const seg = (label: string, value: boolean): JSX.Element => (
    <button
      type="button"
      role="radio"
      aria-checked={full === value}
      onClick={() => { onPick(value); }}
      className="flex min-h-tap flex-1 items-center justify-center rounded-[10px] px-3 text-[1.125rem] font-semibold"
      style={full === value
        ? { background: 'var(--cam-ink)', color: 'var(--cam-bg)' }
        : { color: 'var(--cam-ink)', boxShadow: 'inset 0 0 0 1px var(--cam-line-strong)' }}
    >
      {label}
    </button>
  );
  return (
    <div className="flex min-h-tap items-center gap-3">
      <span className="min-w-0 flex-1 text-[1.125rem] leading-[1.5rem] font-semibold" style={{ color: 'var(--cam-ink)' }}>
        {FULL_TANK}
      </span>
      <div role="radiogroup" aria-label={FULL_TANK} className="flex w-[9rem] shrink-0 gap-2">
        {seg(YES, true)}
        {seg(NO, false)}
      </div>
    </div>
  );
}

/** «Заправка 08:57 · 412 398 км», and « · CAN» when the reading came off the bus rather than off a photograph. */
export const refuelReceiptTitle = (at: Instant, odometer: Odometer | null): string =>
  (odometer === null || odometer.value === null
    ? `Заправка ${fmtTime(at)}`
    : `Заправка ${fmtTime(at)} · ${fmtKm(odometer.value)} км${odometer.source === 'CAN' ? ' · CAN' : ''}`);

/** «Потрібно від вас: чек із заправки 08:57» — the put-off receipt, in the words home repeats on its hold card. */
export const receiptOwed = (at: Instant): string => `Потрібно від вас: чек із заправки ${fmtTime(at)}`;

export function RefuelPage(): JSX.Element {
  const flow = useFlow<Step>({ flow: 'refuel', steps: STEPS, label: 'Заправка' });
  const today = useToday().data ?? null;
  const entries = useOutbox(DEVICE_ID);
  const once = useCommitOnce();
  const receiptExample = useExample('RECEIPT', today);
  const dashExample = useExample('CLUSTER', today);

  if (today === null) return <DriverSkeleton />;

  const { draft } = flow;
  const truck = today.truck;
  const rc = truck !== null && truck.telematics === 'RUPTELA' && truck.has_can;
  const pending = entries.length === 0 ? [] : pendingRecords(DEVICE_ID);
  const last = lastTrusted(today, pending, draft.occurred_at);

  const receiptPage = draft.pages[0] ?? null;
  const dashPage = draft.pages[1] ?? null;
  const decoded = decodedOf(receiptPage);
  const fullTank = draft.data.full_tank !== false;

  const canDelta = rc && truck.can_km !== null && last !== null ? truck.can_km - last.value : null;
  const expected = expectedOdometer({ moment: 'REFUEL', last, canDelta, plannedKm: decoded?.planned_km ?? null,
    fromLabel: null, now: draft.occurred_at, rc });
  const plan = drawnFor({ deviceId: DEVICE_ID, flow: 'refuel', stopPlanKey: null, expectedKm: expected.value,
    retake: null });
  const engine = chooseEngine();
  const digits = dashPage?.drawn?.sim_read ?? null;
  const read = digits !== null && /^\d{1,9}$/u.test(digits) ? toInt(digits) : null;

  // A step whose photograph is gone (Back over a retake, a draft resumed before its shot) renders the camera it
  // needs rather than an empty screen; the next `go()` puts the history state back in step with it.
  const step: Step = flow.step === 'review' && receiptPage === null ? 'receipt'
    : flow.step === 'odometer' && dashPage === null ? 'dash' : flow.step;

  const commit = (odometer: Odometer | null, pages: CapturedPage[], deferred: boolean): void => {
    const payload: Payloads['REFUEL'] = { station: decoded?.station ?? '', receipt_no: decoded?.receipt_no ?? null,
      rro_no: decoded?.rro_no ?? null, sum_uah: decoded?.sum_uah ?? null, card_mask: decoded?.card_mask ?? null,
      full_tank: deferred ? false : fullTank, odometer, deferred };
    const record = buildRecord({ deviceId: DEVICE_ID, seq: draft.seq, occurredAt: draft.occurred_at,
      committedAt: server.clock.nowIso() }, 'REFUEL', payload);
    flow.commit({ record, pages: buildPages(draft.key, pages),
      receipt: { title: refuelReceiptTitle(draft.occurred_at, odometer),
        next: deferred ? receiptOwed(draft.occurred_at) : null } });
  };

  if (step === 'receipt') {
    if (receiptExample.show) {
      return <ExampleCard artefact="RECEIPT" hint={SHOOT_RECEIPT.hint} onOk={receiptExample.ok} />;
    }
    return (
      <CameraScreen
        {...SHOOT_RECEIPT}
        artefact="RECEIPT"
        row2={['LATER']}
        engine={engine}
        drawn={plan.find((spec) => spec.artefact === 'RECEIPT') ?? null}
        onBack={() => { flow.back(); }}
        onShot={(page) => { flow.setPages([page]); flow.go('review'); }}
        onRow2={() => { once.run(() => { commit(null, [], true); }); }}
      />
    );
  }

  if (step === 'review' && receiptPage !== null) {
    const ok = (): void => {
      if (!rc) { flow.go('dash'); return; }
      // Tier 1 (§3.3 D-09): on an R+C truck the CAN reading IS the odometer — no dash photo, no tap, no screen. With
      // no CAN reading to stand on there is no odometer at all rather than a null value labelled «CAN»: the office
      // fills it from the plan, exactly as it does for a receipt photographed later (D7).
      const can: Odometer | null = expected.basis !== 'CAN_DELTA' || expected.value === null ? null
        : { value: expected.value, source: 'CAN', basis: 'CAN_DELTA', expected: expected.value, read: null,
          choice: 'AUTO', page_key: null };
      once.run(() => { commit(can, [receiptPage], false); });
    };
    return (
      <ReviewSingle
        page={receiptPage}
        onOk={ok}
        onRetake={() => { flow.setPages([]); flow.back(); }}
        decoded={decoded === null ? undefined : (
          <>
            <DecodedCard decoded={decoded} at={draft.occurred_at} />
            <TankSwitch full={fullTank} onPick={(v) => { flow.patch({ full_tank: v }); }} />
          </>
        )}
      />
    );
  }

  if (step === 'dash') {
    if (dashExample.show) {
      return <ExampleCard artefact="CLUSTER" hint={SHOOT_DASH.hint} onOk={dashExample.ok} />;
    }
    return (
      <CameraScreen
        {...SHOOT_DASH}
        artefact="CLUSTER"
        row2={[]}
        engine={engine}
        drawn={plan.find((spec) => spec.artefact === 'CLUSTER') ?? null}
        onBack={() => { flow.back(); }}
        onShot={(page) => {
          flow.setPages(receiptPage === null ? [page] : [receiptPage, page]);
          flow.go('odometer');
        }}
        onRow2={() => { /* the dash has no way out: every truck carries one (§3.3 D-06) */ }}
      />
    );
  }

  if (dashPage === null) return <DriverSkeleton />;
  return (
    <OdometerStep
      expected={expected}
      read={read}
      rc={rc}
      photo={dashPage}
      realFrame={dashPage.source !== 'DRAWN'}
      plannedKm={decoded?.planned_km ?? null}
      last={last?.value ?? null}
      fromLabel={null}
      onRetake={() => { flow.setPages(receiptPage === null ? [] : [receiptPage]); flow.go('dash'); }}
      onDone={(o) => {
        const pages = receiptPage === null ? [dashPage] : [receiptPage, dashPage];
        commit({ ...o, page_key: pageKey(draft.key, pages.length) }, pages, false);
      }}
    />
  );
}
