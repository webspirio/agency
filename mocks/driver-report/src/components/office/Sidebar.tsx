// mocks/driver-report/src/components/office/Sidebar.tsx
/** The ink sidebar (§4.1): brand, three groups, eleven items, the duty footer — and one count where a count means
 *  «there is work here».
 *
 *  THE COUNTS ARE THE NAVIGATION. Зараз, Перевірка, Дні на підтвердження, Оригінали and В BAS carry one; Парк зараз
 *  and every report page do not, because a number beside a page nobody has to empty is noise that teaches the eye to
 *  stop reading numbers. «Зараз» turns `#e8b54d` when it is non-zero and stays `--sidebar-ink` at zero: a queue with
 *  nothing in it is not a warning.
 *
 *  It is `--sidebar-bg` (#10161a), never navy — the ink of this product, not the reference console's (R01 §16).
 *  Active is a `--sidebar-active` fill plus a 2 px `--accent-lift` left rule, drawn as an absolutely positioned
 *  `aria-hidden` span inside the `NavLink`, so the link's accessible name stays exactly its label (and its label +
 *  its count where it has one — which is what `shell.test.tsx` asserts on «Зараз 3» and on a bare «Парк зараз»).
 *
 *  FOUR SHAPES, ONE LIST. wide 240 and compact 208 differ only in width; rail 76 swaps the label for `OC.navShort`
 *  under a 20 px icon with the badge at its top-right, and drops the brand text and the footer because 76 px cannot
 *  hold either honestly; mobile is the same panel inside the kit's left `Drawer` at 288 px, opened by the header's
 *  menu button. The items themselves are declared once, below, and every shape reads that one array.
 *
 *  THE SHEET'S STATE BELONGS TO THE PAGE, not to this kit (W1-04's INTEGRATOR NOTE, accepted at the round gate).
 *  `ConsoleShell` (W2-05) holds one boolean, passes it here as `open`/`onClose`, and passes the opener to
 *  `ConsoleHeader` as `onMenu`. I-15 pins those three props and is silent about who owns the boolean; owning it HERE
 *  would put it out of reach of the header's 44 px menu button — the only control that opens the sheet (§4.1). */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { Drawer, DrawerContent, DrawerTitle } from '@agency/kit/drawer';
import {
  BellRing, CalendarClock, ChartColumn, ClipboardCheck, Files, FileSpreadsheet, Flag, MapPinned, NotebookPen, Truck,
  Users, type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { OC } from '../../copy/office';
import type { Counts } from '../../domain/dto';
import { TruckMark } from '../shared';
import type { ConsoleMode } from './useConsoleMode';

type NavKey = keyof typeof OC.nav;
type Item = { key: NavKey; to: string; icon: LucideIcon; count: keyof Counts | null };

/** The eleven items of §4.1, in the order the spec draws them; `to` matches the console routes of I-16. */
const GROUPS: { id: string; label: string; items: Item[] }[] = [
  {
    id: 'work',
    label: OC.groups.work,
    items: [
      { key: 'board', to: '/', icon: Truck, count: null },
      { key: 'now', to: '/inbox/now', icon: BellRing, count: 'now' },
      { key: 'review', to: '/inbox/review', icon: ClipboardCheck, count: 'review' },
      { key: 'days', to: '/days', icon: NotebookPen, count: 'days_to_confirm' },
      { key: 'originals', to: '/originals', icon: Files, count: 'originals' },
    ],
  },
  {
    id: 'reports',
    label: OC.groups.reports,
    items: [
      { key: 'keyPoints', to: '/key-points', icon: MapPinned, count: null },
      { key: 'trucks', to: '/trucks', icon: ChartColumn, count: null },
      { key: 'worktime', to: '/worktime', icon: CalendarClock, count: null },
      { key: 'bas', to: '/bas', icon: FileSpreadsheet, count: 'bas_ready' },
    ],
  },
  {
    id: 'settings',
    label: OC.groups.settings,
    items: [
      { key: 'drivers', to: '/drivers', icon: Users, count: null },
      { key: 'pilot', to: '/pilot', icon: Flag, count: null },
    ],
  },
];

const WIDTH: Record<ConsoleMode, string> = {
  wide: 'w-[240px]',
  compact: 'w-[208px]',
  rail: 'w-[76px]',
  mobile: 'w-[288px]',
};

function CountBadge({ n, warn, corner }: { n: number; warn: boolean; corner: boolean }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-white/10 font-mono leading-none tabular-nums',
        warn && n !== 0 ? 'text-stage-hold' : 'text-sidebar-ink',
        // 12 px in both shapes: §8.5 floors console text at 12 px, and a badge is the first thing an eye
        // shrinks past. The rail's sits at the icon's top-right rather than after a label it does not have.
        corner
          ? 'absolute -top-[8px] -right-[12px] h-[18px] min-w-[18px] px-[4px] text-[12px]'
          : 'h-[20px] min-w-[22px] px-[6px] text-[12px]',
      )}
    >
      {n}
    </span>
  );
}

