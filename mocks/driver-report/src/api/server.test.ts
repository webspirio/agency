// mocks/driver-report/src/api/server.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demo, kyiv } from '../domain/clock';
import { createServer, inherit, type ServerEvent } from './server';

afterEach(() => vi.restoreAllMocks());

describe('the one server (§7.7)', () => {
  it('holds the seed and a frozen clock at 05:14', () => {
    const s = createServer();
    expect(s.world().trucks.filter((t) => t.pilot)).toHaveLength(3);   // not the fleet count: W0-22 lands in parallel
    expect(s.clock.nowIso()).toBe(kyiv('2026-09-21 05:14'));
    expect(s.clock.frozen()).toBe(true);
  });
  it('runs the stage clock from performance.now and jumps on set', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const s = createServer();
    s.clock.run();
    now.mockReturnValue(61_000);
    expect(s.clock.nowIso()).toBe(kyiv('2026-09-21 05:15'));
    const jumped = vi.fn();
    s.clock.onJump(jumped);
    s.clock.set(demo('08:40'));
    expect(s.clock.nowIso()).toBe(demo('08:40'));
    expect(jumped).toHaveBeenCalledOnce();
  });
  it('mints receipt numbers from the device row, and a reset brings them back', () => {
    const s = createServer();
    expect([s.mintSeq('device-000001'), s.mintSeq('device-000001'), s.mintSeq('device-000002')]).toEqual([417, 418, 388]);
    s.reset();
    expect(s.mintSeq('device-000001')).toBe(417);
  });
  it('clears phones, toggles and script state on reset, and keeps the devices object', () => {
    const s = createServer();
    const devices = s.devices;
    s.phone('device-000001').outbox.push({ key: 'k' } as never);
    s.setToggle('offline', true);
    s.done.push('S-03');
    s.reset();
    expect([s.devices === devices, Object.keys(s.devices), s.toggles.offline, s.done]).toEqual([true, [], false, []]);
  });
  it('emits every write as a changed event and survives a throwing listener', () => {
    const s = createServer();
    const seen: ServerEvent[] = [];
    s.subscribe(() => { throw new Error('dead iframe'); });
    s.subscribe((e) => seen.push(e));
    const actor = { id: 'device-000001', role: 'driver' };
    s.wrote('submitRecord', { actor, now: demo('05:21'), params: {}, body: { key: 'k' } }, { truck_day_id: 'day-1', highlight: true });
    s.wrote('submitRecord', { actor, now: demo('05:22'), params: {}, body: {} }, { truck_day_id: 'day-1' });
    expect(seen.map((e) => e.type === 'changed' && [e.op, e.at, e.highlight, e.replayed])).toEqual([
      ['submitRecord', demo('05:21'), true, false], ['submitRecord', demo('05:22'), false, false]]);
  });
  it('jumps the clock past a throwing jump listener, drops it, and still emits the clock event', () => {
    const s = createServer();
    const seen: ServerEvent[] = [];
    s.subscribe((e) => seen.push(e));
    const dead = vi.fn(() => { throw new Error('dead iframe'); });
    const alive = vi.fn();
    s.clock.onJump(dead);
    s.clock.onJump(alive);
    s.clock.set(demo('08:40'));
    s.clock.set(demo('08:41'));
    expect([dead.mock.calls.length, alive.mock.calls.length, seen, s.clock.nowIso()]).toEqual([
      1, 2, [{ type: 'clock', jumped: true }, { type: 'clock', jumped: true }], demo('08:41')]);
  });
  it('inherits the parent’s server inside a same-origin iframe', () => {
    const parent = createServer();
    const original = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', { value: { __ktlServer: parent }, configurable: true });
    try {
      expect(inherit()).toBe(parent);
    } finally {
      if (original) Object.defineProperty(window, 'parent', original);
    }
    expect(inherit()).toBeNull();
  });
});
