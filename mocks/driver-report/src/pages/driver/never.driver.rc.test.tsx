// mocks/driver-report/src/pages/driver/never.driver.rc.test.tsx
/** THE TWO «MUST NEVER HAPPEN» ROWS THAT ARE PROPERTIES OF A RUPTELA TRUCK — #9 (nothing is reachable while the
 *  truck moves) and #16 (a simulated value never appears without «імітація») — on Олег's `device-000002`.
 *
 *  A second file because `DEVICE_ID` is read once at module init from the URL. `never.driver.test.tsx` is Павло's.
 *
 *  #9 IS MEASURED ON R+C RATHER THAN RG BECAUSE THE TWO LOCKS ARE DIFFERENT MECHANISMS (`src/app/speed.ts`). On a
 *  Регіс truck the speed is read INSIDE `guard()`, so the lock can only appear on a tap — that half is
 *  `lock.test.tsx`, which drives it at beat 8 and asserts the overlay, the `inert` wrapper and the swallowed tap.
 *  On Ruptela + CAN the lock follows the server's speed continuously, with no tap at all, and it is the only half
 *  with a HOLD to measure.
 *
 *  A CORRECTION TO THE PLAN'S OWN LINE, measured: it asks for «beat 6 … after 3 s». At «Такт 6» Олег's loading stop
 *  is OPEN, and between an arrival and the stop's commit `speed.ts` deliberately runs the higher line — 20 km/h held
 *  for TEN seconds, because a truck edges along a queue and a three-second lock over a document flow would be the
 *  bug, not the feature. So the three-second hold is driven where it is real (beat 8, 12:01, no stop open) and the
 *  at-stop hold is driven at beat 6 as its own assertion. Both directions are checked: the lock also LETS GO. */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000002&stage=1'); });
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { atBeat, renderAt } from '../../test/harness';

afterEach(() => {
  cleanup();
  server.setToggle('speed', {});
  server.setToggle('hideSimChips', false);
  vi.useRealTimers();
});

/** Олег's Ruptela truck with CAN, looked up by plate: a store id is an allocation order, not a constant. */
const ruptela = (): string => server.world().trucks.find((t) => t.plate === 'АР 9012 МК')!.id;

const tick = async (ms: number): Promise<void> => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

describe('#9 — nothing on the driver route is reachable while the truck moves', () => {
  it('locks after three seconds over 8 km/h, and lets go three seconds under 3', async () => {
    await atBeat(8);
    server.clock.set(demo('12:01'));                 // between stops: the plain line, 8 km/h held for 3 s
    renderAt('/');
    // Settle the first read on REAL timers, then freeze: `getToday` is a promise chain, and a query that had not
    // resolved before the clock stopped never resolves at all. The node is taken NOW, for the identity check below.
    const under = await screen.findByRole('button', { name: /Закінчити зміну/ });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    act(() => { server.setToggle('speed', { [ruptela()]: 60 }); });
    expect(screen.queryByText('Ви в дорозі')).toBeNull();   // the hold has not run yet
    await tick(3100);
    expect(screen.getByText('Ви в дорозі')).toBeInTheDocument();
    // The screen under it stays MOUNTED — and is out of reach of a tap, the keyboard AND a screen reader, because
    // `DriverShell` wraps it in `inert` + `aria-hidden`. That is why it must be queried by node here and not by
    // role: an `aria-hidden` subtree is not in the accessibility tree, so `getByRole` cannot see it at all. That
    // absence IS §8.6 #9 («any interaction reachable while locked»), so it is asserted rather than worked around.
    expect(under.isConnected).toBe(true);
    expect(under.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Закінчити зміну/ })).toBeNull();

    act(() => { server.setToggle('speed', {}); });
    expect(screen.getByText('Ви в дорозі')).toBeInTheDocument();   // still held: the unlock has its own 3 s
    await tick(3100);
    await waitFor(() => { expect(screen.queryByText('Ви в дорозі')).toBeNull(); });
    // The SAME node, unchanged and reachable again — §8.2 D-19 #2 asks for exactly this, not for a re-mount.
    const after = screen.getByRole('button', { name: /Закінчити зміну/ });
    expect(after).toBe(under);
    expect(after.closest('[inert]')).toBeNull();
  });

  it('holds the higher line at a stop: 60 km/h for three seconds does NOT lock a document flow', async () => {
    await atBeat(6);                                  // the loading stop is open: 20 km/h held for 10 s
    renderAt('/');
    await screen.findByRole('button', { name: /Завантажено — фото ТТН/ });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    act(() => { server.setToggle('speed', { [ruptela()]: 60 }); });
    await tick(3100);
    expect(screen.queryByText('Ви в дорозі')).toBeNull();
    await tick(7100);
    expect(screen.getByText('Ви в дорозі')).toBeInTheDocument();
  });
});

describe('#16 — a simulated value never appears without «імітація»', () => {
  it('marks the stop a Ruptela event opened, and the CAN odometer on the shift start', async () => {
    await atBeat(6);
    const home = renderAt('/');
    // The stop was opened by a Ruptela IN, not by a tap: every fact on that card comes from telemetry.
    expect((await screen.findAllByText('імітація')).length).toBeGreaterThan(0);
    home.unmount();

    await atBeat(3);
    server.clock.set(demo('07:20'));
    renderAt('/shift/start');
    expect(await screen.findByText('Одометр 241 476 км · CAN')).toBeInTheDocument();
    expect(screen.getByText('імітація')).toBeInTheDocument();
  });

  it('is the chip, not the value, that «Сховати позначки «імітація»» removes', async () => {
    await atBeat(3);
    server.clock.set(demo('07:20'));
    server.setToggle('hideSimChips', true);
    renderAt('/shift/start');
    // The FACT is still on screen and still simulated — the presenter hid the label, not the reading (§5.5).
    expect(await screen.findByText('Одометр 241 476 км · CAN')).toBeInTheDocument();
    expect(screen.queryByText('імітація')).toBeNull();
  });
});
