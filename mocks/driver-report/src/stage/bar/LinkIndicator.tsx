// mocks/driver-report/src/stage/bar/LinkIndicator.tsx
/** «Телефон ─ ─ ─ Офіс» — the handoff, made visible (§5.4 #12, §5.9 #2).
 *
 *  The claim the demo is built to prove is that the office sees a driver's tap within half a second. A viewer can
 *  watch the phone and the console, but the SEAM between them is invisible: this 120 × 16 strip is it. Idle, the
 *  dashes are still and `#3a4a53`. While a record or a photo is in flight the dashes run left to right in
 *  `--stage-accent`, 600 ms per transfer. Offline they stop, turn `--stage-hold`, and say how many records are
 *  waiting — the state that makes «Такт 7 · Заправка без зв'язку» legible from the back of the room.
 *
 *  In flight is counted from the server's own `transfer` events rather than from the outbox, because a photo upload
 *  is a transfer with no row of its own; a phone reloaded mid-transfer simply stops emitting, so the count is
 *  re-read from zero on the next «Такт». */
import { useEffect, useState, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { pluralN } from '../../app/format';
import { server } from '../../api/server';
import { useServerValue } from '../../app/live';
import { STAGE_PHONES } from '../hub';

const IDLE = '#3a4a53';
const LABEL = 'Телефон ─ ─ ─ Офіс';

export function LinkIndicator({ offline }: { offline: boolean }): JSX.Element {
  const waiting = useServerValue((s) =>
    STAGE_PHONES.reduce((n, p) =>
      n + (s.devices[p.id]?.outbox ?? []).filter((e) => e.state !== 'DONE' && !e.undone).length, 0));
  const [inFlight, setInFlight] = useState(0);

  useEffect(() => server.subscribe((e) => {
    if (e.type !== 'transfer') return;
    setInFlight((n) => (e.phase === 'start' ? n + 1 : Math.max(0, n - 1)));
  }), []);

  const held = offline && waiting !== 0;
  const sending = !offline && inFlight !== 0;
  const text = held ? `Офлайн: ${pluralN(waiting, ['запис', 'записи', 'записів'])} чекає` : null;
  const stroke = offline ? 'var(--stage-hold)' : sending ? 'var(--stage-accent)' : IDLE;

  return (
    <div
      role="img"
      aria-label={text ?? LABEL}
      className={cn('flex shrink-0 items-center gap-[6px] text-[12px]',
        offline ? 'text-stage-hold' : 'text-stage-text-2')}
    >
      {text === null ? <span>Телефон</span> : null}
      <svg width={120} height={16} viewBox="0 0 120 16" aria-hidden="true" focusable="false">
        <line
          x1={0}
          y1={8}
          x2={120}
          y2={8}
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="8 16"
          className={cn(sending && 'motion-safe:animate-[link-dash_600ms_linear_infinite]')}
        />
      </svg>
      <span>{text ?? 'Офіс'}</span>
    </div>
  );
}
