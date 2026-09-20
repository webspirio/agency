// mocks/driver-report/src/domain/project.ts
/** Home decides the one next action (§3.2) and draws the day as a road (§3.3 D-02, §6.1 move 1).
 *
 *  A pure function of what the server last answered (`DriverToday`) and what the phone still holds (the pending
 *  outbox records), so the phone gives the same answer with no network: every pending record is treated as if the
 *  office had just acknowledged it. The words test scans this file, comments included (§0.3). */
import { round } from '@agency/dec';
import { asInstant } from '@agency/mock';
import { fmtDur, fmtKm, fmtMass, fmtTime } from '../app/format';
import { DC } from '../copy/driver';
import { atOrBefore, businessDate, cmpInstant, isBefore, minutesBetween } from './clock';
import type { AutoEventView, DriverToday, PlannedStopView, RecordIn, RecordView } from './dto';
import { cmpNum, gt, lt } from './num';
import type { Instant, Payloads, RecordType, RoadStopReason, SegmentChip } from './types';

export type HomeMode = 'UNBOUND' | 'REVOKED' | 'D' | 'A' | 'C' | 'B' | 'B1' | 'B2' | 'E';   // B1 = B′, B2 = B″
export type PrimaryTarget = { kind: 'shift-start' } | { kind: 'arrive'; stopId: string } | { kind: 'choose-place' }
  | { kind: 'loaded'; stopId: string } | { kind: 'unloaded'; stopId: string } | { kind: 'leave'; stopId: string }
  | { kind: 'shift-end' } | { kind: 'close-road-stop' } | { kind: 'elsewhere' } | { kind: 'my-day' }
  | { kind: 'new-shift' };
export type Action = { verb: string; place: string | null; target: PrimaryTarget };
export type TripStopView = { stop_id: string; state: 'done' | 'current' | 'future'; time: string; place: string;
  detail: string; hold: string | null; status: { text: string; icon: 'Check' | 'CheckCheck' | 'CloudOff' | 'CloudUpload' | 'Clock';
    tone: 'plain' | 'hold' } | null; departure: { text: string; simulated: boolean } | null };
export type TripMarkerView = { after_stop_id: string; kind: 'REFUEL' | 'ROAD_STOP'; text: string };
export type OpenStop = { stop: PlannedStopView; arrived_at: Instant; auto: boolean; segment: { chip: SegmentChip; since: Instant } | null;
  alert: { since: Instant; key: string } | null };
export type OpenRoadStop = { key: string; reason: RoadStopReason; since: Instant };
export type Projection = { mode: HomeMode; openStop: OpenStop | null; nextStop: PlannedStopView | null;
  openRoadStop: OpenRoadStop | null; primary: Action | null; quiet: Action | null;
  trip: { header: string; source: string; stops: TripStopView[]; markers: TripMarkerView[]; emptySlot: string | null };
  shiftOpen: boolean; firstArrivalEver: boolean };

/* ── the records the phone knows about ───────────────────────────────────── */

/** One record, acknowledged (`acked` is its view) or still in the outbox (`acked` is null). */
type Base = { key: string; seq: number; at: Instant; committed: Instant; stop_id: string | null; acked: RecordView | null };
type Live = { [T in RecordType]: Base & { type: T; payload: Payloads[T] } }[RecordType];
type LiveOf<T extends RecordType> = Extract<Live, { type: T }>;
type Completion = LiveOf<'LOADED'> | LiveOf<'UNLOADED'> | LiveOf<'STOP_LEFT'>;

// RecordView carries `type` and `payload` as two independent unions; the server pairs them, so the pair is re-joined.
const fromView = (r: RecordView): Live => ({ key: r.key, seq: r.seq, at: r.occurred_at, committed: r.committed_at,
  stop_id: r.stop_id, acked: r, type: r.type, payload: r.payload }) as Live;
const fromPending = (r: RecordIn): Live => ({ key: r.key, seq: r.seq, at: asInstant(r.occurred_at),
  committed: asInstant(r.committed_at), stop_id: r.stop_id ?? null, acked: null, type: r.type, payload: r.payload }) as Live;

