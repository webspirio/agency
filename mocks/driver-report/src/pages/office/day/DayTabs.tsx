// mocks/driver-report/src/pages/office/day/DayTabs.tsx
/** The five readings of one truck-day (§4.2 C-08): «Хронологія» · «Ділянки» · «Пальне» · «Позначки (N)» · «Історія змін».
 *
 *  Хронологія is the default because it is the only one that answers «what happened», and the other four are
 *  re-readings of it: the legs are the chronology divided by place, the fuel block is the chronology's one refuel
 *  with the day's rate around it, the flags are the moments the derivation could not settle, and the history is what
 *  the OFFICE did to it. A waybill that opened on «Ділянки» would present the office's arithmetic before the driver's
 *  record, which is the order this whole product exists to reverse.
 *
 *  «Скільки зберігаємо» (02 UC-O09) sits collapsed under «Історія змін» rather than on a settings page: the question
 *  is asked exactly once, by the accountant looking at an audit trail and wondering how long it lasts. `<details>` is
 *  the disclosure rather than a kit component, because it needs no state and works with JavaScript broken.
 *
 *  Relational operators and `/` are off under `src/pages/**` by design; nothing here is money — every decimal arrives
 *  finished from `src/domain` and is rendered by `src/app/format.ts`. */
import type { JSX } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency/kit/tabs';
import { fmtDec, fmtKm, fmtTime, fmtTonnes } from '../../../app/format';
import { useConsoleMode, type ConsoleMode } from '../../../components/office';
import { SummaryCell, Timeline } from '../../../components/office/review';
import type { LegRow, TruckDayView } from '../../../domain/dto';

/** What the law keeps, and for how long (02 UC-O09). A closed table: nothing here is derived from a day. */
const RETENTION: readonly { what: string; how_long: string }[] = [
  // §0.1 groups an integer with U+00A0, so «1 825» carries one here as every other grouped number in the mock does.
  { what: 'Версії листа, виправлення, підтвердження водія, фото ТТН і актів', how_long: 'не менше 1 825 днів (ПКУ 44.3.2)' },
  { what: 'Записи змін, очікування й робочого часу', how_long: 'не менше 24 місяців (VI п.15)' },
  { what: 'Позначки зв\'язку і GPS у момент натискання', how_long: 'N місяців, встановлює КТЛ' },
  { what: 'Фото в телефоні', how_long: '14 днів після «В офісі ✓»' },
];

const LEG_COLUMNS = ['n', 'route', 'loaded', 'km', 'mass', 'tkm', 'ttn', 'arrival', 'original'] as const;
type LegColumn = (typeof LEG_COLUMNS)[number];

/** §4.1's first promise — never a horizontal scroll — applied to a nine-column table by dropping, not by scrolling. */
const LEG_HIDDEN: Record<ConsoleMode, readonly LegColumn[]> = {
  wide: [],
  compact: ['tkm'],
  rail: ['tkm', 'ttn', 'original'],
  mobile: ['tkm', 'ttn', 'arrival', 'original'],
};

const LEG_HEADERS: Record<LegColumn, string> = {
  n: '№', route: 'Звідки → Куди', loaded: 'З вантажем / порожній', km: 'Км', mass: 'Маса, т', tkm: 'т·км',
  ttn: 'ТТН', arrival: 'Прибуття (водій / ТТН)', original: 'Оригінал',
};

function legCell(leg: LegRow, id: LegColumn): string {
  switch (id) {
    case 'n': return String(leg.n);
    case 'route': return `${leg.from} → ${leg.to}`;
    case 'loaded': return leg.loaded ? 'з вантажем' : 'порожній';
    case 'km': return fmtKm(leg.km);
    case 'mass': return fmtTonnes(leg.mass);
    case 'tkm': return fmtDec(leg.tkm);
    case 'ttn': return leg.ttn.length === 0 ? '—' : leg.ttn.join(', ');
    case 'arrival': {
      if (leg.arrival_driver === null && leg.arrival_ttn === null) return '—';
      return `${leg.arrival_driver === null ? '—' : fmtTime(leg.arrival_driver)} / ${leg.arrival_ttn ?? '—'}`;
    }
    default: return leg.original === 'RECEIVED' ? 'є' : 'немає';
  }
}

const MONO: ReadonlySet<LegColumn> = new Set<LegColumn>(['n', 'km', 'mass', 'tkm', 'arrival']);

