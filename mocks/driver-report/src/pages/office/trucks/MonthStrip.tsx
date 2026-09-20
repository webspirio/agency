// mocks/driver-report/src/pages/office/trucks/MonthStrip.tsx
/** The «Місяць» tab of C-13 (§4.2 C-13): one cell per day of the month that has begun, and under it the key figures
 *  of that truck's C-12 row.
 *
 *  Four states, four drawings, and none of them a colour: CONFIRMED is an ink outline, TODAY the accent ring (the one
 *  place the accent appears on this page — it marks WHERE WE ARE, never a status, D10), OFF is `--bench`, OPEN is a
 *  dashed outline for a day that exists but nobody has confirmed. Each cell also carries a `title` and an
 *  `aria-label`, because a grid of squares is exactly the kind of thing that says nothing in words unless it is made
 *  to (§8.5).
 *
 *  Every figure under the strip arrives finished on `TruckMonthRow`; this file formats and does not compute. The month
 *  is month-to-date by D14 — 1–21.09 on the demo day — because a figure dated after the day on screen would be a
 *  contradiction the owner reads before anyone explains it. */
import type { JSX } from 'react';
import { fmtDec, fmtKm, fmtPct, fmtRate } from '../../../app/format';
import type { TruckFuel, TruckMonthRow } from '../../../domain/dto';
import { SimChip } from '../../../components/shared';

type Cell = TruckFuel['month_strip'][number];

const CELL: Record<Cell['state'], string> = {
  CONFIRMED: 'border border-ink text-ink',
  TODAY: 'border border-accent-ink ring-2 ring-accent-ink/35 text-ink',
  OPEN: 'border border-dashed border-line-strong text-text-2',
  OFF: 'bg-bench text-text-2',
};
const SAYS: Record<Cell['state'], string> = {
  CONFIRMED: 'підтверджено',
  TODAY: 'сьогодні',
  OPEN: 'не підтверджено',
  OFF: 'без зміни',
};
const NONE = '—';

/** «Днів 16» … — the C-12 row again, as a definition list, because that is what it is. */
function figures(m: TruckMonthRow): { label: string; value: string; sim: boolean }[] {
  return [
    { label: 'Днів', value: String(m.days), sim: false },
    { label: 'Км (з вантажем)', value: `${fmtKm(m.km)} (${fmtKm(m.km_loaded)})`, sim: false },
    { label: 'Пальне, л/100 (метод)', value: `${fmtRate(m.fuel_rate)} ${m.method_label}`, sim: m.simulated },
    { label: 'Норма', value: fmtRate(m.norm), sim: false },
    { label: 'Відхилення', value: fmtPct(m.deviation), sim: false },
    { label: 'Пальне, грн', value: fmtDec(m.fuel_uah), sim: false },
    { label: 'На точках, год', value: String(m.site_hours), sim: false },
    { label: 'Простій понад безкоштовні', value: m.idle_over_free ?? NONE, sim: false },
    { label: 'Документи вчасно', value: m.docs_on_time, sim: false },
    { label: 'Днів підтверджено', value: m.days_confirmed, sim: false },
  ];
}

export function MonthStrip({ strip, month }: { strip: Cell[]; month: TruckMonthRow | null }): JSX.Element {
  return (
    <div className="flex flex-col gap-[16px] px-[20px] py-[16px]">
      <ul className="flex flex-wrap gap-[6px]">
        {strip.map((cell) => (
          <li
            key={cell.date}
            title={`${cell.date} · ${SAYS[cell.state]}`}
            aria-label={`${cell.date} · ${SAYS[cell.state]}`}
            className={`flex h-[36px] w-[36px] items-center justify-center rounded-[8px] font-mono text-[13px] tabular-nums ${CELL[cell.state]}`}
          >
            {cell.date.slice(8)}
          </li>
        ))}
      </ul>
      {month === null ? (
        <p className="text-[13px] text-text-2">За цей місяць цифр по машині ще немає.</p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-[16px] gap-y-[6px] text-[14px]">
          {figures(month).map((f) => (
            <div key={f.label} className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-line/70 pb-[6px] last:border-b-0">
              <dt className="text-text-2">{f.label}</dt>
              <dd className="flex items-center gap-[6px] font-mono tabular-nums text-ink">
                {f.value}
                {f.sim ? <SimChip /> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