/** `today.records` that are not undone, then every pending record the server does not have yet; a VOID (acknowledged
 *  or pending) removes its target. Ordered by `occurred_at`, stable. */
function liveRecords(today: DriverToday, pending: RecordIn[]): Live[] {
  const known = new Set(today.records.map((r) => r.key));
  const all = [...today.records.filter((r) => !r.voided).map(fromView),
    ...pending.filter((r) => !known.has(r.key)).map(fromPending)];
  const undone = new Set(all.flatMap((r) => (r.type === 'VOID' ? [r.payload.target_key] : [])));
  return all.filter((r) => r.type !== 'VOID' && !undone.has(r.key)).sort((a, b) => cmpInstant(a.at, b.at));
}

/* ── the shift ───────────────────────────────────────────────────────────── */

/** Open when the newest start/end mark is a start; ended today when it is an end on today's Kyiv date. */
function shiftOf(today: DriverToday, recs: Live[], now: Instant): { open: boolean; since: Instant | null; endedToday: boolean } {
  const marks: { at: Instant; open: boolean }[] = [];
  if (today.shift !== null) {
    marks.push({ at: today.shift.started_at, open: true });
    if (today.shift.ended_at !== null) marks.push({ at: today.shift.ended_at, open: false });
  }
  for (const r of recs) {
    if (r.type === 'SHIFT_START') marks.push({ at: r.at, open: true });
    if (r.type === 'SHIFT_END') marks.push({ at: r.at, open: false });
  }
  const last = marks.sort((a, b) => cmpInstant(a.at, b.at)).at(-1);
  if (last === undefined) return { open: false, since: null, endedToday: false };
  return { open: last.open, since: last.open ? last.at : null,
    endedToday: !last.open && businessDate(last.at) === businessDate(now) };
}

/* ── stops ───────────────────────────────────────────────────────────────── */

/** `names`: every id a record may use for the stop — its own, and the key of each arrival filed under it (D-12). */
type StopState = { stop: PlannedStopView; planned: boolean; names: Set<string>; arrival: LiveOf<'ARRIVED'> | null;
  arrived_at: Instant | null; auto: boolean; completion: Completion | null };
const answersTo = (s: StopState, id: string | null): boolean => id !== null && s.names.has(id);

type Done = StopState & { completion: Completion };
const isCompletion = (r: Live): r is Completion => r.type === 'LOADED' || r.type === 'UNLOADED' || r.type === 'STOP_LEFT';
const isDone = (s: StopState): s is Done => s.completion !== null;
/** The last item by time; on a tie, the later one in the list. */
function latest<T>(items: T[], at: (t: T) => Instant): T | null {
  return items.reduce<T | null>((best, x) => (best === null || !isBefore(at(x), at(best)) ? x : best), null);
}
const atStop = (e: AutoEventView, s: PlannedStopView): boolean =>
  e.stop_id === s.stop_id || (e.stop_id === null && e.place_id === s.place_id);

/** A place the plan does not have yet: the arrival is still in the phone, so the stop the server will file it under
 *  does not exist. It stands in for that stop until the next answer names it (D-12). Until then the phone can call the
 *  stop only by its arrival's key, and whatever it wrote there keeps that name after the office has filed the arrival,
 *  which is why every stop answers to the keys of its arrivals as well as to its own id. */
function unplannedStop(a: LiveOf<'ARRIVED'>): PlannedStopView {
  const name = a.payload.new_place ? 'Нове місце' : '—';
  return { stop_id: a.stop_id ?? a.key, plan_key: `u-${a.key}`, seq: 0, kind: 'UNPLANNED', place_id: '', label: name,
    label_gen: name, short: name, town: '', town_loc: '', ttn_expected: 0, ttn_nos: [], drop_index: null, drop_count: null, compartments: null,
    mass_t: null, planned_km: null, no_photos: false, weigh_ticket: false, accepted_at: null };
}

/** A stop opens at its ARRIVED — or, on a Ruptela truck whose position is trusted, at a Ruptela IN at its place after the
 *  shift began — and completes at LOADED / UNLOADED / STOP_LEFT (§7.3). */
