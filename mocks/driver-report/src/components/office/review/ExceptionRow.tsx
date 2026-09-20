// mocks/driver-report/src/components/office/review/ExceptionRow.tsx
/** One line of «Зараз» and «Перевірка» (§4.2 C-02, C-03): what happened, to whom, how long ago, and the ONE thing to
 *  do about it.
 *
 *  An `<article>` rather than a `<div>`, because a lane test has to be able to scope to a single row — two rows of
 *  one truck-day carry the same plate, the same driver and often the same words, and `within(getAllByRole('article')
 *  [1])` is the only way to ask about the second one without a brittle DOM walk.
 *
 *  THE PRIMARY ACTION IS A PROPERTY OF THE CODE, not of the row's author: `item.primary_action` is decided once, in
 *  `src/domain/exceptions.ts`, so the same code cannot offer «Подзвонити» in one lane and «З'ясовано» in the other.
 *  This file only knows the seven verbs.
 *
 *  «З'ясовано ▾» is a disclosure over `ReasonChips`, not a menu, and «Прийняти як є» is the same disclosure with the
 *  same chips on a FIX item (C-03 odometer codes). Neither can complete without a reason, which is the whole point:
 *  §8.3 C-02/C-03 #3 asks that the item be impossible to close silently. Only one of the two is open at a time, so
 *  the chips are never ambiguous about which question they answer.
 *
 *  A RESOLVE ITEM'S PRIMARY OPENS THAT SAME DISCLOSURE, and `onPrimary` is never called for it. C-02's anatomy gives
 *  every row the ghost «З'ясовано ▾» and C-03 then makes «З'ясовано» the PRIMARY of four codes (`TTN_NO_MASS`,
 *  `PAYMENT_METHOD_PENDING`, `PLACE_UNKNOWN`, `PLAN_MISMATCH_*`) — two controls, one verb, one question. §8.3
 *  C-02/C-03 #3 names «З'ясовано» WITHOUT the arrow and asks that it cannot complete without a reason chip, so the
 *  primary ASKS rather than answers: a one-tap primary would be the single control on this row that closes an item
 *  under a reason the operator never chose. The two names still differ, so no query is ambiguous about which one it
 *  pressed. (The Wave 2 round gate left this reading open deliberately; the integrator took it, and `LaneList` —
 *  the only page that mounts this kit — no longer has a RESOLVE branch to disagree with.)
 *
 *  A resolved item renders MUTED and WITHOUT ACTIONS. It is not removed: «З'ясувала Н. Шевчук 10:14» under the same
 *  title is what tells the operator the item they just closed is the one that vanished from the count — and a
 *  correction says more, «~~318 405~~ → 381 405 · одруківка · Н. Шевчук 21.09 16:05», because the ORIGINAL stays
 *  (ст.9 ч.7) and the struck value is the evidence that it did. */
