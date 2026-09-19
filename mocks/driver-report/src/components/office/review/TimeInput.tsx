// mocks/driver-report/src/components/office/review/TimeInput.tsx
/** A handwritten time copied off the back of a ТТН (§4.2 C-04): four digits in, «07:48» on screen.
 *
 *  FOUR DIGITS, NOT A TIME PICKER. The operator is reading a number somebody wrote by hand and typing it while
 *  looking at the photo, not choosing a moment: a picker costs a pointer trip and a glance away from the paper, and
 *  a `<input type="time">` renders the browser's own chrome in the browser's own locale. So the field takes digits,
 *  swallows everything else, caps at four, and only then shows the colon — which is also why the colon appears at
 *  the fourth keystroke rather than the third: a half-formed «07:4» reads as a value the operator has finished.
 *
 *  It COMMITS the four raw digits, never the rendered string: `reviewStop SET_FIELD` declares `VALUE_INVALID` as
 *  «Час — чотири цифри, наприклад 0748.», so the wire carries exactly what that sentence describes.
 *
 *  Enter and blur commit the same value, and the same value never commits twice — a field that fires on blur AFTER
 *  Enter would write the stop twice and, through `invalidateQueries`, refetch the page under the operator's cursor. */
import { useId, useRef, useState, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';

const digitsOf = (v: string | null): string => (v ?? '').replace(/\D/g, '').slice(0, 4);
const shown = (digits: string): string => (digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);

export function TimeInput({ label, value, onCommit, onFocus, error = null }: {
  label: string;
  value: string | null;
  onCommit(v: string): void;
  onFocus?(): void;
  error?: string | null;
}): JSX.Element {
  const id = useId();
  const [seen, setSeen] = useState(value);
  const [digits, setDigits] = useState(() => digitsOf(value));
  const sent = useRef<string | null>(null);
  // The prop is the truth: when the page answers with a stored value, adopt it (React's "adjust state on prop change").
  if (seen !== value) {
    setSeen(value);
    setDigits(digitsOf(value));
    sent.current = null;
  }

  const commit = (): void => {
    if (digits.length !== 4 || sent.current === digits) return;
    sent.current = digits;
    onCommit(digits);
  };

  return (
    <div className="flex flex-col gap-[4px]">
      <label htmlFor={id} className="text-[13px] leading-[1.3] text-text-2">{label}</label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={shown(digits)}
        onChange={(e) => {
          setDigits(digitsOf(e.target.value));
          sent.current = null;
        }}
        onFocus={onFocus}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className={cn(
          'h-[40px] w-[104px] rounded-[8px] border bg-label px-[10px] font-mono text-[16px] leading-none text-ink',
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
          error === null ? 'border-line-strong' : 'border-reject',
        )}
      />
      {error === null ? null : <p className="text-[13px] leading-[1.4] text-reject">{error}</p>}
    </div>
  );
}
