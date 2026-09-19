// mocks/driver-report/src/app/speed.ts
/** The motion lock (§3.3 D-19, §8.6 #9): nothing on the driver route asks for attention while the truck moves.
 *
 *  Two kinds of truck, two ways of knowing it moves:
 *  - **R+C** (Ruptela with CAN, GNSS fine): the lock follows the truck's speed on the SERVER continuously — ≥ 8 km/h for
 *    3 s locks, < 3 km/h for 3 s unlocks. Between arrival and the stop's commit it takes ≥ 20 km/h for 10 s.
 *  - **RG** (Регіс, no CAN — and an R+C truck whose GPS the stage has cut, D3): nothing runs on the idle home. A tap
 *    that opens or continues a flow reads the speed first, and one plausible reading at or over the line locks and
 *    swallows the tap. While locked the speed is re-read every 2 s; it unlocks exactly as R+C does.
 *
 *  Where a reading comes from: the stage's «Швидкість 60 км/год» (`server.toggles.speed[truck]`) everywhere except
 *  an RG truck on a real phone outside the stage, which asks the phone's own GPS. The stage never touches geolocation
 *  (D4, §8.6 #14): no permission sheet on the presenter's laptop.
 *
 *  Unknown speed fails open, and an implausible reading (≥ 200 km/h, or a jump over 100 km/h from the last one) is
 *  ignored: neither changes the lock. Every threshold comparison goes through `num.ts`, whose `gte` / `lt` hold for
 *  fractional km/h too. Never reported to the office. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { server } from '../api/server';
import { gt, gte, lt } from '../domain/num';
import { IS_STAGE, IS_TOUCH } from './device';
import { useServerValue } from './live';

export type SpeedReading = { kmh: number | null; wall: number };
export type LockState = { locked: boolean; aboveSince: number | null; belowSince: number | null; last: SpeedReading | null };

/** The line a moving truck crosses, the line a stopped one is under, and how long either must hold (wall clock). */
export const LOCK_ON_KMH = 8;
export const LOCK_OFF_KMH = 3;
export const HOLD_MS = 3000;
/** Between arrival and the stop's commit a truck edges along a queue: the line is higher and must hold longer. */
const AT_STOP_ON_KMH = 20;
const AT_STOP_HOLD_MS = 10000;
/** Past these a reading is a GPS artefact, not a truck. */
const MAX_KMH = 200;
const MAX_JUMP_KMH = 100;
/** RG while locked: how often the speed is read again. */
const RE_READ_MS = 2000;
/** How long `justUnlocked` stays true: the «Продовжимо: …» hold banner. */
const UNLOCKED_BANNER_MS = 5000;

const FREE: LockState = { locked: false, aboveSince: null, belowSince: null, last: null };

/** `GeolocationCoordinates.speed` (m/s) → km/h. The `* 3.6` is `src/app`'s one float product. */
export function kmhOf(metresPerSecond: number): number {
  // oxlint-disable-next-line agency/no-float-arithmetic -- GPS m/s to km/h, a sensor reading, never money
  return metresPerSecond * 3.6;
}

/** A known reading under 200 km/h that is at most 100 km/h away from the previous known one. */
export function plausible(prev: SpeedReading | null, next: SpeedReading): boolean {
  if (next.kmh === null || !lt(next.kmh, MAX_KMH)) return false;
  return prev === null || prev.kmh === null || !gt(Math.abs(next.kmh - prev.kmh), MAX_JUMP_KMH);
}

/** One reading's effect on the lock. `tap` is a reading taken inside `guard()` (RG's only reading while unlocked);
 *  `atStop` is the stretch between arrival and the stop's commit. An unknown or implausible reading returns `state`
 *  itself: it changes nothing, not even `last`. */
export function nextLock(state: LockState, reading: SpeedReading, mode: { rc: boolean; atStop: boolean; tap: boolean }): LockState {
  if (reading.kmh === null || !plausible(state.last, reading)) return state;
  const { kmh, wall } = reading;
  if (state.locked) {
    if (!lt(kmh, LOCK_OFF_KMH)) return { ...state, belowSince: null, last: reading };
    const belowSince = state.belowSince ?? wall;
    if (gte(wall - belowSince, HOLD_MS)) return { locked: false, aboveSince: null, belowSince: null, last: reading };
    return { ...state, belowSince, last: reading };
  }
  if (!gte(kmh, mode.atStop ? AT_STOP_ON_KMH : LOCK_ON_KMH)) return { ...state, aboveSince: null, last: reading };
  if (!mode.rc) {
    // RG knows the speed only at a tap: one plausible reading over the line is enough.
    return mode.tap ? { locked: true, aboveSince: wall, belowSince: null, last: reading } : { ...state, last: reading };
  }
  const aboveSince = state.aboveSince ?? wall;
  if (gte(wall - aboveSince, mode.atStop ? AT_STOP_HOLD_MS : HOLD_MS)) {
    return { locked: true, aboveSince, belowSince: null, last: reading };
  }
  return { ...state, aboveSince, last: reading };
}

