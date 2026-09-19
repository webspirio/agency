// mocks/driver-report/src/components/driver/capture/OdometerStep.tsx
/** The odometer step of §3.3 D-09 — the one screen that appears inside five different flows (D-03 shift start, D-04
 *  arrival, D-08 deferred capture, D-10 refuel, D-14 shift end) and always looks the same.
 *
 *  THE WHOLE POINT IS THAT THE DRIVER CONFIRMS A NUMBER RATHER THAN TYPES ONE. Typing is where the transpositions
 *  come from (EC-16: 318 405 for 381 405; a dropped digit turning 412 355 into 41 235), so the keypad is tier 3 and
 *  everything above it is one tap. What the step may offer is decided ENTIRELY by `expectedOdometer` (I-12): this
 *  file renders `expected.value` and `expected.line` and never computes a number of its own — which is what keeps
 *  §8.6 #2, the stale prefill, impossible to reintroduce here.
 *
 *  Four screens, in the order the verdict picks them:
 *
 *  - TIER 1, no screen at all. On an R+C truck the CAN reading IS the odometer, so the step commits itself and
 *    renders nothing (choice `AUTO`, source `CAN`). `useCommitOnce` makes that exactly one commit however the effect
 *    is scheduled (EC-137, §8.6 #13).
 *  - CONFIRM. DigitStrip, the big number, `expected.line`, the confession chip, primary «Так, <value>». With basis
 *    `NONE` there is no number to show (D6, EC-19): the primary becomes «Добре — хай офіс прочитає» and the row's
 *    second half «Ввести число». A number offered there would be the last reading copied forward — the one thing
 *    this design forbids.
 *  - DIGIT, «Перевірте цифру». The read differs from the expected value in exactly one position, so the app asks
 *    about that position and NOTHING ELSE: two equal 4rem outline buttons, no accent anywhere on the screen (a test
 *    counts `[data-accent]` and finds none). The app does not lean, because the driver is the one looking at the
 *    cluster (EC-15, 03 S3.6).
 *  - CHECK, «Перевірте число». More than one digit differs, or a typed value is implausible. Both values are on
 *    offer, «Так, правильно» keeps what is there (`KEPT_AS_IS`), and nothing blocks: the record is saved and flagged
 *    either way (§7.5, §8.6 #11).
 *
 *  STORED SOURCE IS NOT A CHOICE MADE HERE EITHER. `storedSource(confirmed, read)` decides «ФОТО» vs «ПЛАН ✓» from
 *  the agreement between the photo's read and the value the driver confirmed, so a confirmed value that the photo
 *  does not support joins the day's «Звірте з фото» sample instead of passing as a photo reading. */
import { type JSX, useEffect, useState } from 'react';
import { Camera, Check, EyeOff, Keyboard } from 'lucide-react';
import { fmtKm } from '../../../app/format';
import { useCommitOnce } from '../../../app/flow';
import type { CapturedPage } from '../../../app/records';
import { toInt } from '../../../domain/num';
import { type Expected, readVerdict, storedSource, typedWarning } from '../../../domain/odometer';
import type { Km, Odometer, OdometerBasis, OdometerChoice, OdometerSource } from '../../../domain/types';
import { SimChip } from '../../shared';
import { ActionBar, PrimaryAction, QuietButton } from '../index';
import { DigitStrip } from './DigitStrip';
import { Keypad } from './Keypad';

const RETAKE = 'Перезняти';
const OTHER_NUMBER = 'Інше число';
const TYPE_NUMBER = 'Ввести число';
const CANNOT_READ = 'Не видно — хай офіс прочитає';
const OFFICE_READS_OK = 'Добре — хай офіс прочитає';
const AS_IS = 'Так, правильно';
const DIGIT_TITLE = 'Перевірте цифру';
const CHECK_TITLE = 'Перевірте число';
/** The confession every mock-supplied number carries (§6.5, D9). A real camera frame says so in its own words,
 *  because nothing read it: the number beside it came from the plan, not from the picture. */
const CHIP_DRAWN = 'імітація: число підставлене';
const CHIP_REAL = 'Макет: число підставлене, не розпізнане';

/** What the check screen calls the value the app expected. `expectedOdometer` already words the basis line this way
 *  («· за планом 116», «· за CAN»); `LAST_AT_BASE` and `MECHANIC` anchor on a previous READING, which the driver's
 *  own words call «було» (EC-16). `NONE` never reaches a check: with no expected value there is nothing to check. */
const ANCHOR: Record<OdometerBasis, string> = {
  PLANNED_KM: 'за планом', CAN_DELTA: 'за CAN', LAST_AT_BASE: 'було', MECHANIC: 'було', NONE: 'було',
};

const digitsOf = (read: Km | null, photo: CapturedPage | null): string | null => {
  if (read !== null) return String(read);
  const drawn = photo?.drawn?.sim_read?.replace(/\D/gu, '') ?? '';
  return drawn === '' ? null : drawn;
};

