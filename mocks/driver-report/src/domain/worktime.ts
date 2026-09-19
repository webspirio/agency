// mocks/driver-report/src/domain/worktime.ts
/** Working time of §7.3 (C-08 «На зміні», C-15, the driver's «на зміні» / «на точках»): the shift span, the on-site
 *  total, road stops by reason and the night minutes 22:00–06:00 Kyiv. Durations only — never a legal category; the
 *  classification of 02 UC-S11 belongs to C-15 alone.
 *
 *  Nothing here imports derive.ts: the on-site total takes any `{ on_site_min }` rows, and road stops are read straight
 *  from `w.records`, closed exactly as derive.ts closes them (a `ROAD_STOP_END` naming the stop's key, or — on an R+C
 *  truck — the first visible `MOTION` after it). No `*` or `/`: the night is walked boundary to boundary, each boundary
 *  a Kyiv wall time converted by clock.ts, so a clock change is counted as the hour it really was. */
import type { Instant } from '@agency/mock';
import { addDays, atOrBefore, businessDate, cmpInstant, isBefore, kyiv, kyivParts, minutesBetween, secondsBetween } from './clock';
import { gte, intDiv, lt } from './num';
import { ROAD_STOP_REASONS, type DriverRecord, type RecordOf, type RoadStopReason, type Shift, type World } from './types';

const NIGHT_STARTS = '22:00';
const NIGHT_ENDS = '06:00';
const earlier = (a: Instant, b: Instant): Instant => (isBefore(b, a) ? b : a);
const nonNegative = (n: number): number => (lt(n, 0) ? 0 : n);

/** Minutes of [from, to) that fall inside 22:00–06:00 Kyiv; 0 for an empty or reversed span. Seconds are summed and
 *  truncated once, at the end. */
export function nightMinutes(from: Instant, to: Instant): number {
  let seconds = 0;
  let at = from;
  while (isBefore(at, to)) {
    const { h } = kyivParts(at);
    const date = businessDate(at);
    const beforeDawn = lt(h, 6);
    const night = beforeDawn || gte(h, 22);
    // The next boundary is always strictly after `at`, so the walk ends.
    const boundary = night ? kyiv(`${beforeDawn ? date : addDays(date, 1)} ${NIGHT_ENDS}`) : kyiv(`${date} ${NIGHT_STARTS}`);
    const next = earlier(boundary, to);
    if (night) seconds += secondsBetween(at, next);
    at = next;
  }
  return intDiv(seconds, 60);
}

/** The shift's span in whole minutes: start → end, or start → now while it is open. Never negative. */
export function shiftMinutes(shift: Shift, now: Instant): number {
  return nonNegative(minutesBetween(shift.started_at, shift.ended_at ?? now));
}

/** «На точках»: the sum of the stops' on-site minutes; a stop whose minutes are unknown adds nothing. */
export function onSiteMinutes(stops: readonly { on_site_min: number | null }[]): number {
  return stops.reduce((total, s) => total + (s.on_site_min ?? 0), 0);
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
/** When a ROAD_STOP_END says the stop ended: the time the driver picked (`payload.at`), else the moment he tapped. */
const endedAt = (end: RecordOf<'ROAD_STOP_END'>): Instant => (INSTANT.test(end.payload.at) ? end.payload.at as Instant : end.occurred_at);
const first = (instants: readonly Instant[]): Instant | null =>
  instants.reduce<Instant | null>((best, at) => (best === null || cmpInstant(at, best) === -1 ? at : best), null);

/** When a road stop closed, or `null` while it is still open at `now`. */
function closedAt(w: World, live: readonly DriverRecord[], stop: RecordOf<'ROAD_STOP'>, now: Instant): Instant | null {
  const byDriver = first(live.flatMap((r) => (r.type === 'ROAD_STOP_END' && r.payload.road_stop_key === stop.key ? [endedAt(r)] : [])));
  if (byDriver !== null) return byDriver;
  const truck = w.trucks.find((t) => t.id === stop.truck_id);
  if (!truck || truck.telematics !== 'RUPTELA' || !truck.has_can) return null;
  return first(w.telemetry.flatMap((t) => (t.truck_id === stop.truck_id && t.kind === 'MOTION'
    && isBefore(stop.occurred_at, t.at) && atOrBefore(t.at, now) ? [t.at] : [])));
}

/** Minutes the shift stood on the road, by reason (every reason present, 0 when none). A road stop runs from its
 *  `occurred_at` to its close; one still open runs to `now`, and nothing counts past the end of its shift. Voided
 *  records do not count. */
export function roadStopMinutes(w: World, shiftId: string, now: Instant): Record<RoadStopReason, number> {
  const out = Object.fromEntries(ROAD_STOP_REASONS.map((reason) => [reason, 0])) as Record<RoadStopReason, number>;
  const shift = w.shifts.find((s) => s.id === shiftId);
  const limit = shift?.ended_at ? earlier(shift.ended_at, now) : now;
  const live = w.records.filter((r) => r.voided_by === null);
  for (const r of live) {
    if (r.type !== 'ROAD_STOP' || r.shift_id !== shiftId) continue;
    const end = earlier(closedAt(w, live, r, now) ?? limit, limit);
    out[r.payload.reason] += nonNegative(minutesBetween(r.occurred_at, end));
  }
  return out;
}
