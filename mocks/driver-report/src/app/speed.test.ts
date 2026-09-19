// mocks/driver-report/src/app/speed.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { server } from '../api/server';
import { kmhOf, nextLock, plausible, useMotionLock, type LockState } from './speed';

const free: LockState = { locked: false, aboveSince: null, belowSince: null, last: null };
const r = (kmh: number | null, wall: number) => ({ kmh, wall });
const run = (state: LockState, readings: [number | null, number][], mode = { rc: true, atStop: false, tap: false }) =>
  readings.reduce((s, [k, w]) => nextLock(s, r(k, w), mode), state);

describe('the motion lock (§3.3 D-19, §8.6 #9)', () => {
  it('locks R+C after 3 s at ≥ 8 km/h and unlocks after 3 s below 3 km/h', () => {
    expect(run(free, [[60, 0], [60, 2_900]]).locked).toBe(false);
    const locked = run(free, [[60, 0], [60, 3_000]]);
    expect(locked.locked).toBe(true);
    expect(run(locked, [[0, 4_000], [0, 6_900]]).locked).toBe(true);
    expect(run(locked, [[0, 4_000], [0, 7_000]]).locked).toBe(false);
  });
  it('locks RG at the first plausible tap reading', () => {
    expect(run(free, [[60, 0]], { rc: false, atStop: false, tap: true }).locked).toBe(true);
  });
  it('needs 20 km/h for 10 s between arrival and commit', () => {
    expect(run(free, [[15, 0], [15, 20_000]], { rc: true, atStop: true, tap: false }).locked).toBe(false);
    expect(run(free, [[25, 0], [25, 10_000]], { rc: true, atStop: true, tap: false }).locked).toBe(true);
  });
  it('converts GPS metres per second to km/h', () => {
    expect([kmhOf(0), kmhOf(10), kmhOf(16.7)].map((v) => Math.round(v))).toEqual([0, 36, 60]);
  });
  it('fails open on unknown speed and ignores implausible readings', () => {
    expect(run(free, [[null, 0], [null, 5_000]]).locked).toBe(false);
    expect(plausible(r(40, 0), r(250, 1_000))).toBe(false);
    expect(plausible(r(10, 0), r(130, 1_000))).toBe(false);
    expect(plausible(r(10, 0), r(60, 1_000))).toBe(true);
  });
});

/* The hook the driver shell mounts (§3.3 D-19, beat 8). On the stage every reading is the truck's speed on the server
 * (`toggles.speed`), so these drive it with `setToggle` and the wall clock. */
describe('useMotionLock on the stage (§3.3 D-19, §8.6 #9, beat 8)', () => {
  const ruptela = { id: 'truck-000003', has_can: true, gnss: 'OK' as const };
  const regis = { id: 'truck-000001', has_can: false, gnss: 'OK' as const };
  const speed = (id: string, kmh: number) => act(() => server.setToggle('speed', { [id]: kmh }));
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  beforeEach(() => { vi.useFakeTimers(); server.reset(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });   // no globals here: Testing Library would not unmount by itself

  it('R+C follows the server: locks after 3 s at 60, swallows every tap, unlocks 3 s after it stops', async () => {
    const { result } = renderHook(() => useMotionLock(ruptela, false));
    const tap = vi.fn();
    await speed(ruptela.id, 60);
    await wait(2_900);
    expect(result.current.locked).toBe(false);
    await wait(100);
    expect(result.current.locked).toBe(true);
    result.current.guard(tap)();
    await speed(ruptela.id, 0);
    await wait(2_900);
    result.current.guard(tap)();
    expect([result.current.locked, tap.mock.calls.length]).toEqual([true, 0]);
    await wait(100);
    expect([result.current.locked, result.current.justUnlocked]).toEqual([false, true]);
    result.current.guard(tap)();
    expect(tap).toHaveBeenCalledTimes(1);
    await wait(5_000);
    expect(result.current.justUnlocked).toBe(false);
  });
  it('RG reads nothing until a tap; a tap at 60 locks and is swallowed; it unlocks 3 s after the speed drops', async () => {
    const { result } = renderHook(() => useMotionLock(regis, false));
    const tap = vi.fn();
    await speed(regis.id, 60);
    await wait(10_000);
    expect(result.current.locked).toBe(false);
    await act(() => result.current.guard(tap)());
    expect([result.current.locked, tap.mock.calls.length]).toEqual([true, 0]);
    await speed(regis.id, 0);
    await wait(2_900);
    expect(result.current.locked).toBe(true);
    await wait(100);
    expect(result.current.locked).toBe(false);
    result.current.guard(tap)();
    expect(tap).toHaveBeenCalledTimes(1);
  });
  it('an R+C truck whose GPS is lost falls back to the RG path, and no truck never locks', async () => {
    const lost = renderHook(() => useMotionLock({ ...ruptela, gnss: 'SUSPECT' }, false));
    const none = renderHook(() => useMotionLock(null, false));
    const tap = vi.fn();
    await speed(ruptela.id, 60);
    await wait(10_000);
    expect([lost.result.current.locked, none.result.current.locked]).toEqual([false, false]);
    none.result.current.guard(tap)();
    await act(() => lost.result.current.guard(tap)());
    expect([lost.result.current.locked, tap.mock.calls.length]).toEqual([true, 1]);
  });
});