function stopStates(today: DriverToday, recs: Live[], now: Instant, shiftSince: Instant | null): StopState[] {
  const plan = [...(today.plan?.stops ?? [])].sort((a, b) => cmpNum(a.seq, b.seq));
  const ids = new Set(plan.map((s) => s.stop_id));
  const extra = recs.filter((r): r is LiveOf<'ARRIVED'> => r.type === 'ARRIVED' && (r.stop_id === null || !ids.has(r.stop_id)))
    .map(unplannedStop).filter((s, i, all) => all.findIndex((o) => o.stop_id === s.stop_id) === i);
  const trusted = today.truck !== null && today.truck.telematics === 'RUPTELA' && today.truck.gnss === 'OK';
  const state = (stop: PlannedStopView, planned: boolean): StopState => {
    const standIn = (r: Live): boolean => !planned && r.key === stop.stop_id;
    const called = new Set([stop.stop_id, ...recs.filter((r) => r.type === 'ARRIVED' && (r.stop_id === stop.stop_id || standIn(r)))
      .map((r) => r.key)]);
    const own = recs.filter((r) => (r.stop_id !== null && called.has(r.stop_id)) || standIn(r));
    const arrival = own.find((r): r is LiveOf<'ARRIVED'> => r.type === 'ARRIVED') ?? null;
    const tin = arrival === null && trusted
      ? today.auto_events.find((e) => e.kind === 'IN' && atStop(e, stop) && atOrBefore(e.at, now)
        && (shiftSince === null || !isBefore(e.at, shiftSince))) ?? null
      : null;
    return { stop, planned, names: called, arrival, arrived_at: arrival?.at ?? tin?.at ?? null, auto: tin !== null,
      completion: own.find(isCompletion) ?? null };
  };
  return [...plan.map((s) => state(s, true)), ...extra.map((s) => state(s, false))];
}

/** Inside a stop: at or after its arrival and before its completion. */
const inside = (s: StopState, at: Instant): boolean => s.arrived_at !== null && !isBefore(at, s.arrived_at)
  && (s.completion === null || isBefore(at, s.completion.at));

/* ── road stops ──────────────────────────────────────────────────────────── */

type Road = { rec: LiveOf<'ROAD_STOP'>; end: Instant | null };

/** A road stop is open until a ROAD_STOP_END names it or — on a Ruptela truck — the first visible MOTION after it,
 *  which closes it at the moment the motion began (W0-07's rule, §3.3 D-11 «за рухом»). */
function roadStops(today: DriverToday, recs: Live[], now: Instant): Road[] {
  const motion = today.truck?.telematics === 'RUPTELA'
    ? today.auto_events.filter((e) => e.kind === 'MOTION' && atOrBefore(e.at, now)).map((e) => e.at).sort(cmpInstant)
    : [];
  return recs.filter((r): r is LiveOf<'ROAD_STOP'> => r.type === 'ROAD_STOP').map((rec) => {
    const end = recs.find((e): e is LiveOf<'ROAD_STOP_END'> => e.type === 'ROAD_STOP_END' && e.payload.road_stop_key === rec.key);
    if (end !== undefined) return { rec, end: asInstant(end.payload.at) };
    return { rec, end: motion.find((at) => isBefore(rec.at, at)) ?? null };
  });
}
/** «Об'їзд» commits without a timer and ends at the next arrival (§3.3 D-11): never the stand-still of mode D. */
const standing = (r: Road): boolean => r.end === null && r.rec.payload.reason !== 'DETOUR';

/* ── the open stop ───────────────────────────────────────────────────────── */

type Seg = { chip: SegmentChip; since: Instant; key: string };

