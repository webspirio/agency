// mocks/driver-report/src/stage/bar/ResetButton.tsx
/** «Скинути демо» (§5.4 #10). Two taps, never one: the first arms the button for three seconds and says so
 *  («Скинути? Ще раз», in hold), the second rebuilds to beat 0 at 05:14.
 *
 *  The arming is the whole control. This button throws away everything the presenter has just done in front of the
 *  client, and it sits on a 40 px bar between two things they will press often — so the cost of an accidental tap is
 *  the demo, and the cost of the confirmation is one extra tap in the one moment nobody is watching the screen. */
import { useEffect, useRef, useState, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { RotateCcw } from 'lucide-react';
import { BAR_CONTROL } from './StageToggle';

/** How long the armed label stands before it forgets (§5.4 #10). */
const ARM_MS = 3000;

export function ResetButton({ onReset }: { onReset(): void }): JSX.Element {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  const disarm = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  const label = armed ? 'Скинути? Ще раз' : 'Скинути демо';
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (armed) {
          disarm();
          onReset();
          return;
        }
        setArmed(true);
        timer.current = setTimeout(() => { timer.current = null; setArmed(false); }, ARM_MS);
      }}
      className={cn(BAR_CONTROL, armed && 'bg-stage-hold-bg text-stage-hold hover:bg-stage-hold-bg')}
    >
      <RotateCcw size={15} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