/** When the next reading is due, in ms from `now`; `null` when nothing needs reading until the speed changes. A hold
 *  in progress is read again the moment it completes, so «3 s» on the stage is 3 s and not the next 2 s tick. */
function nextReadIn(s: LockState, rc: boolean, atStop: boolean, now: number): number | null {
  const due = (since: number | null, hold: number): number | null => (since === null ? null : Math.max(0, since + hold - now));
  if (s.locked) {
    const unlock = due(s.belowSince, HOLD_MS);
    if (rc) return unlock;   // R+C: the server's speed arrives as an event; only a running hold needs a timer
    return unlock === null ? RE_READ_MS : Math.min(unlock, RE_READ_MS);
  }
  return rc ? due(s.aboveSince, atStop ? AT_STOP_HOLD_MS : HOLD_MS) : null;
}

/** An RG truck on a real phone outside the stage reads the phone's own GPS; everything else reads the stage. */
const OWN_GPS = !IS_STAGE && IS_TOUCH;

/** One reading, handed to `done` — synchronously from the stage, asynchronously from the phone's GPS. A GPS that is
 *  absent, refused, slow or speedless gives `null` (fails open). */
function readSpeed(truckId: string, gps: boolean, done: (kmh: number | null) => void): void {
  if (!gps) {
    done(server.toggles.speed[truckId] ?? 0);
    return;
  }
  try {
    navigator.geolocation.getCurrentPosition(
      (p) => done(p.coords.speed !== null && Number.isFinite(p.coords.speed) ? kmhOf(p.coords.speed) : null),
      () => done(null),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 1500 },
    );
  } catch {
    done(null);
  }
}

/** R+C: follows the server's speed continuously. RG: reads it inside `guard()` only; while locked re-reads every 2 s.
 *  `justUnlocked` stays true for 5 s after an unlock (the «Продовжимо: …» banner). A `null` truck never locks. */
export function useMotionLock(truck: { id: string; has_can: boolean; gnss: 'OK' | 'SUSPECT' } | null, atStop: boolean):
  { locked: boolean; guard: <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void; justUnlocked: boolean } {
  const truckId = truck === null ? null : truck.id;
  const rc = truck !== null && truck.has_can && truck.gnss === 'OK';
  const gps = !rc && OWN_GPS;
  // Re-rendered on every server event; the value only matters when it changes (the stage's speed toggle).
  const stageKmh = useServerValue((s) => (truckId === null ? 0 : s.toggles.speed[truckId] ?? 0));
  const lock = useRef<LockState>(FREE);
  const banner = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [locked, setLocked] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  /** Folds one reading into the lock; `true` while locked. */
  const apply = useCallback((kmh: number | null, tap: boolean): boolean => {
    const prev = lock.current;
    const next = nextLock(prev, { kmh, wall: Date.now() }, { rc, atStop, tap });
    lock.current = next;
    if (next.locked !== prev.locked) {
      setLocked(next.locked);
      if (!next.locked) {
        setJustUnlocked(true);
        if (banner.current !== null) clearTimeout(banner.current);
        banner.current = setTimeout(() => {
          banner.current = null;
          setJustUnlocked(false);
        }, UNLOCKED_BANNER_MS);
      }
    }
    return next.locked;
  }, [rc, atStop]);

  // Another truck (a phone switch on the stage, or «GPS зник» flipping the path) starts from nothing.
  useEffect(() => {
    lock.current = FREE;
    setLocked(false);
  }, [truckId, rc]);

  useEffect(() => () => {
    if (banner.current !== null) clearTimeout(banner.current);
  }, []);

  // The readings that are not taps: R+C always, RG only while locked. Re-runs (and reads at once) whenever the stage's
  // speed or the lock itself changes.
  useEffect(() => {
    if (truckId === null || (!rc && !locked)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = (): void => {
      timer = null;
      readSpeed(truckId, gps, (kmh) => {
        if (!alive) return;
        apply(kmh, false);
        const wait = nextReadIn(lock.current, rc, atStop, Date.now());
        if (wait !== null) timer = setTimeout(tick, wait);
      });
    };
    tick();
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [truckId, rc, gps, atStop, locked, stageKmh, apply]);

  const guard = useCallback(<A extends unknown[]>(fn: (...args: A) => void) => (...args: A): void => {
    if (truckId === null) {
      fn(...args);
      return;
    }
    if (lock.current.locked) return;   // swallowed: nothing is reachable while locked (§8.6 #9)
    if (rc) {
      fn(...args);
      return;
    }
    readSpeed(truckId, gps, (kmh) => {
      if (!apply(kmh, true)) fn(...args);
    });
  }, [truckId, rc, gps, apply]);

  return { locked, guard, justUnlocked };
}
