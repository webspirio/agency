// mocks/driver-report/src/pages/office/trucks/FuelTab.tsx
/** The «Пальне» tab of C-13 (§4.2 C-13, §8.3 C-12/C-13 #2).
 *
 *  Four cells that each say where their litres CAME FROM — the fuel-card statement, the photographed receipts, the
 *  level sensor, and the fact against the norm — then what does not reconcile, then the norm itself. That order is the
 *  argument: a single «пальне за місяць» figure is the report KTL already cannot trust, and every cell here names its
 *  source and its confession («імітація», «не звірено») instead.
 *
 *  **There is no ПДВ column, and there is no over-norm figure for one, anywhere on this page** [02 UC-A02]. Without a
 *  norm наказ there is a deviation and a hold sentence saying exactly that — «Норму КТЛ не затверджено — надлишок для
 *  ПДВ не рахується» — and nothing more. Adding a column here would invent a tax position on a demo screen.
 *
 *  Every string is `src/domain/views/reports.ts`'s; this file chooses none of them and composes none of them. The one
 *  arithmetic it does is turning a `Dec1` rate into an integer number of tenths for the sparkline's GEOMETRY, which is
 *  a pixel path and not money: `toInt` parses the digits, and no float, `Number()` or `parseFloat` is involved. */
import type { JSX } from 'react';
import { Sparkline } from '@agency/kit/sparkline';
import { Panel } from '../../../components/office';
import { SummaryCell } from '../../../components/office/review';
import type { TruckFuel } from '../../../domain/dto';
import { toInt } from '../../../domain/num';

/** '33.9' → 339. Tenths of a litre per 100 km as an INTEGER, so the sparkline scales a path without a float and
 *  without a coercion. Rates are non-negative by construction (a consumption cannot be negative), which is why the
 *  sign is not peeled off here — `toInt` would refuse anything else loudly rather than silently. */
function tenths(rate: string): number {
  const [whole = '0', frac = ''] = rate.split('.');
  return toInt(whole) * 10 + toInt(`${frac}0`.slice(0, 1));
}

export function FuelTab({ view }: { view: TruckFuel }): JSX.Element {
  const norm = view.norm_block;
  return (
    <div className="flex flex-col gap-[16px] px-[20px] py-[16px]">
      <div className="grid gap-[12px] sm:grid-cols-2 xl:grid-cols-4">
        {view.cells.map((cell) => <SummaryCell key={cell.label} cell={cell} />)}
      </div>

      <Panel title={`Розбіжності · ${String(view.mismatches.length)}`}>
        {view.mismatches.length === 0 ? (
          <p className="px-[20px] py-[16px] text-[14px] text-text-2">Усі транзакції виписки мають чек.</p>
        ) : (
          <ul className="flex flex-col gap-[8px] px-[20px] py-[16px]">
            {view.mismatches.map((line) => (
              <li key={line} className="text-[14px] leading-[1.5] text-ink">{line}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Норма">
        <div className="flex flex-col gap-[12px] px-[20px] py-[16px]">
          <p className="text-[14px] leading-[1.5] text-hold">{norm.hold}</p>
          {norm.lines.map((line) => (
            <p key={line} className="text-[14px] leading-[1.5] text-text-2">{line}</p>
          ))}
          {norm.trend.length === 0 ? null : (
            <div className="flex flex-col gap-[6px]">
              <div className="max-w-[320px]">
                <Sparkline values={norm.trend.map(tenths)} height={40} zeroBased={false} color="var(--ink)" />
              </div>
              <p className="font-mono text-[13px] tabular-nums text-text-2">{norm.trend_label}</p>
            </div>
          )}
          {norm.dispatcher.map((line, i) => (
            <p key={line} className={i === 0 ? 'text-[14px] leading-[1.5] text-hold' : 'text-[14px] leading-[1.5] text-text-2'}>
              {line}
            </p>
          ))}
        </div>
      </Panel>
    </div>
  );
}
