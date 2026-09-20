// mocks/driver-report/src/pages/office/lanes/LaneList.tsx
/** The body of both lanes — «Зараз» (C-02) and «Перевірка» (C-03) — because they are ONE list with two sort orders
 *  and the same seven verbs, and a second copy would be a second place for a refusal to be forgotten.
 *
 *  WHAT THE PRIMARY MEANS. `item.primary_action` is decided in `src/domain/exceptions.ts`, per code, and this file
 *  only says where each verb goes: CALL opens the number, CHECK and RETAKE open the paper-mirror, OPEN_DAY and
 *  SAMPLE and FIX open a day, a dialog and a correction. Two of those need a word here:
 *
 *  - FIX is OFFERED ONLY TO AN OPERATOR OR AN ACCOUNTANT (§4.2 C-05 «Who may»: an odometer is theirs to change). A
 *    dispatcher is given «Відкрити день» instead, so the row still leads somewhere rather than to a dialog that
 *    would refuse the save.
 *  - RESOLVE never reaches this switch. C-02's anatomy gives EVERY row the ghost «З'ясовано ▾» and C-03 then makes
 *    «З'ясовано» the PRIMARY of four codes — two controls, one verb, one question — and §8.3 C-02/C-03 #3 asks of
 *    «З'ясовано», the one it names WITHOUT the arrow, that it cannot complete without a reason chip. So the kit's
 *    primary opens the row's own chips and never calls `onPrimary`: a one-tap close would be the single control on
 *    this row that shuts an item under a reason nobody chose. (The Wave 2 round gate left the reading open; this,
 *    taken by the integrator, is it — and there is exactly one page that mounts `ExceptionRow`, so there is no
 *    second copy to disagree with.)
 *
 *  «Подзвонити» IS A POPOVER AND THE PRIMARY IS A BUTTON `ExceptionRow` owns: the kit calls `onPrimary()` and has
 *  nothing a card could hang from. So a CALL row holds the popover's OPEN state itself and hands `CallPopover` a
 *  1 px anchor at the row's bottom-right to sit under — positioned, `aria-hidden`, unfocusable and not a control, so
 *  no query can reach it and the only visible control on the row is still the one the spec draws.
 *
 *  GROUPING. Several open items of one truck-day sit under «АР 1234 ВС · 21.09 · 2 позначки → Відкрити день», so the
 *  office reads them as one day's problem rather than as three unrelated alarms. Closed items are never grouped:
 *  they are the tail the list appends, muted, as the record that something WAS dealt with. */
import { useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import { codeOf } from '../../../api/contract';
import { useExceptions, useOfficeSummary, useUpdateException } from '../../../api/hooks';
import { SAYS_EXCEPTION } from '../../../api/says';
import { fmtDayMonth, pluralN } from '../../../app/format';
import { useScope } from '../../../app/live';
import { ClusterArt } from '../../../components/artefacts';
import { EmptyPanel, Panel, SkeletonRows } from '../../../components/office';
import { CorrectionDialog, ExceptionRow, CallPopover } from '../../../components/office/review';
import { ExampleChip } from '../../../components/shared';
import { OC } from '../../../copy/office';
import type { ExceptionItem } from '../../../domain/dto';
import type { OfficeRole, ResolveReason } from '../../../domain/types';
import { SampleDialog } from './SampleDialog';

type Lane = 'NOW' | 'REVIEW';
type Group = NonNullable<ExceptionItem['group']>;
/** §4.2 C-03: money first, because it is the thing that stops an invoice; then the odometer, then the rest. */
const GROUPS: { id: Group; title: string }[] = [
  { id: 'MONEY', title: 'Тримає рахунок' },
  { id: 'ODOMETER', title: 'Одометр' },
  { id: 'OTHER', title: 'Інше' },
];
const MARK_FORMS = ['позначка', 'позначки', 'позначок'] as const;
/** Who may change an odometer or a ТТН field (§4.2 C-05 «Who may»). */
const MAY_FIX: ReadonlySet<OfficeRole> = new Set<OfficeRole>(['OPERATOR', 'ACCOUNTANT']);

/** One row plus the anchor its «Подзвонити» needs. */
function Row({ item, refused, onPrimary, onSend }: {
  item: ExceptionItem;
  refused: string | null;
  onPrimary(item: ExceptionItem, call: () => void): void;
  onSend(item: ExceptionItem, action: 'TAKE' | 'RESOLVE' | 'ACCEPT_AS_IS', reason?: ResolveReason): void;
}): JSX.Element {
  const [calling, setCalling] = useState(false);
  return (
    <div className="relative">
      <ExceptionRow
        item={item}
        refused={refused}
        onPrimary={() => onPrimary(item, () => setCalling(true))}
        onTake={() => onSend(item, 'TAKE')}
        onResolve={(reason) => onSend(item, 'RESOLVE', reason)}
        onAcceptAsIs={(reason) => onSend(item, 'ACCEPT_AS_IS', reason)}
      />
      {item.phone === null ? null : (
        <CallPopover phone={item.phone} open={calling} onOpenChange={setCalling}>
          <span aria-hidden="true" className="absolute right-[20px] bottom-[12px] block size-px" />
        </CallPopover>
      )}
    </div>
  );
}

/** The open items of one day, under one header; a day with a single item gets none. */
function DayHeader({ item, count }: { item: ExceptionItem; count: number }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-[8px] border-b border-line/70 bg-bench/40 px-[20px] py-[8px] text-[13px] leading-[1.4] text-text-2">
      <span>{`${item.truck_plate} · ${fmtDayMonth(item.opened_at)} · ${pluralN(count, MARK_FORMS)}`}</span>
      {item.truck_day_id === null ? null : (
        <Link to={`/day/${item.truck_day_id}`} className="font-medium text-ink underline-offset-2 hover:underline">
          {`→ ${OC.openDay}`}
        </Link>
      )}
    </div>
  );
}