function Row({ item, counts, rail }: { item: Item; counts: Counts; rail: boolean }): JSX.Element {
  const Icon = item.icon;
  const n = item.count === null ? null : counts[item.count];
  return (
    <NavLink
      to={item.to}
      // Without `end` the index route matches every console path and «Парк зараз» would read as active everywhere.
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'relative flex shrink-0 rounded-[12px] text-sidebar-text transition-colors hover:text-sidebar-ink',
          rail
            ? 'h-[56px] w-full flex-col items-center justify-center gap-[4px]'
            : 'h-[40px] items-center gap-[10px] px-[12px] text-[14px]',
          isActive ? 'bg-sidebar-active text-sidebar-ink' : null,
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span aria-hidden="true" className="absolute top-[8px] bottom-[8px] left-0 w-[2px] rounded-full bg-accent-lift" />
          ) : null}
          <span className={cn('relative flex shrink-0 items-center justify-center', rail ? null : 'opacity-80')}>
            <Icon size={rail ? 20 : 16} aria-hidden="true" />
            {rail && n !== null ? <CountBadge n={n} warn={item.key === 'now'} corner /> : null}
          </span>
          <span className={cn('min-w-0 truncate', rail ? 'text-[12px] leading-none' : 'flex-1')}>
            {rail ? OC.navShort[item.key] : OC.nav[item.key]}
          </span>
          {!rail && n !== null ? <CountBadge n={n} warn={item.key === 'now'} corner={false} /> : null}
        </>
      )}
    </NavLink>
  );
}

function Panel({ mode, counts, onCall }: { mode: ConsoleMode; counts: Counts; onCall: { name: string; until: string } }): JSX.Element {
  const rail = mode === 'rail';
  return (
    <div className={cn('flex h-full shrink-0 flex-col bg-sidebar-bg', WIDTH[mode], rail ? 'px-[8px] py-[12px]' : 'px-[12px] py-[16px]')}>
      <div className={cn('flex shrink-0 items-center gap-[10px]', rail ? 'justify-center pb-[16px]' : 'px-[8px] pb-[20px]')}>
        <TruckMark size={24} className="text-accent-lift" />
        {rail ? null : (
          <div className="min-w-0">
            <p className="truncate text-[15px] leading-[1.25] font-semibold text-sidebar-ink">{OC.brand.title}</p>
            <p className="truncate text-[12px] leading-[1.3] text-sidebar-text">{OC.brand.sub}</p>
          </div>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-[2px]">
            {rail ? null : (
              <p className="px-[12px] pb-[4px] text-[12px] leading-[1.3] font-medium text-sidebar-muted">{group.label}</p>
            )}
            {group.items.map((item) => (
              <Row key={item.key} item={item} counts={counts} rail={rail} />
            ))}
          </div>
        ))}
      </nav>

      {rail ? null : (
        <div className="mt-[16px] shrink-0 rounded-[12px] bg-sidebar-active px-[12px] py-[10px]">
          <p className="text-[12px] leading-[1.4] text-sidebar-text">{`Черговий: ${onCall.name} · до ${onCall.until}`}</p>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  mode,
  counts,
  onCall,
  open,
  onClose,
}: {
  mode: ConsoleMode;
  counts: Counts;
  onCall: { name: string; until: string };
  open?: boolean;
  onClose?(): void;
}): JSX.Element {
  if (mode !== 'mobile') return <Panel mode={mode} counts={counts} onCall={onCall} />;
  return (
    <Drawer
      direction="left"
      open={open === true}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <DrawerContent
        // The panel owns its own geometry and its own ink; the kit's direction preset would make it 3/4 of the screen.
        className="w-[288px] max-w-[288px] border-r-0 bg-sidebar-bg p-0 sm:max-w-[288px]"
        aria-describedby={undefined}
      >
        <DrawerTitle className="sr-only">{OC.brand.title}</DrawerTitle>
        <Panel mode="mobile" counts={counts} onCall={onCall} />
      </DrawerContent>
    </Drawer>
  );
}
