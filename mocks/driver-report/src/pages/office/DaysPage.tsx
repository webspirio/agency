// mocks/driver-report/src/pages/office/DaysPage.tsx
/** C-07 «Дні на підтвердження» (§4.2 C-07, 02 UC-O09).
 *
 *  A DAY IS A WAYBILL. That sentence is the page's whole job, and it is in the description rather than in a tooltip:
 *  the office has never had a screen called «дні», and the list means nothing until the reader knows that confirming
 *  one turns it read-only and sends it to BAS.
 *
 *  Three states, one table. «На підтвердження» carries its count in the segment label because that count is the only
 *  number on this page anybody acts on; «Підтверджені» and «У BAS» do not, because a number nobody acts on is noise.
 *  The state lives in `?state=` so a row opened from here, and the browser's own Back, return to the same tab.
 *
 *  Позначки and «підтвердив HH:MM» are the two columns that decide whether a day can be confirmed without opening it,
 *  so they are the two that render in `--hold` when they are not yet true. Everything else is plain ink: §8.6 #5
 *  leaves colour to mean «needs a person», and a confirmed day needs nobody. */
import type { JSX } from 'react';
import { Segmented } from '@agency/kit/segmented';
import { useNavigate, useSearchParams } from 'react-router';
import { useTruckDays } from '../../api/hooks';
import { fmtDay, fmtKm, fmtTime, plural } from '../../app/format';
import { useScope } from '../../app/live';
import {
  EmptyPanel, PageHead, Panel, ResponsiveTable, SkeletonRows, useConsoleMode, type RTColumn,
} from '../../components/office';
import { ExampleChip, Plate } from '../../components/shared';
import { OC } from '../../copy/office';
import type { TruckDayRow } from '../../domain/dto';

type DaysState = 'to-confirm' | 'confirmed' | 'exported';

const STATES: readonly DaysState[] = ['to-confirm', 'confirmed', 'exported'];
const FLAG_FORMS = ['не з\'ясована', 'не з\'ясовані', 'не з\'ясованих'] as const;

const DESCRIPTION = 'День — це подорожній лист машини за зміну. Підтверджений день стає лише для читання і йде у файл для BAS.';
const EMPTY = {
  'to-confirm': { title: 'Усі дні підтверджено', hint: 'Наступний день з\'явиться тут, коли водій закінчить зміну.' },
  confirmed: { title: 'Підтверджених днів ще немає', hint: 'День з\'явиться тут, щойно ви його підтвердите.' },
  exported: { title: 'У BAS ще нічого не пішло', hint: 'День з\'явиться тут після «Імпорт у BAS» на сторінці «В BAS».' },
} as const;

/** «05:20–16:02» · «з 05:20» while the shift is still open · «—» before it started. */
function spanOf(row: TruckDayRow): string {
  if (row.span === null) return '—';
  return row.span.to === null ? `з ${fmtTime(row.span.from)}` : `${fmtTime(row.span.from)}–${fmtTime(row.span.to)}`;
}

function stateOf(raw: string | null): DaysState {
  return STATES.find((s) => s === raw) ?? 'to-confirm';
}

export function DaysPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const state = stateOf(params.get('state'));
  const scope = useScope();
  const mode = useConsoleMode();
  const navigate = useNavigate();

  // Two reads, one query key when they coincide: the segment's count is «На підтвердження» whichever tab is open.
  const waiting = useTruckDays('to-confirm', scope);
  const shown = useTruckDays(state, scope);
  const rows = shown.data?.data ?? [];

  const columns: RTColumn<TruckDayRow>[] = [
    { id: 'truck', header: 'Машина', width: 208, cell: (r) => (
      <span className="flex flex-wrap items-center gap-[8px]">
        <Plate plate={r.plate} size="sm" />
        <span className="text-[13px] text-text-2">{OC.badge[r.badge]}</span>
        {r.example ? <ExampleChip /> : null}
      </span>
    ) },
    { id: 'driver', header: 'Водій', width: 148, hideAt: ['compact', 'rail'], mergeInto: 'truck', cell: (r) => r.driver },
    { id: 'date', header: 'Дата', width: 104, cell: (r) => fmtDay(r.date) },
    { id: 'span', header: 'Зміна', width: 132, cell: (r) => <span className="font-mono text-[14px]">{spanOf(r)}</span> },
    { id: 'km', header: 'Км', width: 76, align: 'right', cell: (r) => <span className="font-mono text-[14px]">{fmtKm(r.km)}</span> },
    { id: 'docs', header: 'Документи', width: 108, hideAt: ['rail'], mergeInto: 'flags', cell: (r) => r.docs },
    { id: 'flags', header: 'Позначки', width: 168, cell: (r) => (r.flags_open === 0
      ? '—'
      : <span className="text-hold">{`${fmtKm(r.flags_open)} · ${plural(r.flags_open, FLAG_FORMS)}`}</span>) },
    { id: 'attested', header: 'Водій', width: 152, cell: (r) => (r.attested_at === null
      ? <span className="text-hold">не підтвердив</span>
      : `підтвердив ${fmtTime(r.attested_at)}`) },
  ];

  const card = (r: TruckDayRow): JSX.Element => (
    <div className="flex flex-col gap-[4px]">
      <span className="flex flex-wrap items-center gap-[8px]">
        <Plate plate={r.plate} size="sm" />
        <span className="text-[13px] text-text-2">{OC.badge[r.badge]}</span>
        {r.example ? <ExampleChip /> : null}
      </span>
      <span className="text-[14px] text-ink">{r.driver}</span>
      <span className="font-mono text-[13px] text-text-2">{`${fmtDay(r.date)} · ${spanOf(r)} · ${fmtKm(r.km)} км`}</span>
      <span className="text-[13px] text-text-2">{`Документи ${r.docs}`}</span>
      {r.attested_at === null ? <span className="text-[13px] text-hold">водій не підтвердив</span> : null}
    </div>
  );

  const empty = EMPTY[state];

  return (
    <>
      <PageHead title="Дні на підтвердження" description={DESCRIPTION} />
      <div className="mb-[16px] max-w-[560px]">
        <Segmented<DaysState>
          label="Стан дня"
          fit="content"
          tone="strong"
          value={state}
          onChange={(next) => setParams(next === 'to-confirm' ? {} : { state: next }, { replace: true })}
          options={[
            { value: 'to-confirm', label: `На підтвердження · ${fmtKm(waiting.data?.total ?? 0)}` },
            { value: 'confirmed', label: 'Підтверджені' },
            { value: 'exported', label: 'У BAS' },
          ]}
        />
      </div>
      <Panel>
        {shown.isPending ? <SkeletonRows /> : (
          <ResponsiveTable<TruckDayRow>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            mode={mode}
            onOpen={(r) => { void navigate(`/day/${r.id}`); }}
            rule={(r) => ({ tone: r.flags_open === 0 ? 'plain' : 'hold', live: false })}
            card={card}
            empty={<EmptyPanel title={empty.title} hint={empty.hint} />}
          />
        )}
      </Panel>
    </>
  );
}