import { useState, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { Button } from '@agency/kit/button';
import { Ban, CarFront, Camera, ClipboardCheck, FileCheck, FileText, Gauge, LockOpen, MapPinPlus, NotebookPen,
  PackageOpen, PackageX, PhoneCall, Play, Receipt, Scale, Truck, Waves, Weight, Wrench, type LucideIcon } from 'lucide-react';
import { fmtDateTime, fmtKm, fmtTime, fmtTimer } from '../../../app/format';
import { OC } from '../../../copy/office';
import type { ExceptionItem } from '../../../domain/dto';
import { toInt } from '../../../domain/num';
import type { ExceptionCode, ResolveReason, Tone } from '../../../domain/types';
import { Artefact } from '../../artefacts';
import { ExampleChip } from '../../shared';
import { RowRule } from '../index';
import { ReasonChips } from './ReasonChips';

/** The seven verbs of §4.2 C-02 / C-03 — one per `primary_action`, never per code. */
const VERB: Record<ExceptionItem['primary_action'], string> = {
  CALL: 'Подзвонити',
  CHECK: 'Перевірити',
  FIX: 'Виправити',
  RESOLVE: "З'ясовано",
  RETAKE: 'Попросити перезняти',
  OPEN_DAY: OC.openDay,
  SAMPLE: 'Звірити',
};

/** §6.7's vocabulary, one icon per code: the picture says what HAPPENED, the button says what to do about it. */
const ICON: Record<ExceptionCode, LucideIcon> = {
  NO_TTN_AT_DEPARTURE: FileText,
  ACCIDENT: CarFront,
  SEAL_PROBLEM: LockOpen,
  BREAKDOWN_CANT_DRIVE: Wrench,
  DISCREPANCY: Scale,
  NOT_ACCEPTED: Ban,
  NOT_LOADED: PackageX,
  LOADED_NOT_RECORDED: PackageOpen,
  CALL_ME: PhoneCall,
  SHIFT_NOT_STARTED: Play,
  NO_SIGNED_TTN: FileCheck,
  STOP_REVIEW: ClipboardCheck,
  TTN_NO_MASS: Weight,
  ODOMETER_TYPED: Gauge,
  ODOMETER_BACKWARDS: Gauge,
  ODOMETER_JUMP: Gauge,
  ODOMETER_STALE: Gauge,
  ODOMETER_UNREAD: Gauge,
  ODOMETER_OFF_PLAN: Gauge,
  SAMPLE_CHECK: Camera,
  IMAGE_QUALITY_LOW: Waves,
  PAYMENT_METHOD_PENDING: Receipt,
  PLACE_UNKNOWN: MapPinPlus,
  LATE_RECORD_ON_CONFIRMED_DAY: NotebookPen,
  PLAN_MISMATCH_TRUCK: Truck,
  PLAN_MISMATCH_TRAILER: Truck,
};

/** The three reasons C-02 offers, in the spec's order. `DOC_TODAY` belongs to C-08's «Підтвердити з позначкою». */
const REASONS: { value: ResolveReason; label: string }[] = [
  { value: 'DRIVER_EXPLAINED', label: OC.resolveReasons.DRIVER_EXPLAINED },
  { value: 'OCR_ERROR', label: OC.resolveReasons.OCR_ERROR },
  { value: 'NOT_A_PROBLEM', label: OC.resolveReasons.NOT_A_PROBLEM },
];

const ICON_TONE: Record<Tone, string> = { plain: 'text-ink', hold: 'text-hold', reject: 'text-reject', muted: 'text-text-2' };
/** A stored odometer is a digit string; a stored time is not. Grouping the first is what makes the struck original
 *  read as the number the driver typed rather than as six loose digits. */
const shown = (v: string): string => (/^\d{1,9}$/.test(v) ? fmtKm(toInt(v)) : v);

export function ExceptionRow({ item, onPrimary, onTake, onResolve, onAcceptAsIs, refused = null }: {
  item: ExceptionItem;
  onPrimary(): void;
  onTake(): void;
  onResolve(reason: ResolveReason): void;
  onAcceptAsIs?(reason: ResolveReason): void;
  refused?: string | null;
}): JSX.Element {
  const [asking, setAsking] = useState<'resolve' | 'accept' | null>(null);
  const done = item.resolved;
  const tone: Tone = done === null ? item.tone : 'muted';
  const Icon = ICON[item.code];
  const acceptable = onAcceptAsIs !== undefined && item.primary_action === 'FIX';
  const asks = item.primary_action === 'RESOLVE';
  const toggleResolve = (): void => setAsking(asking === 'resolve' ? null : 'resolve');

  return (
    <article
      data-code={item.code}
      data-tone={tone}
      className="flex items-start gap-[12px] border-b border-line/70 px-[20px] py-[14px] last:border-b-0"
    >
      <RowRule tone={tone} />
      <Icon size={18} strokeWidth={2} aria-hidden="true" className={cn('mt-[1px] shrink-0', ICON_TONE[tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <p className={cn('text-[14px] leading-[1.35] font-semibold', done === null ? 'text-ink' : 'text-text-2')}>{item.title}</p>
          {item.example ? <ExampleChip /> : null}
        </div>
        {item.meta === '' ? null : <p className="text-[13px] leading-[1.4] text-text-2">{item.meta}</p>}
        {item.request_line === null ? null : <p className="text-[13px] leading-[1.4] text-hold">{item.request_line}</p>}
        {item.evidence === null ? null : item.evidence.kind === 'thumb'
          ? <Artefact variant={item.evidence.variant} size="thumb" className="self-start" />
          : <p className="text-[13px] leading-[1.45] text-ink">{item.evidence.text}</p>}
        {refused === null ? null : <p className="text-[13px] leading-[1.45] text-reject">{refused}</p>}

        {done !== null ? (
          done.correction === null
            ? <p className="text-[13px] leading-[1.45] text-text-2">{`З'ясувала ${done.by} ${fmtTime(done.at)}`}</p>
            : (
              <p className="text-[13px] leading-[1.45] text-ink">
                <s className="text-text-2">{shown(done.correction.old)}</s>
                {` → ${shown(done.correction.new)} · ${done.reason} · ${done.by} ${fmtDateTime(done.at)}`}
              </p>
            )
        ) : (
          <>
            <div className="mt-[2px] flex flex-wrap items-center gap-[8px]">
              <Button
                type="button"
                variant="outline"
                aria-expanded={asks ? asking === 'resolve' : undefined}
                onClick={asks ? toggleResolve : onPrimary}
                className="h-[36px] text-[14px]"
              >
                {VERB[item.primary_action]}
              </Button>
              {item.taken_by === null
                ? (
                  <Button type="button" variant="ghost" onClick={onTake} className="h-[36px] text-[14px]">
                    Взяти в роботу
                  </Button>
                )
                : <span className="text-[13px] leading-[1.4] text-text-2">{`в роботі: ${item.taken_by}`}</span>}
              <Button
                type="button"
                variant="ghost"
                aria-expanded={asking === 'resolve'}
                onClick={toggleResolve}
                className="h-[36px] text-[14px]"
              >
                {"З'ясовано ▾"}
              </Button>
              {acceptable ? (
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={asking === 'accept'}
                  onClick={() => setAsking(asking === 'accept' ? null : 'accept')}
                  className="h-[36px] text-[14px]"
                >
                  Прийняти як є
                </Button>
              ) : null}
            </div>
            {asking === null ? null : (
              <ReasonChips
                options={REASONS}
                value={[]}
                onChange={(v) => {
                  const reason = v[0];
                  if (reason === undefined) return;
                  setAsking(null);
                  if (asking === 'accept') onAcceptAsIs?.(reason);
                  else onResolve(reason);
                }}
              />
            )}
          </>
        )}
      </div>
      <span className="shrink-0 font-mono text-[14px] leading-[1.4] text-text-2">{fmtTimer(item.age_min)}</span>
    </article>
  );
}
