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
 *  Enter would write the stop twice and, through `invalidateQueries`, refetch the page under the operator's cursor.
 *  THE GUARD SURVIVES THE ANSWER, which is the half a first reading misses: Enter commits «0748», the mutation
 *  invalidates, the refetch answers `value: '07:48'`, and a prop-change branch that dropped the guard would let the
 *  next blur write the same time a second time — a second `SET_FIELD`, a second audit line «Ввела прибуття 07:48 ·
 *  ТТН 004517» and a second version bump for one keystroke, none of which changes the screen, so no assertion about
 *  the screen can catch it (measured in W2-06 and carried here as a drive).
 *
 *  `disabled` is §4.2 C-04's confirmed day: the day is read-only until somebody opens it for a correction, and the
 *  field says so by being unusable rather than by taking the keystrokes and letting the server answer
 *  `DAY_CONFIRMED` under a footer that has already said the same thing. */
import { useId, useRef, useState, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';

const digitsOf = (v: string | null): string => (v ?? '').replace(/\D/g, '').slice(0, 4);
const shown = (digits: string): string => (digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);

export function TimeInput({ label, value, onCommit, onFocus, error = null, disabled = false }: {
  label: string;
  value: string | null;
  onCommit(v: string): void;
  onFocus?(): void;
  error?: string | null;
  disabled?: boolean;
}): JSX.Element {
  const id = useId();
  const [seen, setSeen] = useState(value);
  const [digits, setDigits] = useState(() => digitsOf(value));
  const sent = useRef<string | null>(null);
  // The prop is the truth: when the page answers with a stored value, adopt it (React's "adjust state on prop change").
  if (seen !== value) {
    const answered = digitsOf(value);
    setSeen(value);
    setDigits(answered);
    // The page answering with the value this field just SENT is not a new value: keeping the guard is what makes the
    // blur after Enter silent. Any other value came from somewhere else, and the next commit must be allowed.
    if (sent.current !== answered) sent.current = null;
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
        disabled={disabled}
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
          'disabled:cursor-default disabled:opacity-50',
          error === null ? 'border-line-strong' : 'border-reject',
        )}
      />
      {error === null ? null : <p className="text-[13px] leading-[1.4] text-reject">{error}</p>}
    </div>
  );
}
