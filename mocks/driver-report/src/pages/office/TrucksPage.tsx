// mocks/driver-report/src/pages/office/TrucksPage.tsx
/** C-12 «Машини» — each truck as its own business (§4.2 C-12, §8.3 C-12/C-13 #1, #3).
 *
 *  Eleven columns of one month per truck, and exactly ONE anomaly marker: a row past the 5 % tolerance takes a hold
 *  `RowRule` and the `hatch` on its deviation cell. Never a fourth colour, and never a colour on its own — the cell
 *  still says «+5,9 %» in words, so a grayscale screenshot of this page loses nothing (§8.5, §6.6).
 *
 *  Nothing here computes: `over_tolerance`, `deviation` and `method_label` all arrive finished from
 *  `src/domain/views/reports.ts`, which is the only place `@agency/dec` may divide two litre counts. A page that
 *  decided «is this beyond tolerance» itself would be a second answer to a question the domain already answers, and
 *  the two would drift the first time the tolerance moved.
 *
 *  The sort lives in the URL (`?sort=`) so «показати по кілометрах» survives a paste, and the fold follows §4.2: at
 *  `compact` Днів, Норма and Простій become second lines under the column they belong to, at `rail` Пальне грн and
 *  Днів підтверджено join them. A merged line has no header of its own (that is what merging IS), so those five
 *  columns carry a `mergedCell` that labels the value — «норма 32,0» — and a `cell` that stays bare under its own
 *  header. Which of the two is used is the TABLE's decision, not this page's: a ternary here would be `hideAt` read
 *  back out of `ResponsiveTable` and would disagree with it the first time the fold moved. */
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { SelectField } from '@agency/kit/select-field';
import { colW, PageHead, Panel, ResponsiveTable, SkeletonRows, useConsoleMode,
  type RTColumn } from '../../components/office';
import { ExampleChip, Plate, SimChip } from '../../components/shared';
import { useScope, useServerNow } from '../../app/live';
import { fmtDec, fmtKm, fmtPct, fmtRate } from '../../app/format';
import { OC } from '../../copy/office';
import { businessDate } from '../../domain/clock';
import type { TruckMonthRow } from '../../domain/dto';
import { useTrucks } from '../../api/hooks';
import { WhatItGives } from './trucks/WhatItGives';

const TITLE = 'Машини';
const DESCRIPTION = 'Кожна машина — окремий бізнес: кілометри, пальне з методом, години на точках, документи.';
/** §4.2 C-12 verbatim (D14: the month is to date, 1–21.09, and the tolerance is the agency's example until KTL sets
 *  one). A derived month name would have to invent the tolerance sentence anyway, and that half is the point. */
const PANEL_HINT = 'Вересень 1–21 · допуск КТЛ 5 % — приклад, уточнимо';
const NONE = '—';

type Sort = 'fuel_dev' | 'plate' | 'km';
const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'fuel_dev', label: 'Сортувати: пальне, відхилення' },
  { value: 'plate', label: 'Сортувати: машина' },
  { value: 'km', label: 'Сортувати: кілометри' },
];
const isSort = (v: string | null): v is Sort => SORTS.some((s) => s.value === v);

