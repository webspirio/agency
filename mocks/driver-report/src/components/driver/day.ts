// mocks/driver-report/src/components/driver/day.ts
/** The driver DAY kit (I-15 «components/driver (W1-02)»): the five cards home picks between, and the rail two of
 *  them draw. It is a barrel of its own rather than five more lines in `./index` (W1-01) because these are the only
 *  driver components that know what a stop, a рейс or a road stop IS — a flow screen that needs a `FlowHeader` must
 *  not pull `project()`'s view models in behind it.
 *
 *  Everything here is a pure function of a view model built by `project()` (I-11) and `todayView()` (I-12) plus one
 *  `now`. No card reads the clock, the server or the outbox: home holds the single `useServerNow()` and passes it
 *  down, so every timer on the pane ticks on the same second and a stage rewind moves all of them at once (§5.8). */
export { DayDoneCard } from './DayDoneCard';
export { RoadStopCard } from './RoadStopCard';
export { StopCard } from './StopCard';
export { TodayCard } from './TodayCard';
export { TripRail } from './TripRail';
export { TripRailCard } from './TripRailCard';