export function LaneList({ lane }: { lane: Lane }): JSX.Element {
  const scope = useScope();
  const list = useExceptions(lane, scope);
  const summary = useOfficeSummary(scope);
  const update = useUpdateException();
  const navigate = useNavigate();
  const [refused, setRefused] = useState<Record<string, string | null>>({});
  const [fixing, setFixing] = useState<ExceptionItem | null>(null);
  const [sampling, setSampling] = useState<ExceptionItem | null>(null);

  const items = list.data?.data ?? [];
  const mayFix = MAY_FIX.has(summary.data?.user.role ?? 'OPERATOR');

  const openDay = (item: ExceptionItem): void => {
    if (item.truck_day_id !== null) navigate(`/day/${item.truck_day_id}`);
  };
  const openStop = (item: ExceptionItem): void => {
    if (item.target.stop_id !== null) navigate(`/stop/${item.target.stop_id}`);
  };

  /** Every write of this lane. A code the list no longer has is `EXCEPTION_NOT_FOUND`: say so under the row and
   *  refetch, because the item was closed by someone else or by itself while the operator was reading it. */
  const send = (item: ExceptionItem, action: 'TAKE' | 'RESOLVE' | 'ACCEPT_AS_IS', reason?: ResolveReason): void => {
    setRefused((r) => ({ ...r, [item.id]: null }));
    update.mutate(
      { id: item.id, body: reason === undefined ? { action } : { action, reason } },
      {
        onError: (err) => {
          const code = codeOf('updateException', err);
          setRefused((r) => ({ ...r, [item.id]: code === undefined ? null : SAYS_EXCEPTION[code] }));
          void list.refetch();
        },
      },
    );
  };

  const primary = (item: ExceptionItem, call: () => void): void => {
    switch (item.primary_action) {
      case 'CALL': call(); return;
      case 'CHECK': case 'RETAKE': openStop(item); return;
      case 'OPEN_DAY': openDay(item); return;
      case 'SAMPLE': setSampling(item); return;
      case 'FIX': if (mayFix) setFixing(item); else openDay(item); return;
      // The kit's own disclosure answers this one, and `onPrimary` is never called for it (see the note above).
      case 'RESOLVE': return;
    }
  };

  /** A dispatcher may not change an odometer, so the row offers the day instead of «Виправити» (§4.2 C-05). */
  const asShown = (item: ExceptionItem): ExceptionItem =>
    (item.primary_action === 'FIX' && !mayFix ? { ...item, primary_action: 'OPEN_DAY' } : item);

  /** One panel's rows: the open items, headed per truck-day where a day has more than one, then the closed tail. */
  const rows = (panel: ExceptionItem[]): JSX.Element[] => {
    const open = panel.filter((i) => i.resolved === null);
    const closed = panel.filter((i) => i.resolved !== null);
    const perDay = new Map<string, number>();
    for (const i of open) {
      if (i.truck_day_id === null) continue;
      perDay.set(i.truck_day_id, (perDay.get(i.truck_day_id) ?? 0) + 1);
    }
    const headed = new Set<string>();
    const out: JSX.Element[] = [];
    for (const item of open) {
      const day = item.truck_day_id;
      const n = day === null ? 0 : perDay.get(day) ?? 0;
      if (day !== null && n > 1 && !headed.has(day)) {
        headed.add(day);
        out.push(<DayHeader key={`day:${day}`} item={item} count={n} />);
      }
      out.push(<Row key={item.id} item={asShown(item)} refused={refused[item.id] ?? null} onPrimary={primary} onSend={send} />);
    }
    for (const item of closed) {
      out.push(<Row key={item.id} item={item} refused={refused[item.id] ?? null} onPrimary={primary} onSend={send} />);
    }
    return out;
  };

  const closedToday = summary.data?.closed_today ?? 0;
  const footer = (
    <p className="flex flex-wrap items-center gap-[6px]">
      <span>{`Закрилось само сьогодні: ${closedToday}`}</span>
      {summary.data?.example === true ? <ExampleChip /> : null}
    </p>
  );

  const fixed = fixing?.values ?? null;
  const panels = lane === 'NOW'
    ? [{ id: 'now', title: undefined as string | undefined, items }]
    : GROUPS.map((g) => ({ id: g.id, title: g.title as string | undefined, items: items.filter((i) => i.group === g.id) }))
      .filter((g) => g.items.length !== 0);

  return (
    <>
      {list.isPending ? (
        <Panel><SkeletonRows /></Panel>
      ) : items.length === 0 ? (
        <Panel footer={footer}>
          {lane === 'NOW'
            ? <EmptyPanel title="Зараз нічого не чекає" hint="Коли водій натисне «Подзвоніть мені» або «Стою → Поломка», пункт з'явиться тут." />
            : <EmptyPanel title="Перевіряти нічого" hint="Нові зупинки з документами з'являться тут, щойно водій їх запише." />}
        </Panel>
      ) : (
        <div className="flex flex-col gap-[16px]">
          {panels.map((p, index) => (
            <Panel key={p.id} title={p.title} footer={index === panels.length - 1 ? footer : undefined}>
              {rows(p.items)}
            </Panel>
          ))}
        </div>
      )}

      {fixing === null || fixed === null ? null : (
        <CorrectionDialog
          open
          onOpenChange={(o) => { if (!o) setFixing(null); }}
          target={{
            record_key: fixing.target.record_key ?? '',
            // §4.2 C-05's own title: «Виправити одометр · початок зміни». The item's title carries the moment AND
            // its time («Одометр: початок зміни 05:40»); the time is already in the context line under it.
            title: `Виправити одометр · ${fixing.title.replace(/^Одометр: /, '').replace(/ \d{2}:\d{2}$/, '')}`,
            context: fixing.meta,
            current: fixed.current,
            expected: fixed.expected,
            photo: <ClusterArt digits={fixed.current} />,
          }}
          onSaved={() => { setFixing(null); void list.refetch(); }}
        />
      )}

      {sampling === null ? null : (
        <SampleDialog
          open
          onOpenChange={(o) => { if (!o) setSampling(null); }}
          item={sampling}
          onMatches={() => { send(sampling, 'RESOLVE', 'NOT_A_PROBLEM'); setSampling(null); }}
          onFix={() => { setFixing(sampling); setSampling(null); }}
        />
      )}
    </>
  );
}
