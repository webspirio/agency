// mocks/driver-report/src/components/driver/DayDoneCard.tsx
/** Home mode E (§3.3 D-02, §8.2 D-02 #9): the shift is over. Four facts and no action — mode E is the one home mode
 *  with NO accent fill anywhere on the screen, because there is nothing left for the driver to advance today.
 *
 *  The card closes the day in the driver's own units: when he was on shift, how many documents the office already
 *  has, and which paper he still owes. Everything else about the day — the stops, the readings, the office's ТТН
 *  times — lives in «Мій день» (D-15), one tap away, and repeating it here would make the last screen of the day the
 *  longest one. */
import type { JSX } from 'react';
import { fmtDur, fmtTime } from '../../app/format';
import type { DaySummaryView } from '../../domain/dto';

export function DayDoneCard({ day }: { day: DaySummaryView }): JSX.Element {
  const ended = day.ended_at;
  const lines = [
    ended === null
      ? `На зміні з ${fmtTime(day.started_at)} · ${fmtDur(day.on_shift_min)}`
      : `На зміні ${fmtTime(day.started_at)} – ${fmtTime(ended)} · ${fmtDur(day.on_shift_min)}`,
    `Документи: ${day.docs_in_office} з ${day.docs_total} в офісі`,
    ...(day.owed.length === 0 ? [] : [`Здайте в офіс: ТТН ${day.owed.join(', ')}`]),
  ];
  return (
    <section className="card-ring flex flex-col gap-2 p-3">
      <h2 className="text-[1.625rem] leading-[2rem] font-semibold tracking-[-0.015em]">
        {ended === null ? 'Зміну закінчено' : `Зміну закінчено ${fmtTime(ended)}`}
      </h2>
      {lines.map((text) => (
        <p key={text} className="text-[1rem] leading-[1.375rem] tnum" style={{ color: 'var(--text-2)' }}>{text}</p>
      ))}
    </section>
  );
}