function openStopOf(s: StopState, recs: Live[], roads: Road[]): OpenStop | null {
  if (s.arrived_at === null || s.completion !== null) return null;
  const arrivedAt = s.arrived_at;
  const mine = (r: Live): boolean => answersTo(s, r.stop_id) || (r.stop_id === null && inside(s, r.at));
  const segs: Seg[] = [];
  if (s.arrival !== null && s.arrival.payload.chip !== null) {
    segs.push({ chip: s.arrival.payload.chip, since: s.arrival.at, key: s.arrival.key });
  }
  for (const r of recs) {
    if (!mine(r)) continue;
    if (r.type === 'SEGMENT') segs.push({ chip: r.payload.chip, since: r.at, key: r.key });
    // «Не приймають» puts the stop into «Чекаю вказівки» from that moment (D-11).
    if (r.type === 'STOP_PROBLEM' && r.payload.kind === 'NOT_ACCEPTED') segs.push({ chip: 'WAIT_ORDERS', since: r.at, key: r.key });
  }
  segs.sort((a, b) => cmpInstant(a.since, b.since));
  const plain = segs.filter((g) => g.chip !== 'ALERT').at(-1);
  const ended = new Set(recs.flatMap((r) => (r.type === 'ROAD_STOP_END' ? [r.payload.road_stop_key] : [])));
  // An alert inside the stop is a segment of it (EC-58): the ALERT segment until a later segment replaces it or a
  // ROAD_STOP_END names it, or an «Тривога / укриття» road stop taken while the stop is open.
  const alerts = [
    ...segs.filter((g, i) => g.chip === 'ALERT' && !ended.has(g.key) && !segs.slice(i + 1).some((n) => n.chip !== 'ALERT'))
      .map((g) => ({ since: g.since, key: g.key })),
    ...roads.filter((r) => r.end === null && r.rec.payload.reason === 'ALERT'
      && (answersTo(s, r.rec.stop_id) || (r.rec.stop_id === null && !isBefore(r.rec.at, arrivedAt))))
      .map((r) => ({ since: r.rec.at, key: r.rec.key })),
  ].sort((a, b) => cmpInstant(a.since, b.since));
  return { stop: s.stop, arrived_at: arrivedAt, auto: s.auto,
    segment: plain === undefined ? null : { chip: plain.chip, since: plain.since }, alert: alerts.at(-1) ?? null };
}

/* ── the TripRail card ───────────────────────────────────────────────────── */

const UNPLANNED_WORD = { LOADING: 'Завантаження', DROP: 'Вивантаження', REFUEL: 'Заправка', OTHER: 'Інше' } as const;

function detailOf(s: StopState): string {
  const { stop } = s;
  const mass = (v: string): string => `${fmtMass(v)} т`;
  switch (stop.kind) {
    case 'LOADING': {
      const counted = s.completion?.type === 'LOADED' && gt(s.completion.payload.ttn_count, 0)
        ? s.completion.payload.ttn_count : stop.ttn_expected;
      return ['Завантаження', gt(counted, 0) ? `${counted} ТТН` : null,
        stop.mass_t === null ? null : mass(round(stop.mass_t, 1))].filter((p) => p !== null).join(' · ');
    }
    case 'DROP':
      return [stop.drop_index !== null && stop.drop_count !== null ? `Вивантаження ${stop.drop_index} з ${stop.drop_count}` : 'Вивантаження',
        stop.compartments === null ? null : `відсіки ${stop.compartments}`,
        stop.ttn_nos.length === 0 ? null : `ТТН ${stop.ttn_nos.join(', ')}`,
        stop.mass_t === null ? null : mass(stop.mass_t)].filter((p) => p !== null).join(' · ');
    case 'BASE':
      return 'Повернення на базу';
    case 'UNPLANNED':
      return UNPLANNED_WORD[s.arrival?.payload.unplanned_kind ?? 'OTHER'];
  }
}

/** The office's side of a done row: nothing while its completion is still in the phone (HomePage draws that from the
 *  outbox), else «Прийнято диспетчером» / «В офісі ✓», with the photos still in the phone when there are any (§6.6). */
