// mocks/driver-report/src/pages/driver/home/NowCard.tsx
/** The one card that answers «де я зараз» — §3.2's decision table, rendered (§3.3 D-02).
 *
 *  Nothing is decided here. `project()` (I-11) already chose the mode; this file only maps a mode to the card the
 *  spec names for it, so the table lives in ONE place and a screenshot of home can be traced back to a row of §3.2
 *  rather than to a condition somebody wrote twice.
 *
 *  Mode C is the only mode with two cards: the StopCard, then the same TripRail card the driving modes show, because
 *  a driver standing at a mill still has to know what comes after it. */
import type { JSX } from 'react';
import { DayDoneCard, RoadStopCard, StopCard, TodayCard, TripRailCard } from '../../../components/driver/day';
import type { DriverToday } from '../../../domain/dto';
import type { Projection } from '../../../domain/project';
import type { Instant } from '../../../domain/types';

export function NowCard({ today, view, now, rc, onStatus, onAlertOver }: {
  today: DriverToday;
  view: Projection;
  now: Instant;
  rc: boolean;
  onStatus(): void;
  onAlertOver(): void;
}): JSX.Element | null {
  const rail = <TripRailCard {...view.trip} />;

  switch (view.mode) {
    case 'A':
      return <TodayCard today={today} now={now} />;
    case 'C':
      return view.openStop === null ? rail : (
        <>
          <StopCard
            open={view.openStop}
            now={now}
            rc={rc}
            onStatus={onStatus}
            {...(view.openStop.alert === null ? {} : { onAlertOver })}
            onCall={today.on_call}
          />
          {rail}
        </>
      );
    case 'D':
      return view.openRoadStop === null ? null
        : <RoadStopCard road={view.openRoadStop} now={now} onCall={today.on_call} />;
    case 'E':
      return today.day === null ? null : <DayDoneCard day={today.day} />;
    case 'B':
    case 'B1':
    case 'B2':
      return rail;
    case 'UNBOUND':
    case 'REVOKED':
      return null;
  }
}
