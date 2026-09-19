// mocks/driver-report/src/components/driver/TripRail.tsx
/** The day drawn as a road (§6.1 move 1, §3.3 D-02): today's stops hang off a 4 px centre-line — solid `--accent-ink`
 *  behind the truck, a dashed `--line-strong` centre-marking ahead of it, in the Mark's own 3 : 4 dash rhythm
 *  (`TruckMark`'s `M3 20.5h3M10 20.5h3M17 20.5h3` on a 24-grid). It is the one picture on the driver's home and it
 *  answers «де я в рейсі» without reading a word.
 *
 *  THE RAIL IS DERIVED, NOT DECLARED. Nothing here decides what is done: `project()` (W0-09) puts `state` on every
 *  row, and a segment is solid exactly when the item BELOW it has been reached. That keeps the picture and the words
 *  one claim — a row that says «В офісі ✓» cannot sit on a dashed line.
 *
 *  Markers (a refuel, a road stop) are rows of the same rail rather than badges on a stop: they happened BETWEEN two
 *  stops and the rail is the only place in the product where that order is visible. They carry `data-marker`, never
 *  `data-node`, so a test counting future stops counts stops.
 *
 *  LAYOUT, AND THE ONE PLACE IT LEAVES THE SPEC. §3.3 D-02 reads the row left to right — time · place · detail ·
 *  right the state word. At 390 px the content column is ~210 px after the rail and the gutters, and
 *  «Прийнято диспетчером» (1rem/600) beside «Дніпро-Корм, Вільнянськ» (1.125rem/600) does not fit in it without
 *  wrapping the place to three lines. So the time leads the row in mono and the status line closes it, both full
 *  width: the same four facts in the same order, stacked, and §8.2 D-02 #2 (no horizontal scroll at 360 px) holds.
 *  Rows stay ≥ 4rem and are INERT — a tap on the wrong row is how a driver files a drop under the other farm
 *  (§3.3 D-02 Interactions, EC-155). */
import type { JSX } from 'react';
import { Check, CheckCheck, Clock, CloudOff, CloudUpload, Fuel, Siren } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TripMarkerView, TripStopView } from '../../domain/project';
import { SimChip } from '../shared';
import { StatusLine } from './StatusLine';

type StopStatus = NonNullable<TripStopView['status']>;

/** The office's half of a done row names its icon as a STRING (I-11), because `project()` is a domain module and a
 *  component is not importable from there. This is where the name becomes a component — `StatusLine`'s own
 *  `STATUS_ICON` cannot serve: it is keyed to the outbox's states and carries no `CheckCheck`. */
const RAIL_ICON: Record<StopStatus['icon'], LucideIcon> = { Check, CheckCheck, Clock, CloudOff, CloudUpload };
const MARKER_ICON: Record<TripMarkerView['kind'], LucideIcon> = { REFUEL: Fuel, ROAD_STOP: Siren };

const RAIL_W = '1.5rem';
const NODE = '1.25rem';
/** 12 px of paint, 16 px of road: the Mark's 3 : 4 road dashes at the rail's scale (§6.10). */
const DASHED = 'repeating-linear-gradient(to bottom, var(--line-strong) 0 12px, transparent 12px 28px)';

type Item = { key: string; done: boolean } & (
  | { kind: 'stop'; stop: TripStopView }
  | { kind: 'marker'; marker: TripMarkerView }
);

/** One flat column: each stop, then the markers recorded after it, in the order `project()` emitted them. A marker is
 *  always `done` — it is a thing that happened, so the rail is solid up to it. */
function sequence(stops: TripStopView[], markers: TripMarkerView[]): Item[] {
  return stops.flatMap((stop): Item[] => [
    { key: `stop:${stop.stop_id}`, done: stop.state === 'done', kind: 'stop', stop },
    ...markers.filter((m) => m.after_stop_id === stop.stop_id).map((marker, i): Item => ({
      key: `mark:${stop.stop_id}:${i}`, done: true, kind: 'marker', marker,
    })),
  ]);
}

function Node({ state }: { state: TripStopView['state'] }): JSX.Element {
  if (state === 'done') {
    return (
      <span
        data-node="done"
        className="relative z-10 flex shrink-0 items-center justify-center rounded-full"
        style={{ width: NODE, height: NODE, background: 'var(--accent-ink)' }}
      >
        <Check className="size-[0.875rem]" strokeWidth={3} style={{ color: 'var(--label)' }} />
      </span>
    );
  }
  return (
    <span
      data-node={state}
      className="relative z-10 block shrink-0 rounded-full"
      style={{
        width: NODE,
        height: NODE,
        background: 'var(--label)',
        boxShadow: `inset 0 0 0 ${state === 'current' ? '4px var(--accent-ink)' : '2px var(--line-strong)'}`,
      }}
    />
  );
}

function MarkerNode({ kind }: { kind: TripMarkerView['kind'] }): JSX.Element {
  const Icon = MARKER_ICON[kind];
  return (
    <span
      data-marker={kind}
      className="relative z-10 flex shrink-0 items-center justify-center rounded-full"
      style={{ width: NODE, height: NODE, background: 'var(--label)' }}
    >
      <Icon className="size-[1.25rem]" style={{ color: 'var(--text-2)' }} />
    </span>
  );
}

/** The four facts of a planned stop, stacked (see the layout note above), plus the hold line, the office's state
 *  word and — under the last done stop only, because that is where `project()` puts it — the departure line. */
function StopRow({ stop }: { stop: TripStopView }): JSX.Element {
  return (
    <span className="flex min-h-[4rem] flex-col gap-[2px] pb-3">
      <span className="font-mono text-[0.875rem] leading-[1.25rem] font-medium" style={{ color: 'var(--text-2)' }}>
        {stop.time}
      </span>
      <span className="text-[1.125rem] leading-[1.5rem] font-semibold">{stop.place}</span>
      <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{stop.detail}</span>
      {stop.hold === null ? null : (
        <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--hold)' }}>{stop.hold}</span>
      )}
      {stop.status === null ? null : (
        <span className="block pt-1">
          <StatusLine tone={stop.status.tone} icon={RAIL_ICON[stop.status.icon]} text={stop.status.text} />
        </span>
      )}
      {stop.departure === null ? null : (
        <span className="flex flex-wrap items-center gap-1 pt-1 text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>
          {stop.departure.text}
          {stop.departure.simulated ? <SimChip /> : null}
        </span>
      )}
    </span>
  );
}

export function TripRail({ stops, markers }: { stops: TripStopView[]; markers: TripMarkerView[] }): JSX.Element {
  const items = sequence(stops, markers);
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => {
        const next = items[i + 1];
        return (
          <li key={item.key} className="grid gap-3" style={{ gridTemplateColumns: `${RAIL_W} minmax(0, 1fr)` }}>
            <span aria-hidden="true" className="relative flex justify-center">
              {item.kind === 'marker' ? <MarkerNode kind={item.marker.kind} /> : <Node state={item.stop.state} />}
              {next === undefined ? null : (
                <span
                  className="absolute bottom-0 left-1/2 w-[4px] -translate-x-1/2 rounded-[2px]"
                  style={{
                    top: `calc(${NODE} / 2)`,
                    ...(next.done ? { background: 'var(--accent-ink)' } : { backgroundImage: DASHED }),
                  }}
                />
              )}
            </span>
            {item.kind === 'marker'
              ? (
                <span className="flex min-h-[2.5rem] items-center pb-2 text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>
                  {item.marker.text}
                </span>
              )
              : (
                <StopRow stop={item.stop} />
              )}
          </li>
        );
      })}
    </ol>
  );
}
