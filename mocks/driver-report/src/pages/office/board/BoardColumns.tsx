// mocks/driver-report/src/pages/office/board/BoardColumns.tsx
/** The seven columns of «Парк зараз» (§4.2 C-01), the row menu, and the card each row becomes on a phone.
 *
 *  THE COLUMNS ARE DATA, not markup: `ResponsiveTable` needs them as an array so it can drop a column at `compact`
 *  and fold it into another one at `rail` (`hideAt` + `mergeInto`) without a page ever writing a second table. That
 *  is how §8.6 #22 is kept — the console never scrolls sideways — and it is why «Водій» and «Документи» are declared
 *  here with the columns they merge into rather than hidden by a media query.
 *
 *  Every value arrives FINISHED from `src/domain/views/office.ts`: the state and its line, «в роботі: НШ», the
 *  DocDots label, whether the contact is stale. Nothing is computed here, because a board row is the one place in
 *  the console where a number the office half-reads becomes a phone call to a driver.
 *
 *  The row menu stops its own clicks: the whole row is a button (Enter opens the day), so a click on «Подзвонити»
 *  that bubbled would open the day behind the popover. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { Ellipsis } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@agency/kit/dropdown-menu';
import { fmtKm } from '../../../app/format';
import { ContactCell, DocDots, LiveLine, type ConsoleMode, type RTColumn } from '../../../components/office';
import { CallPopover } from '../../../components/office/review';
import { ExampleChip, Plate, SimChip, SourceBadge } from '../../../components/shared';
import { OC } from '../../../copy/office';
import type { FleetRow } from '../../../domain/dto';
import type { Instant } from '../../../domain/types';

export type Live = (truckDayId: string | null) => { live: boolean; at: Instant | null };
export type RowActions = { onOpenDay(r: FleetRow): void; onDriverCard(r: FleetRow): void };

/** Swallows the row's own «open the day» while the pointer is inside the menu or the popover it opens. */
function Stop({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <div
      className="flex items-center justify-end"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      {children}
    </div>
  );
}

function RowMenu({ row, actions }: { row: FleetRow; actions: RowActions }): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Дії"
        className="flex size-[36px] items-center justify-center rounded-[10px] text-ink opacity-70 hover:bg-bench hover:opacity-100"
      >
        <Ellipsis size={18} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[184px]">
        {row.phone === null ? null : (
          <CallPopover phone={row.phone}>
            {/* The menu stays open: it is this item that anchors the number popover. */}
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Подзвонити</DropdownMenuItem>
          </CallPopover>
        )}
        {row.truck_day_id === null ? null : (
          <DropdownMenuItem onSelect={() => actions.onOpenDay(row)}>{OC.openDay}</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => actions.onDriverCard(row)}>Картка водія</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TruckCell({ row }: { row: FleetRow }): JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-[8px]">
      <Plate plate={row.plate} size="sm" />
      <span className="code text-[12px] leading-[1.3] font-semibold text-text-2">{OC.badge[row.badge]}</span>
      {row.example ? <ExampleChip /> : null}
    </span>
  );
}

function DriverCell({ row }: { row: FleetRow }): JSX.Element {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{row.driver}</span>
      {row.taken_by === null ? null : <span className="truncate text-[13px] text-text-2">{row.taken_by}</span>}
    </span>
  );
}

function StateCell({ row, live }: { row: FleetRow; live: Live }): JSX.Element {
  const hot = live(row.truck_day_id);
  return (
    <span className="flex min-w-0 flex-col gap-[2px]">
      <span className="text-[14px] leading-[1.35] font-medium text-ink">{row.state}</span>
      {row.state_line === '' && !row.simulated ? null : (
        <span className="flex flex-wrap items-center gap-[6px] text-[13px] leading-[1.4] text-text-2">
          {row.state_line === '' ? null : <span className="min-w-0">{row.state_line}</span>}
          {row.simulated ? <SimChip /> : null}
        </span>
      )}
      {hot.live && hot.at !== null ? <LiveLine at={hot.at} /> : null}
    </span>
  );
}