function LegsTable({ legs, mode }: { legs: LegRow[]; mode: ConsoleMode }): JSX.Element {
  const hidden = new Set<string>(LEG_HIDDEN[mode]);
  const shown = LEG_COLUMNS.filter((id) => !hidden.has(id));
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="h-[40px]">
          {shown.map((id) => (
            <th
              key={id}
              scope="col"
              className="border-b border-line/70 px-[12px] text-[13px] leading-[1.3] font-semibold text-text-2 first:pl-[20px]"
            >
              {LEG_HEADERS[id]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {legs.map((leg) => (
          <tr key={leg.n} className="border-b border-line/70 last:border-b-0">
            {shown.map((id) => (
              <td
                key={id}
                className={`h-[48px] px-[12px] py-[10px] align-middle text-[14px] text-ink first:pl-[20px]${MONO.has(id) ? ' font-mono' : ''}`}
              >
                {legCell(leg, id)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DayTabs({ view }: { view: TruckDayView }): JSX.Element {
  const mode = useConsoleMode();
  const [rate, ...fuelLines] = view.fuel_block;

  return (
    <Tabs defaultValue="timeline" className="card-ring overflow-hidden">
      <TabsList variant="line" className="h-[48px] w-full justify-start rounded-none border-b border-line/70 px-[12px]">
        <TabsTrigger value="timeline">Хронологія</TabsTrigger>
        <TabsTrigger value="legs">Ділянки</TabsTrigger>
        <TabsTrigger value="fuel">Пальне</TabsTrigger>
        <TabsTrigger value="flags">{`Позначки (${view.flags.length})`}</TabsTrigger>
        <TabsTrigger value="history">Історія змін</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline">
        <Timeline rows={view.timeline} />
      </TabsContent>

      <TabsContent value="legs">
        <LegsTable legs={view.legs} mode={mode} />
      </TabsContent>

      <TabsContent value="fuel">
        <div className="flex flex-col gap-[8px] px-[20px] py-[16px]">
          {rate === undefined ? null : (
            <p className="font-mono text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">{rate}</p>
          )}
          {fuelLines.map((line) => (
            <p key={line} className="text-[13px] leading-[1.5] text-text-2">{line}</p>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="flags">
        <div className="flex flex-col">
          {view.flags.length === 0 ? (
            <p className="px-[20px] py-[16px] text-[13px] leading-[1.5] text-text-2">Позначок немає.</p>
          ) : view.flags.map((flag) => (
            <div key={flag.id} className="flex flex-col gap-[4px] border-b border-line/70 px-[20px] py-[12px] last:border-b-0">
              <p className="text-[14px] leading-[1.45] text-ink">{flag.title}</p>
              <p className={`text-[13px] leading-[1.4] ${flag.tone === 'hold' ? 'text-hold' : 'text-text-2'}`}>{flag.state}</p>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="history">
        <div className="flex flex-col">
          {view.history.map((h, i) => (
            <p
              key={`${h.at}:${i}`}
              className="flex flex-wrap items-baseline gap-[8px] border-b border-line/70 px-[20px] py-[10px] text-[14px] leading-[1.45] text-ink last:border-b-0"
            >
              <span className="font-mono text-[13px] text-text-2">{fmtTime(h.at)}</span>
              <span className="text-[13px] text-text-2">{h.by}</span>
              <span className="min-w-0">{h.text}</span>
            </p>
          ))}
          <details className="border-t border-line/70 px-[20px] py-[12px]">
            <summary className="cursor-pointer text-[13px] leading-[1.4] font-semibold text-ink">Скільки зберігаємо</summary>
            <dl className="mt-[10px] flex flex-col gap-[8px]">
              {RETENTION.map((r) => (
                <div key={r.what} className="flex flex-wrap items-baseline gap-x-[8px]">
                  <dt className="text-[13px] leading-[1.45] text-ink">{r.what}</dt>
                  <dd className="text-[13px] leading-[1.45] text-text-2">{`· ${r.how_long}`}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </TabsContent>
    </Tabs>
  );
}

/** The four summary cells of §4.2 C-08, in their pinned order. Exported here so the page reads as header → cells →
 *  tabs → footer and nothing has to know how a cell is drawn. */
export function DaySummary({ summary }: { summary: TruckDayView['summary'] }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-[12px] min-[720px]:grid-cols-2 min-[1200px]:grid-cols-4">
      <SummaryCell cell={summary.odometer} />
      <SummaryCell cell={summary.fuel} />
      <SummaryCell cell={summary.time} />
      <SummaryCell cell={summary.documents} />
    </div>
  );
}