function statusOf(s: StopState): TripStopView['status'] {
  const view = s.completion?.acked ?? null;
  if (view === null) return null;
  if ((view.accepted_at ?? s.stop.accepted_at) !== null) return { text: DC.status.accepted, icon: 'CheckCheck', tone: 'plain' };
  if (lt(view.photos_received, view.photos_expected)) {
    return { text: `${DC.status.inOffice} · ${DC.status.photosLeft(view.photos_expected - view.photos_received, view.photos_expected)}`,
      icon: 'CloudUpload', tone: 'hold' };
  }
  return { text: DC.status.inOffice, icon: 'Check', tone: 'plain' };
}

/** RG: the completion's commit, or unknown when the photos came after the truck moved; R+C: the Ruptela OUT (§3.3 D-02). */
function departureOf(s: StopState, today: DriverToday, now: Instant): TripStopView['departure'] {
  const done = s.completion;
  if (done === null) return null;
  if (today.truck?.telematics === 'RUPTELA') {
    const anchor = s.arrived_at ?? done.at;
    const out = today.auto_events.find((e) => e.kind === 'OUT' && atStop(e, s.stop) && atOrBefore(e.at, now) && !isBefore(e.at, anchor));
    return out === undefined ? null : { text: `Виїхав ${fmtTime(out.at)} · Ruptela`, simulated: true };
  }
  const deferred = done.type === 'STOP_LEFT' ? null : done.payload.deferred;
  return deferred !== null ? { text: 'виїзд — невідомо, за ТТН', simulated: false }
    : { text: `виїзд — не раніше ${fmtTime(done.committed)} (запис)`, simulated: false };
}

function rowsOf(states: StopState[], open: StopState | null, today: DriverToday, now: Instant): TripStopView[] {
  const planned = states.filter((s) => s.planned);
  const current = (open !== null && open.planned ? open : null) ?? planned.find((s) => s.completion === null) ?? null;
  const lastDone = latest(planned.filter(isDone), (s) => s.completion.at);
  return planned.map((s) => {
    const state = s.completion !== null ? 'done' : s === current ? 'current' : 'future';
    const time = s.completion !== null
      ? (s.arrived_at === null ? fmtTime(s.completion.at) : `${fmtTime(s.arrived_at)}–${fmtTime(s.completion.at)}`)
      : s.arrived_at !== null && s === current ? `з ${fmtTime(s.arrived_at)}`
        : s.stop.planned_km === null ? '—' : `+${fmtKm(s.stop.planned_km)} км`;
    return { stop_id: s.stop.stop_id, state, time, place: s.stop.short, detail: detailOf(s),
      hold: s.stop.no_photos ? 'Фото на території заборонені' : null,
      status: state === 'done' ? statusOf(s) : null,
      departure: s === lastDone ? departureOf(s, today, now) : null };
  });
}

/** Refuels and road stops as markers between done stops; a road stop inside a stop is a segment of it, not a marker. */
function markersOf(states: StopState[], recs: Live[], roads: Road[]): TripMarkerView[] {
  const after = (at: Instant): string | null =>
    latest(states.filter(isDone).filter((s) => s.planned && atOrBefore(s.completion.at, at)), (s) => s.completion.at)?.stop.stop_id ?? null;
  const marks: { at: Instant; kind: TripMarkerView['kind']; text: string }[] = [];
  for (const r of recs) {
    if (r.type === 'REFUEL') {
      marks.push({ at: r.at, kind: 'REFUEL', text: r.payload.station === '' ? `${fmtTime(r.at)} ${DC.tiles.refuel}`
        : `${fmtTime(r.at)} ${DC.tiles.refuel} · ${r.payload.station}` });
    }
  }
  for (const { rec, end } of roads) {
    if (rec.stop_id !== null || states.some((s) => inside(s, rec.at))) continue;
    const short = DC.roadStopShort[rec.payload.reason];
    const text = rec.payload.reason === 'DETOUR' ? `${fmtTime(rec.at)} ${short}`
      : end === null ? `${short} · з ${fmtTime(rec.at)}`
        : `${fmtTime(rec.at)}–${fmtTime(end)} ${short} · ${fmtDur(minutesBetween(rec.at, end))}`;
    marks.push({ at: rec.at, kind: 'ROAD_STOP', text });
  }
  return marks.sort((a, b) => cmpInstant(a.at, b.at)).flatMap((m) => {
    const stopId = after(m.at);
    return stopId === null ? [] : [{ after_stop_id: stopId, kind: m.kind, text: m.text }];
  });
}