function OdometerCell({ row }: { row: FleetRow }): JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-[6px]">
      <span className="font-mono text-[14px] leading-[1.3] whitespace-nowrap text-ink tabular-nums">{fmtKm(row.odometer.value)}</span>
      {row.odometer.source === null ? null : <SourceBadge source={row.odometer.source} />}
    </span>
  );
}

/** The per-mode widths of §4.2 C-01's own column table. They are NOT one number each: «Машина» grows at compact
 *  because the driver line folds into it, «Стан» stops being 300 and becomes the flex column, and «Зв'язок» gives
 *  up 40 px on the way down. A single width for all three modes is what makes a console scroll sideways (§8.6 #22). */
const W: Record<'truck' | 'state' | 'odometer' | 'contact', Record<ConsoleMode, number | undefined>> = {
  truck: { wide: 170, compact: 190, rail: 170, mobile: undefined },
  state: { wide: 300, compact: undefined, rail: undefined, mobile: undefined },
  odometer: { wide: 130, compact: 130, rail: 120, mobile: undefined },
  contact: { wide: 150, compact: 120, rail: 110, mobile: undefined },
};

/** §4.2 C-01's column table, with its widths and its two folds. */
export function boardColumns(p: { mode: ConsoleMode; now: Instant; live: Live; actions: RowActions }): RTColumn<FleetRow>[] {
  return [
    { id: 'truck', header: 'Машина', width: W.truck[p.mode], cell: (r) => <TruckCell row={r} /> },
    { id: 'driver', header: 'Водій', width: 150, hideAt: ['compact', 'rail'], mergeInto: 'truck', cell: (r) => <DriverCell row={r} /> },
    { id: 'state', header: 'Стан', width: W.state[p.mode], cell: (r) => <StateCell row={r} live={p.live} /> },
    { id: 'odometer', header: 'Одометр', width: W.odometer[p.mode], cell: (r) => <OdometerCell row={r} /> },
    { id: 'docs', header: 'Документи', width: 80, hideAt: ['rail'], mergeInto: 'state',
      cell: (r) => <DocDots ttn={r.docs.ttn} signed={r.docs.signed} receipts={r.docs.receipts} label={r.docs.label} /> },
    { id: 'contact', header: "Зв'язок", width: W.contact[p.mode],
      cell: (r) => <ContactCell at={r.contact.at} unsent={r.contact.unsent_at_contact} stale={r.contact.stale} now={p.now} /> },
    { id: 'menu', header: '', width: 48, align: 'right',
      cell: (r) => <Stop><RowMenu row={r} actions={p.actions} /></Stop> },
  ];
}

/** Below 720 px: plate + badge · the state line · «Зв'язок 2 хв» · «Подзвонити» (§4.2 C-01 «Mobile card»). */
export function BoardCard({ row, now, live }: { row: FleetRow; now: Instant; live: Live }): JSX.Element {
  const hot = live(row.truck_day_id);
  return (
    <div className="flex min-w-0 flex-col gap-[6px]">
      <TruckCell row={row} />
      <p className="text-[14px] leading-[1.35] font-medium text-ink">{row.state}</p>
      {row.state_line === '' ? null : <p className="text-[13px] leading-[1.4] text-text-2">{row.state_line}</p>}
      {hot.live && hot.at !== null ? <LiveLine at={hot.at} /> : null}
      <p className={cn('text-[13px] leading-[1.4]', row.contact.stale ? 'text-hold' : 'text-text-2')}>
        {"Зв'язок "}
        <ContactCell at={row.contact.at} unsent={row.contact.unsent_at_contact} stale={row.contact.stale} now={now} />
      </p>
      {row.phone === null ? null : (
        <Stop>
          <CallPopover phone={row.phone}>
            <button type="button" className="h-[36px] self-start rounded-[10px] px-[12px] text-[14px] font-medium text-ink hover:bg-bench">
              Подзвонити
            </button>
          </CallPopover>
        </Stop>
      )}
    </div>
  );
}