export function TrucksPage(): JSX.Element {
  const mode = useConsoleMode();
  const scope = useScope();
  const month = businessDate(useServerNow(60_000)).slice(0, 7);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('sort');
  const sort: Sort = isSort(asked) ? asked : 'fuel_dev';

  const query = useTrucks(scope, month, sort);
  const rows = query.data?.data ?? [];

  // §4.2 C-12's eleven columns and their shares: 1 136 with the chevron at wide, 690 below it (`fit.test.tsx`).
  // Eleven columns in a 690 px pane is 59 px each, so below wide «Пальне, грн» and «Днів підтверджено» fold with
  // «Днів», «Норма» and «Простій» — §4.2 folds the last two at rail, and 946 px is the width the demo runs at.
  // The narrow numbers are MEASURED against the longest unbreakable token each column has to host, not split
  // evenly: a merged line whose longest WORD does not fit breaks mid-word, and «підтверджено» in a 70 px
  // «Документи вчасно» read «підтв / ерджено» at 946 px. 130 + 112 + 138 + 76 + 74 + 120 = 650, + the 40 px
  // chevron = the 690 px pane exactly.
  const columns: RTColumn<TruckMonthRow>[] = [
    { id: 'plate', header: 'Машина', width: colW(mode, { wide: 148, narrow: 130 }),
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-[6px]">
          <Plate plate={r.plate} size="sm" />
          <span className="text-[13px] text-text-2">{OC.badge[r.badge]}</span>
          {r.example ? <ExampleChip /> : null}
        </span>
      ) },
    { id: 'days', header: 'Днів', width: 52, align: 'right', hideAt: ['compact', 'rail'], mergeInto: 'plate',
      cell: (r) => <span className="font-mono tabular-nums">{String(r.days)}</span>,
      mergedCell: (r) => <span className="font-mono tabular-nums">{`днів ${String(r.days)}`}</span> },
    { id: 'km', header: 'Км (з вантажем)', width: colW(mode, { wide: 112, narrow: 112 }), align: 'right',
      cell: (r) => <span className="font-mono tabular-nums">{fmtKm(r.km)} ({fmtKm(r.km_loaded)})</span> },
    { id: 'fuel', header: 'Пальне, л/100 (метод)', width: colW(mode, { wide: 148, narrow: 138 }),
      cell: (r) => (
        <span className="inline-flex flex-wrap items-baseline gap-[6px]">
          <span className="font-mono tabular-nums">{fmtRate(r.fuel_rate)}</span>
          <span className="text-[13px] text-text-2">{r.method_label}</span>
          {r.simulated ? <SimChip /> : null}
        </span>
      ) },
    { id: 'norm', header: 'Норма', width: 64, align: 'right', hideAt: ['compact', 'rail'], mergeInto: 'fuel',
      cell: (r) => <span className="font-mono tabular-nums">{fmtRate(r.norm)}</span>,
      mergedCell: (r) => <span className="font-mono tabular-nums">{`норма ${fmtRate(r.norm)}`}</span> },
    { id: 'deviation', header: 'Відхилення', width: colW(mode, { wide: 92, narrow: 76 }), align: 'right',
      cell: (r) => (
        <span
          className={r.over_tolerance
            ? 'hatch inline-block rounded-[6px] px-[6px] py-[2px] font-mono tabular-nums text-hold'
            : 'font-mono tabular-nums'}
        >
          {fmtPct(r.deviation)}
        </span>
      ) },
    { id: 'uah', header: 'Пальне, грн', width: 104, align: 'right', hideAt: ['compact', 'rail'], mergeInto: 'km',
      cell: (r) => <span className="font-mono tabular-nums">{fmtDec(r.fuel_uah)}</span>,
      mergedCell: (r) => <span className="font-mono tabular-nums">{`грн ${fmtDec(r.fuel_uah)}`}</span> },
    { id: 'site', header: 'На точках, год', width: colW(mode, { wide: 88, narrow: 74 }), align: 'right',
      cell: (r) => <span className="font-mono tabular-nums">{String(r.site_hours)}</span> },
    { id: 'idle', header: 'Простій понад безкоштовні', width: 104, align: 'right',
      hideAt: ['compact', 'rail'], mergeInto: 'site',
      cell: (r) => <span>{r.idle_over_free ?? NONE}</span>,
      mergedCell: (r) => <span>{`простій ${r.idle_over_free ?? NONE}`}</span> },
    { id: 'docs', header: 'Документи вчасно', width: colW(mode, { wide: 96, narrow: 120 }), align: 'right',
      cell: (r) => <span className="font-mono tabular-nums">{r.docs_on_time}</span> },
    { id: 'confirmed', header: 'Днів підтверджено', width: 88, align: 'right', hideAt: ['compact', 'rail'], mergeInto: 'docs',
      cell: (r) => <span className="font-mono tabular-nums">{r.days_confirmed}</span>,
      mergedCell: (r) => <span className="font-mono tabular-nums">{`підтверджено ${r.days_confirmed}`}</span> },
  ];

  return (
    <>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <SelectField
            aria-label="Сортувати"
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value })}
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
        }
      />
      <div className="flex flex-col gap-[16px]">
        <Panel hint={PANEL_HINT}>
          {query.isPending ? <SkeletonRows /> : (
            <ResponsiveTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.truck_id}
              mode={mode}
              onOpen={(r) => navigate(`/trucks/${r.truck_id}/fuel`)}
              rule={(r) => ({ tone: r.over_tolerance ? 'hold' : 'plain', live: false })}
              card={(r) => (
                <div className="flex flex-col gap-[6px]">
                  <span className="inline-flex flex-wrap items-center gap-[6px]">
                    <Plate plate={r.plate} size="sm" />
                    <span className="text-[13px] text-text-2">{OC.badge[r.badge]}</span>
                    {r.example ? <ExampleChip /> : null}
                  </span>
                  <p className="font-mono text-[13px] tabular-nums text-text-2">
                    {String(r.days)} днів · {fmtKm(r.km)} км · {fmtRate(r.fuel_rate)} {r.method_label}
                  </p>
                  <span
                    className={r.over_tolerance
                      ? 'hatch inline-block rounded-[6px] px-[6px] py-[2px] font-mono text-[13px] tabular-nums text-hold'
                      : 'font-mono text-[13px] tabular-nums'}
                  >
                    норма {fmtRate(r.norm)} · {fmtPct(r.deviation)}
                  </span>
                </div>
              )}
            />
          )}
        </Panel>
        <WhatItGives />
      </div>
    </>
  );
}
