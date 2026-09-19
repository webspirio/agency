// mocks/driver-report/src/domain/odometer.ts
/** The odometer rules of §3.3 D-09 and §7.3 — pure, and the only place they live.
 *
 *  The one thing this module exists to prevent is the stale prefill (§8.6 #2, D6, 04 EC-19): the last reading offered
 *  as today's number when the truck has provably moved. So the reference value itself (`LAST_AT_BASE`, `MECHANIC`) is
 *  offered only at a shift start, and only while neither a positive CAN delta nor positive planned km says otherwise;
 *  everywhere else the offer is last + CAN delta, or last + planned km, or no number at all (`NONE`).
 *
 *  Kilometres are whole numbers. Every comparison goes through num.ts; 20 % of planned is `intDiv(planned, 5)`.
 *  Nothing here refuses: a reading that looks wrong becomes a flag on an accepted record (§7.5). */
import { fmtDayMonth, fmtKm, fmtTime, MINUS } from '../app/format';
import { businessDate, cmpInstant, daysBetween, isBefore } from './clock';
import { differingDigits, gt, gte, intDiv, lt, lte } from './num';
import type { FlagCode, Instant, Km, OdometerBasis, OdometerSource } from './types';

export type OdometerPoint = { at: Instant; value: Km | null; source: OdometerSource; kind: 'SHIFT_START' | 'ARRIVAL'
  | 'REFUEL' | 'SHIFT_END' | 'DOCS' | 'MECHANIC' | 'CAN'; place_id: string | null; flagged: boolean;
  at_base: boolean; record_key: string | null };
export type LastTrusted = { value: Km; at: Instant; kind: 'SHIFT_END_AT_BASE' | 'MECHANIC' | 'SHIFT_START' | 'POINT';
  place_short: string | null };
export type Expected = { value: Km | null; basis: OdometerBasis; line: string; deltaLine: (typed: Km) => string };
/** OK: no question (within ±5, or several digits off but inside max(50, 20 % planned)). */
export type ReadVerdict = { kind: 'OK' } | { kind: 'DIGIT'; index: number; readDigit: string; expectedDigit: string }
  | { kind: 'CHECK' } | { kind: 'NO_READ' };

type Moment = 'SHIFT_START' | 'ARRIVAL' | 'REFUEL' | 'SHIFT_END' | 'LATER';

/** A read within this many km of a value agrees with it: no question, and the value is stored as `DASH_PHOTO`. */
const AGREE_KM = 5;
/** The floor of the check-screen and off-plan tolerance: max(50 km, 20 % of planned). */
const TOLERANCE_FLOOR_KM = 50;
const JUMP_KM = 1500;
const STALE_KM = 2;
const OFFICE_READS = 'Число з фото прочитає офіс';

/** max(50 km, 20 % of planned); 20 % is intDiv(planned, 5). No plan → the floor. */
const tolerance = (plannedKm: Km | null): Km =>
  Math.max(TOLERANCE_FLOOR_KM, plannedKm === null ? 0 : intDiv(Math.max(plannedKm, 0), 5));
const distance = (a: Km, b: Km): Km => Math.abs(a - b);
/** «+36» · «+1 645» · «−5» (U+2212), grouped like every other km figure. */
const signed = (d: Km): string => (lt(d, 0) ? `${MINUS}${fmtKm(Math.abs(d))}` : `+${fmtKm(d)}`);

/** The part of a basis line before its first « · »: «+36 км від виїзду», «+23 км від «Лану»», «+7 км». */
function deltaPart(moment: Moment, last: LastTrusted, fromLabel: string | null, d: Km): string {
  const km = `${signed(d)} км`;
  if (moment === 'REFUEL') return km;
  if (last.kind === 'SHIFT_START') return `${km} від виїзду`;
  return fromLabel === null ? km : `${km} від «${fromLabel}»`;
}