/** One of the two equal offers of the digit question and the check screen. `aria-label` carries the whole label as
 *  one string because the two halves are two type sizes and an accessible name assembled from separate elements
 *  depends on their display — this one reads «5 — 412 566» whatever the layout does to it. Equal width, equal weight
 *  and never `data-accent`: the app does not lean (§3.3 D-09, EC-15). */
function OfferButton({ lead, value, stacked = false, onPress }: {
  lead: string;
  value: Km;
  stacked?: boolean;
  onPress(): void;
}): JSX.Element {
  const shown = fmtKm(value);
  return (
    <button
      type="button"
      aria-label={`${lead} — ${shown}`}
      onClick={onPress}
      className={`flex h-tap-lg flex-1 items-center justify-center rounded-[12px] px-2 ${
        stacked ? 'flex-col gap-[0.125rem]' : 'gap-2'
      }`}
      style={{ color: 'var(--cam-ink)', boxShadow: 'inset 0 0 0 1px var(--cam-line-strong)' }}
    >
      <span
        aria-hidden="true"
        className={stacked
          ? 'text-[0.875rem] leading-none font-medium'
          : 'font-mono text-[1.75rem] leading-none font-semibold'}
        style={stacked ? { color: 'var(--cam-text-2)' } : undefined}
      >
        {lead}
      </span>
      <span
        aria-hidden="true"
        className={`font-mono leading-none ${stacked ? 'text-[1.5rem] font-semibold' : 'text-[1rem] font-medium'}`}
      >
        {shown}
      </span>
    </button>
  );
}

