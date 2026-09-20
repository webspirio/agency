// mocks/driver-report/src/pages/office/FleetBoardPage.tsx
/** C-01 «Парк зараз» — where every truck is, sorted by what needs a person (§4.2 C-01, §8.3 C-01).
 *
 *  THE ORDER IS THE PRODUCT. Rank 1 is an open «Зараз» item, 2 an open «Перевірка» item of today, then a stop over
 *  two hours, then standing on the road, then moving, then off shift — decided in `src/domain`, never here. This
 *  page's whole job is to show that order and to stop it moving at the wrong moment.
 *
 *  THE FREEZE (§8.6 #15). While the pointer is over the table or a row has focus, the order is held; a row that
 *  became needs-action meanwhile is counted into the `HoldBar` instead of jumping. The snapshot is taken at the
 *  moment the pointer arrives, by truck id, so «new» means «not needing action when you looked», not «not on
 *  screen». «показати» releases the hold for as long as the pointer stays; leaving the table arms it again.
 *
 *  THE THREE TILES say what FOLLOWS from a number and never «зателефонуйте» (§8.3 C-01 #2): the office is told what
 *  is known — Ruptela saw it move, Регіс knows nothing — and decides for itself whether that is worth a call. */
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { Segmented } from '@agency/kit/segmented';
import { useFleet, useOfficeSummary } from '../../api/hooks';
import { useLiveHighlight, useScope, useServerNow } from '../../app/live';
import {
  EmptyPanel, PageHead, Panel, ResponsiveTable, SkeletonRows, StatTile, useConsoleMode,
} from '../../components/office';
import type { FleetRow } from '../../domain/dto';
import { lte } from '../../domain/num';
import type { Tone } from '../../domain/types';
import { BoardCard, boardColumns } from './board/BoardColumns';
import { HoldBar } from './board/HoldBar';

type Filter = 'ALL' | 'NEEDS_ACTION';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Усі' },
  { value: 'NEEDS_ACTION', label: 'Потребують дії' },
];
const HINT = 'потребують дії — зверху · порядок не змінюється, поки курсор над таблицею';

/** Rank 1–2 is an OPEN item on this truck: the two ranks the hold bar is about (§4.2 C-01 «Live»). */
const needsAction = (r: FleetRow): boolean => lte(r.rank, 2);
/** The rule tone: a truck someone has to answer for is hold, one that is not on shift is muted, the rest is ink.
 *  Never the accent, which is not a status (D10), and never green (§8.6 #5). */
const toneOf = (r: FleetRow): Tone => (needsAction(r) ? 'hold' : r.rank === 6 ? 'muted' : 'plain');

export function FleetBoardPage(): JSX.Element {
  const mode = useConsoleMode();
  const now = useServerNow();
  const scope = useScope();
  const summary = useOfficeSummary(scope);
  const [filter, setFilter] = useState<Filter>('ALL');
  const fleet = useFleet(scope, filter);
  const live = useLiveHighlight();
  const navigate = useNavigate();

  /** The needs-action trucks as they stood when the pointer arrived; `null` while nothing is held. */
  const [held, setHeld] = useState<ReadonlySet<string> | null>(null);
  const [released, setReleased] = useState(false);

  const rows = fleet.data?.data ?? [];
  const tiles = summary.data?.tiles ?? null;
  const arrived = held === null || released ? [] : rows.filter((r) => needsAction(r) && !held.has(r.truck_id));

  const openDay = (r: FleetRow): void => {
    if (r.truck_day_id !== null) navigate(`/day/${r.truck_day_id}`);
  };
  const actions = { onOpenDay: openDay, onDriverCard: (r: FleetRow) => navigate(`/drivers?open=${r.truck_id}`) };

  return (
    <>
      <PageHead title="Парк зараз" description={summary.data?.caption ?? ''} />

      <div className="mb-[20px] grid gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
        {tiles === null ? null : (
          <>
            <StatTile
              label="Не почали в застосунку"
              value={String(tiles.not_started.value)}
              consequence={tiles.not_started.lines}
              tone={tiles.not_started.value === 0 ? 'plain' : 'hold'}
            />
            <StatTile label="У черзі" value={String(tiles.at_stops.value)} consequence={[tiles.at_stops.line]} />
            <StatTile
              label="Без зв'язку понад 2 год"
              value={String(tiles.no_contact.value)}
              consequence={[tiles.no_contact.line]}
              tone={tiles.no_contact.value === 0 ? 'plain' : 'hold'}
            />
          </>
        )}
      </div>

      <Panel
        title="Машини"
        hint={HINT}
        right={<Segmented label="Які машини показувати" fit="content" size="sm" className="w-auto" options={FILTERS} value={filter} onChange={setFilter} />}
      >
        <HoldBar count={arrived.length} onShow={() => setReleased(true)} />
        {fleet.isPending ? (
          <SkeletonRows />
        ) : (
          <ResponsiveTable
            columns={boardColumns({ mode, now, live, actions })}
            rows={rows}
            rowKey={(r) => r.truck_id}
            onOpen={openDay}
            card={(r) => <BoardCard row={r} now={now} live={live} />}
            rule={(r) => ({ tone: toneOf(r), live: live(r.truck_day_id).live })}
            mode={mode}
            frozen={!released}
            onHoverChange={(hovering) => {
              if (hovering) setHeld(new Set(rows.filter(needsAction).map((r) => r.truck_id)));
              else {
                setHeld(null);
                setReleased(false);
              }
            }}
            empty={<EmptyPanel title="Нічого не потребує дії" hint="Рядок з'явиться тут, щойно якась машина чекатиме на людину." />}
          />
        )}
      </Panel>
    </>
  );
}