/* ── the decision ────────────────────────────────────────────────────────── */

const act = (verb: string, target: PrimaryTarget, place: string | null = null): Action => ({ verb, place, target });
const ELSEWHERE = act(DC.primary.elsewhere, { kind: 'elsewhere' });

/** Home's mode, its one accent action and its quiet one, and the TripRail card — the decision table of §3.2, in order. */
export function project(today: DriverToday, pending: RecordIn[], now: Instant): Projection {
  const recs = liveRecords(today, pending);
  const shift = shiftOf(today, recs, now);
  const states = stopStates(today, recs, now, shift.since);
  const roads = roadStops(today, recs, now);

  const openState = latest(states.filter((s): s is StopState & { arrived_at: Instant } => s.arrived_at !== null && s.completion === null),
    (s) => s.arrived_at);
  const openStop = openState === null ? null : openStopOf(openState, recs, roads);
  const road = roads.filter(standing).at(-1) ?? null;
  const openRoadStop = road === null ? null : { key: road.rec.key, reason: road.rec.payload.reason, since: road.rec.at };
  const nextStop = states.find((s) => s.planned && s.completion === null && s !== openState)?.stop ?? null;
  const plan = today.plan;

  let mode: HomeMode;
  let primary: Action | null = null;
  let quiet: Action | null = null;
  if (!today.device.bound) mode = 'UNBOUND';
  else if (today.device.revoked) mode = 'REVOKED';
  else if (openRoadStop !== null && openStop === null) {
    mode = 'D';
    primary = act(DC.primary.over, { kind: 'close-road-stop' });
  } else if (!shift.open && !shift.endedToday) {
    mode = 'A';
    primary = act(DC.primary.start, { kind: 'shift-start' });
  } else if (shift.open && openStop !== null) {
    mode = 'C';
    const stopId = openStop.stop.stop_id;
    primary = openStop.stop.kind === 'LOADING' ? act(DC.primary.loaded, { kind: 'loaded', stopId })
      : openStop.stop.kind === 'DROP' ? act(DC.primary.unloaded, { kind: 'unloaded', stopId })
        : act(DC.primary.leave, { kind: 'leave', stopId });
    quiet = ELSEWHERE;
  } else if (shift.open && plan !== null && nextStop !== null) {
    mode = 'B';
    primary = act(DC.primary.here, { kind: 'arrive', stopId: nextStop.stop_id }, nextStop.short);
    quiet = ELSEWHERE;
  } else if (shift.open && plan !== null) {
    mode = 'B1';
    primary = act(DC.primary.end, { kind: 'shift-end' });
    quiet = ELSEWHERE;
  } else if (shift.open) {
    mode = 'B2';
    primary = act(DC.primary.here, { kind: 'choose-place' }, DC.primary.choose);
    quiet = act(DC.primary.end, { kind: 'shift-end' });
  } else {
    mode = 'E';
    quiet = act(DC.primary.newShift, { kind: 'new-shift' });
  }

  return {
    mode, openStop, nextStop, openRoadStop, primary, quiet,
    trip: {
      header: plan === null ? 'Сьогодні' : plan.mass_label === '' ? `Рейс ${plan.trip_no}` : `Рейс ${plan.trip_no} · ${plan.mass_label}`,
      // «приклад» is the card's own chip (§6.5 ExampleChip, §8.6 #16), so the line is handed over without it.
      source: plan === null ? '' : plan.imported_label,
      stops: rowsOf(states, openState, today, now),
      markers: markersOf(states, recs, roads),
      emptySlot: mode === 'B2' ? `Місця оберете на точці — «${DC.primary.here}» → «${DC.primary.choose}»` : null,
    },
    shiftOpen: shift.open,
    firstArrivalEver: today.first_time.first_arrival && !recs.some((r) => r.type === 'ARRIVED'),
  };
}
