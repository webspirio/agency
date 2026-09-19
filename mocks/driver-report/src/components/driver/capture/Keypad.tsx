// mocks/driver-report/src/components/driver/capture/Keypad.tsx
/** «Інше число» — tier 3 of §3.3 D-09, and the last resort on every odometer step. Dark, because the step it replaces
 *  is dark and the driver has the cluster in front of him.
 *
 *  Three things here are load-bearing, and each is a measured failure somewhere in `docs/projects/diver-report`:
 *
 *  1. THE READOUT HOLDS THE EXPECTED VALUE, FULLY SELECTED. Offering an empty box invites a transposition
 *     (EC-16: 318 405 for 381 405); offering a value the driver must clear first invites an APPENDED digit. Selected
 *     text does both jobs at once — it reads as the suggestion and the first key replaces it whole. The input is
 *     `readOnly` so the OS keyboard never opens over the keys; `pristine` is what «selected» means in state, and it
 *     survives the blur that clicking a key causes, which a DOM selection does not.
 *  2. THE WARNING LINE IS RESERVED, NOT CONDITIONAL. `data-reserved-line` is always in the DOM at 1.5rem, empty or
 *     not, so «Перевірте: …» appears without moving a single key under a thumb already travelling (§8.2 D-09 #3,
 *     R00 F9). A conditional line is the same defect as a layout shift.
 *  3. «Готово» IS NEVER DISABLED, AND EMPTY IS AN ANSWER. Nothing on the driver route blocks (§8.6 #11). An empty
 *     «Готово» asks «Порожньо — хай офіс прочитає з фото?» in that same reserved line, and the SECOND «Готово»
 *     returns null — which the caller stores as `UNREAD` (D6, EC-19). Two taps to hand the number to the office, no
 *     dialog, no refusal.
 *
 *  Seven digits is the ceiling: an odometer of a truck that could reach 9 999 999 km does not exist, and the cap is
 *  what stops a stuck thumb from producing a number the plausibility line would then have to explain. */
import { type JSX, useEffect, useRef, useState } from 'react';
import { Check, Delete } from 'lucide-react';
import { lt } from '../../../domain/num';
import { ActionBar, PrimaryAction } from '../index';

/** 3 × 4 of 4rem (§3.3 D-09 tier 3): 1–9 in three rows, then «Стерти» · 0 · «Очистити». */
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const MAX_DIGITS = 7;
/** Asked in the reserved line by the first empty «Готово»; the second one answers it (D6). */
const EMPTY_ASK = 'Порожньо — хай офіс прочитає з фото?';
const CLEAR = 'Очистити';
const ERASE = 'Стерти';
const DONE = 'Готово';

const KEY_CLASS = 'flex h-tap-lg items-center justify-center rounded-[12px]';
const keyStyle = { color: 'var(--cam-ink)', boxShadow: 'inset 0 0 0 1px var(--cam-line-strong)' };

export function Keypad({ initial, deltaLine, warn, onDone }: {
  initial: string;
  deltaLine(v: string): string;
  warn(v: string): string | null;
  onDone(v: string | null): void;
}): JSX.Element {
  const [value, setValue] = useState(initial);
  const [pristine, setPristine] = useState(true);
  const [askedEmpty, setAskedEmpty] = useState(false);
  const readout = useRef<HTMLInputElement>(null);

  // The «fully selected» of §3.3 D-09, done to the real input so it LOOKS selected; `pristine` is what actually
  // decides that the first digit replaces rather than appends, because the click that delivers it blurs this input.
  useEffect(() => { readout.current?.select(); }, []);

  const write = (next: string): void => {
    setValue(next);
    setPristine(false);
    setAskedEmpty(false);
  };
  const press = (digit: string): void => {
    const base = pristine ? '' : value;
    write(lt(base.length, MAX_DIGITS) ? `${base}${digit}` : base);
  };
  const erase = (): void => write(pristine ? '' : value.slice(0, -1));
  const finish = (): void => {
    if (value !== '') { onDone(value); return; }
    if (askedEmpty) { onDone(null); return; }
    setAskedEmpty(true);
  };

  const reserved = value === '' ? (askedEmpty ? EMPTY_ASK : '') : (warn(value) ?? '');

  return (
    <div data-surface="dark" className="flex min-h-dvh flex-col bg-cam-bg text-cam-ink">
      <div className="flex-1">
        <div className="mx-auto flex w-full max-w-[35rem] flex-col gap-2 px-gutter pt-3 pb-4">
          <input
            ref={readout}
            type="text"
            readOnly
            inputMode="none"
            aria-label="Одометр"
            value={value}
            className="h-[4.5rem] w-full rounded-[12px] bg-transparent px-4 text-center font-mono text-[2.5rem] leading-none font-semibold"
            style={{ color: 'var(--cam-ink)', boxShadow: 'inset 0 0 0 1.5px var(--cam-line-strong)' }}
          />
          <div className="text-center text-[1rem] leading-[1.5rem]" style={{ color: 'var(--cam-text-2)' }}>
            {deltaLine(value)}
          </div>
          <div
            data-reserved-line=""
            className="h-[1.5rem] overflow-hidden text-center text-[1rem] leading-[1.5rem] font-medium"
            style={{ color: 'var(--cam-hold)' }}
          >
            {reserved}
          </div>
        </div>
      </div>
      <ActionBar dark>
        <div className="grid grid-cols-3 gap-2">
          {DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => press(digit)}
              className={`${KEY_CLASS} font-mono text-[1.75rem] leading-none font-semibold`}
              style={keyStyle}
            >
              {digit}
            </button>
          ))}
          <button type="button" onClick={erase} className={`${KEY_CLASS} gap-1`} style={keyStyle}>
            <Delete aria-hidden="true" className="size-[1.25rem] shrink-0" />
            <span className="text-[0.875rem] leading-none font-semibold">{ERASE}</span>
          </button>
          <button
            type="button"
            onClick={() => press('0')}
            className={`${KEY_CLASS} font-mono text-[1.75rem] leading-none font-semibold`}
            style={keyStyle}
          >
            0
          </button>
          <button type="button" onClick={() => write('')} className={KEY_CLASS} style={keyStyle}>
            <span className="text-[0.875rem] leading-none font-semibold">{CLEAR}</span>
          </button>
        </div>
        <PrimaryAction icon={Check} verb={DONE} dark onPress={finish} />
      </ActionBar>
    </div>
  );
}