/** The value the review offers and the line under it (§3.3 D-09 basis table, §7.3).
 *  - shift start, previous point a shift end at base, nothing moved → that reading + 0 (`LAST_AT_BASE`); «машина
 *    стояла» only on R+C, where CAN proves it (D5);
 *  - shift start, the last trusted reading is the mechanic's, nothing moved → that reading (`MECHANIC`);
 *  - a CAN delta → last + delta (`CAN_DELTA`);
 *  - planned km > 0 → last + planned (`PLANNED_KM`);
 *  - otherwise no number (`NONE`, D6): last + 0 is the forbidden stale prefill.
 *  `deltaLine(typed)` is the keypad's live line: the basis line's delta part recomputed for the typed value. */
export function expectedOdometer(i: { moment: Moment; last: LastTrusted | null; canDelta: Km | null;
  plannedKm: Km | null; fromLabel: string | null; now: Instant; rc: boolean }): Expected {
  const { moment, last, canDelta, plannedKm, fromLabel, now, rc } = i;
  if (last === null) return { value: null, basis: 'NONE', line: OFFICE_READS, deltaLine: () => '' };

  const since = (typed: Km): string => deltaPart(moment, last, fromLabel, typed - last.value);
  const hasPlan = plannedKm !== null && gt(plannedKm, 0);
  const moved = hasPlan || (canDelta !== null && gt(canDelta, 0));

  if (moment === 'SHIFT_START' && !moved && last.kind === 'SHIFT_END_AT_BASE') {
    const yesterday = daysBetween(businessDate(last.at), businessDate(now)) === 1;
    const day = yesterday ? 'вчора' : fmtDayMonth(last.at);
    const stood = rc ? ' · машина стояла' : '';
    const anchor = yesterday ? 'вчорашнього числа' : `числа ${day}`;
    return { value: last.value, basis: 'LAST_AT_BASE',
      line: `${day} о ${fmtTime(last.at)} на базі: ${fmtKm(last.value)}${stood} — порівняйте з фото`,
      deltaLine: (typed) => `${signed(typed - last.value)} км від ${anchor}` };
  }
  if (moment === 'SHIFT_START' && !moved && last.kind === 'MECHANIC') {
    return { value: last.value, basis: 'MECHANIC',
      line: `${fmtDayMonth(last.at)} механік: ${fmtKm(last.value)} — порівняйте з фото`,
      deltaLine: (typed) => `${signed(typed - last.value)} км від числа механіка` };
  }
  const onArrival = moment === 'ARRIVAL' ? ' · на прибутті' : '';
  if (canDelta !== null && gte(canDelta, 0)) {
    return { value: last.value + canDelta, basis: 'CAN_DELTA',
      line: `${since(last.value + canDelta)} · за CAN${onArrival}`, deltaLine: since };
  }
  if (plannedKm !== null && hasPlan) {
    return { value: last.value + plannedKm, basis: 'PLANNED_KM',
      line: `${since(last.value + plannedKm)} · за планом ${fmtKm(plannedKm)}${onArrival}`, deltaLine: since };
  }
  return { value: null, basis: 'NONE', line: OFFICE_READS, deltaLine: since };
}

/** What the simulated read of the dash photo asks (§3.3 D-09, §7.3): nothing within ±5 km; the digit question when
 *  exactly one digit position differs; the check screen when more than one does AND the gap exceeds
 *  max(50 km, 20 % of planned); otherwise nothing. No expected value (basis `NONE`) → nothing to compare against. */
export function readVerdict(expected: Km | null, read: Km | null, plannedKm: Km | null): ReadVerdict {
  if (read === null) return { kind: 'NO_READ' };
  if (expected === null) return { kind: 'OK' };
  const gap = distance(expected, read);
  if (lte(gap, AGREE_KM)) return { kind: 'OK' };
  const digits = differingDigits(expected, read);
  const [index] = digits;
  if (digits.length === 1 && index !== undefined) {
    return { kind: 'DIGIT', index, readDigit: String(read).charAt(index), expectedDigit: String(expected).charAt(index) };
  }
  return gt(gap, tolerance(plannedKm)) ? { kind: 'CHECK' } : { kind: 'OK' };
}

