// mocks/driver-report/src/stage/bar/BeatCue.tsx
/** What the presenter is supposed to do next, and a warning when a phone does something else (§5.4 #3, EC-165).
 *
 *  The cue is the beat's own sentence — «Такт 7 · «Офлайн» → телефон Павла · «Заправка»» — held on the bar so the
 *  presenter never has to remember the running order while talking.
 *
 *  The warning exists because the stage carries three live phones and only one of them is the beat's. A tap on
 *  another one still runs — nothing is blocked, the demo is not a wizard — but the presenter is now narrating one
 *  phone and showing another, which is the failure this line was written to catch: «Зараз телефон Олега — такт 7
 *  для Павла», for five seconds, then back to the cue.
 *
 *  Only a LIVE write counts. The runner replays script entries through the same route table and marks them
 *  `replayed`, so «Такт» and «Перемотати до…» — which apply other phones' entries by design — never raise it. */
import { useEffect, useState, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { server } from '../../api/server';
import { beatOf, phoneOf } from '../hub';

/** How long the warning holds the cue's place (§5.4 #3). */
const ALERT_MS = 5000;

export function BeatCue({ cue }: { cue: string | null }): JSX.Element {
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = server.subscribe((e) => {
      if (e.type !== 'changed' || e.replayed || e.actor.role !== 'driver') return;
      const beat = beatOf(server.ui.beat);
      if (beat === null || e.actor.id === beat.phone) return;
      const acting = phoneOf(e.actor.id);
      const expected = phoneOf(beat.phone);
      if (acting === null || expected === null) return;
      setAlert(`Зараз телефон ${acting.of} — такт ${beat.n} для ${expected.of}`);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; setAlert(null); }, ALERT_MS);
    });
    return () => {
      off();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  const text = alert ?? cue;
  if (text === null) return <span className="min-w-0 shrink" />;
  return (
    <span
      className={cn('min-w-0 shrink truncate text-[13px] font-medium text-stage-hold',
        alert !== null && 'rounded-[8px] bg-stage-hold-bg px-[8px] py-[4px]')}
    >
      {text}
    </span>
  );
}