export function OdometerStep({ expected, read, rc, photo, realFrame, plannedKm, last, fromLabel, onRetake, onDone }: {
  expected: Expected;
  read: Km | null;
  rc: boolean;
  photo: CapturedPage | null;
  realFrame: boolean;
  plannedKm: Km | null;
  last: Km | null;
  fromLabel: string | null;
  onRetake(): void;
  onDone(o: Odometer): void;
}): JSX.Element {
  const commit = useCommitOnce();
  const [onKeypad, setOnKeypad] = useState(false);
  const [typed, setTyped] = useState<{ value: Km; warning: string } | null>(null);

  const hand = (value: Km | null, source: OdometerSource, choice: OdometerChoice): void => {
    commit.run(() => onDone({ value, source, basis: expected.basis, expected: expected.value, read, choice,
      page_key: null }));
  };
  // Tier 1: on an R+C truck the CAN delta IS the reading, so there is no screen and no tap (§3.3 D-09).
  const auto = rc && expected.basis === 'CAN_DELTA' && expected.value !== null;
  const autoValue = expected.value;
  useEffect(() => {
    if (auto && autoValue !== null) {
      commit.run(() => onDone({ value: autoValue, source: 'CAN', basis: 'CAN_DELTA', expected: autoValue, read,
        choice: 'AUTO', page_key: null }));
    }
    // Mount only, deliberately: the CAN reading cannot change under a screen that never renders. `useCommitOnce` is
    // what makes it ONE commit even if React were to run this effect twice (EC-137, §8.6 #13).
  }, []);
  if (auto) return <></>;

  const typeNumber = (): void => { setTyped(null); setOnKeypad(true); };
  const fromKeypad = (v: string | null): void => {
    setOnKeypad(false);
    if (v === null) { hand(null, 'UNREAD', 'UNREAD'); return; }
    const value = toInt(v);
    const warning = typedWarning(value, last, plannedKm, fromLabel);
    if (warning === null) { hand(value, 'DRIVER_TYPED', 'TYPED'); return; }
    setTyped({ value, warning });
  };

  if (onKeypad) {
    return (
      <Keypad
        initial={expected.value === null ? '' : String(expected.value)}
        deltaLine={(v) => (v === '' ? '' : expected.deltaLine(toInt(v)))}
        warn={(v) => (v === '' ? null : typedWarning(toInt(v), last, plannedKm, fromLabel))}
        onDone={fromKeypad}
      />
    );
  }

  const verdict = readVerdict(expected.value, read, plannedKm);
  const digits = digitsOf(read, photo);
  const strip = (boxedIndex?: number): JSX.Element | null =>
    digits === null ? null : <DigitStrip digits={digits} boxedIndex={boxedIndex} />;
  const row = (second: string): JSX.Element => (
    <div className="flex gap-2">
      <QuietButton icon={Camera} label={RETAKE} dark half onPress={onRetake} />
      <QuietButton icon={Keyboard} label={second} dark half onPress={typeNumber} />
    </div>
  );
  const screen = (children: JSX.Element, bar: JSX.Element): JSX.Element => (
    <div data-surface="dark" className="flex min-h-dvh flex-col bg-cam-bg text-cam-ink">
      <div className="flex-1">
        <div className="mx-auto flex w-full max-w-[35rem] flex-col gap-3 px-gutter pt-3 pb-4">{children}</div>
      </div>
      <ActionBar dark>{bar}</ActionBar>
    </div>
  );
  const title = (text: string): JSX.Element => (
    <h1 className="text-[1.25rem] leading-[1.75rem] font-semibold">{text}</h1>
  );
  const line = (text: string): JSX.Element => (
    <p className="text-[1rem] leading-[1.5rem]" style={{ color: 'var(--cam-text-2)' }}>{text}</p>
  );

  // The check screen after a typed value: no read to compare with, so the arithmetic stands alone (EC-16, EC-18).
  if (typed !== null) {
    const kept = typed;
    return screen(
      <>
        {title(CHECK_TITLE)}
        {strip()}
        <p className="font-mono text-[2.5rem] leading-[3rem] font-semibold">{fmtKm(kept.value)}</p>
        <p className="text-[1.125rem] leading-[1.625rem] font-medium" style={{ color: 'var(--cam-hold)' }}>
          {kept.warning}
        </p>
      </>,
      <>
        <PrimaryAction icon={Camera} verb={RETAKE} dark busy={commit.busy} onPress={onRetake} />
        <QuietButton icon={Keyboard} label={OTHER_NUMBER} dark onPress={typeNumber} />
        <QuietButton label={AS_IS} dark onPress={() => hand(kept.value, 'DRIVER_TYPED', 'KEPT_AS_IS')} />
      </>,
    );
  }

  if (verdict.kind === 'DIGIT' && expected.value !== null && read !== null) {
    const shown = expected.value;
    return screen(
      <>
        {title(DIGIT_TITLE)}
        {strip(verdict.index)}
        <p className="text-[1.125rem] leading-[1.625rem] font-medium">
          На щитку {verdict.expectedDigit} чи {verdict.readDigit}?
        </p>
      </>,
      <>
        <div className="flex gap-2">
          <OfferButton lead={verdict.expectedDigit} value={shown}
            onPress={() => hand(shown, storedSource(shown, read), 'DIGIT_EXPECTED')} />
          <OfferButton lead={verdict.readDigit} value={read}
            onPress={() => hand(read, storedSource(read, read), 'DIGIT_READ')} />
        </div>
        {row(OTHER_NUMBER)}
      </>,
    );
  }

  if (verdict.kind === 'CHECK' && expected.value !== null && read !== null) {
    const shown = expected.value;
    return screen(
      <>
        {title(CHECK_TITLE)}
        {strip()}
        {line(`На фото: ${fmtKm(read)} · ${ANCHOR[expected.basis]} ~${fmtKm(shown)}`)}
        <div className="flex gap-2">
          <OfferButton stacked lead="з фото" value={read}
            onPress={() => hand(read, storedSource(read, read), 'DIGIT_READ')} />
          <OfferButton stacked lead={ANCHOR[expected.basis]} value={shown}
            onPress={() => hand(shown, storedSource(shown, read), 'DIGIT_EXPECTED')} />
        </div>
      </>,
      <>
        <PrimaryAction icon={Camera} verb={RETAKE} dark busy={commit.busy} onPress={onRetake} />
        <QuietButton icon={Keyboard} label={OTHER_NUMBER} dark onPress={typeNumber} />
        <QuietButton label={AS_IS} dark onPress={() => hand(read, storedSource(read, read), 'KEPT_AS_IS')} />
      </>,
    );
  }

  // Basis NONE: the photo goes to the office with no number beside it (D6, EC-19). The last reading + 0 that would
  // otherwise fill this space is exactly the stale prefill of §8.6 #2.
  if (expected.value === null) {
    return screen(
      <>
        {strip()}
        {line(expected.line)}
      </>,
      <>
        <PrimaryAction icon={EyeOff} verb={OFFICE_READS_OK} dark busy={commit.busy}
          onPress={() => hand(null, 'UNREAD', 'UNREAD')} />
        {row(TYPE_NUMBER)}
      </>,
    );
  }

  const shown = expected.value;
  return screen(
    <>
      {strip()}
      <p className="font-mono text-[2.5rem] leading-[3rem] font-semibold">{fmtKm(shown)}</p>
      {line(expected.line)}
      <div><SimChip text={realFrame ? CHIP_REAL : CHIP_DRAWN} /></div>
    </>,
    <>
      <PrimaryAction icon={Check} verb={`Так, ${fmtKm(shown)}`} dark busy={commit.busy}
        onPress={() => hand(shown, storedSource(shown, read), 'CONFIRMED')} />
      {row(OTHER_NUMBER)}
      <QuietButton icon={EyeOff} label={CANNOT_READ} dark onPress={() => hand(null, 'UNREAD', 'UNREAD')} />
    </>,
  );
}