/** «ФОТО» when the photo's read agrees with the confirmed value within ±5 km; otherwise «ПЛАН ✓», which joins the
 *  day's «Звірте з фото» sample. */
export function storedSource(confirmed: Km, read: Km | null): 'DASH_PHOTO' | 'PLAN_CONFIRMED' {
  return read !== null && lte(distance(confirmed, read), AGREE_KM) ? 'DASH_PHOTO' : 'PLAN_CONFIRMED';
}

/** §7.3 flags, in FLAG_CODES order. Recorded on the accepted record, never blocking. An «Об'їзд» (`detour`)
 *  suppresses `OFF_PLAN` for its leg. With no value or no previous reading only `TYPED` / `UNREAD` can apply. */
export function odometerFlags(i: { value: Km | null; last: Km | null; plannedKm: Km | null; typed: boolean;
  photoTaken: boolean; unread: boolean; detour: boolean }): FlagCode[] {
  const flags: FlagCode[] = [];
  if (i.value !== null && i.last !== null) {
    const delta = i.value - i.last;
    if (lt(delta, 0)) flags.push('ODOMETER_BACKWARDS');
    if (i.plannedKm !== null && !i.detour && gt(distance(delta, i.plannedKm), tolerance(i.plannedKm))) {
      flags.push('ODOMETER_OFF_PLAN');
    }
    if (gt(delta, JUMP_KM)) flags.push('ODOMETER_JUMP');
    if (i.plannedKm !== null && gt(i.plannedKm, 0) && lte(delta, STALE_KM)) flags.push('ODOMETER_STALE');
  }
  if (i.typed && i.photoTaken) flags.push('ODOMETER_TYPED');
  if (i.unread) flags.push('ODOMETER_UNREAD');
  return flags;
}

/** The keypad's reserved line and the check screen without a read (§3.3 D-09): a typed value that goes backwards,
 *  jumps over 1 500 km, or misses the plan by more than max(50 km, 20 %) — in the product's words (§0.3).
 *  `fromLabel` is the genitive place label («Злагоди»). null when the value is plausible or there is nothing to
 *  compare it with. */
export function typedWarning(value: Km, last: Km | null, plannedKm: Km | null, fromLabel: string | null): string | null {
  if (last === null) return null;
  const delta = value - last;
  const backwards = lt(delta, 0);
  const offPlan = plannedKm !== null && gt(distance(delta, plannedKm), tolerance(plannedKm));
  if (!backwards && !offPlan && !gt(delta, JUMP_KM)) return null;
  if (plannedKm !== null && gt(plannedKm, 0)) {
    const from = fromLabel === null ? '' : `від «${fromLabel}» `;
    return `Перевірте: ${from}за планом ${fmtKm(plannedKm)} км, а тут ${signed(delta)} км`;
  }
  if (backwards) return `Перевірте: менше, ніж було — ${fmtKm(last)} км`;
  return `Перевірте: ${signed(delta)} км ${fromLabel === null ? 'від попереднього числа' : `від «${fromLabel}»`}`;
}

/** The reading every expectation starts from: the latest point strictly before `before` by `at` (occurred_at), with
 *  a value, that is not flagged-and-unresolved (§7.3). Equal instants keep the later point in the list.
 *  `place_short` is null: a point carries only `place_id`, and the caller that owns the places names it. */
export function lastTrustedOf(points: OdometerPoint[], before: Instant): LastTrusted | null {
  let best: { point: OdometerPoint; value: Km } | null = null;
  for (const point of points) {
    if (point.flagged || point.value === null || !isBefore(point.at, before)) continue;
    if (best === null || cmpInstant(point.at, best.point.at) !== -1) best = { point, value: point.value };
  }
  if (best === null) return null;
  const { point, value } = best;
  const kind: LastTrusted['kind'] = point.kind === 'MECHANIC' ? 'MECHANIC'
    : point.kind === 'SHIFT_START' ? 'SHIFT_START'
      : point.kind === 'SHIFT_END' && point.at_base ? 'SHIFT_END_AT_BASE'
        : 'POINT';
  return { value, at: point.at, kind, place_short: null };
}
