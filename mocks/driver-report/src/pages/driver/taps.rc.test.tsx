// mocks/driver-report/src/pages/driver/taps.rc.test.tsx
/** THE TAP BUDGET OF §3.4, R+C COLUMN — Олег, `device-000002`, the Ruptela truck with CAN.
 *
 *  A second file because `DEVICE_ID` is read once at module init from `window.location.search`
 *  (`src/app/device.ts`), so one test file drives exactly one phone — the same constraint that split
 *  `flows.test.tsx` from `flows.rc.test.tsx` in Wave 2. Everything else is `taps.test.tsx`'s: count every
 *  `user.click` from home to the receipt home renders back.
 *
 *  FOUR R+C CELLS OF §3.4 ARE NOT DRIVEN HERE, and each is a property of the script rather than a gap in the
 *  counting:
 *  - **Arrival, R+C 0 · 0.** There is nothing to tap: the Ruptela IN opens the stop by itself, which is exactly
 *    what «0» means. `HomePage.test.tsx` and `project.test.ts` hold the auto-open.
 *  - **Unloading and Retake, R+C 3 · 1.** Identical screens to the Регіс column, which `taps.test.tsx` drives; the
 *    script gives Олег no beat at which either is still open AND reachable from home (S-24 unloads at 11:08, which
 *    `rebuild(8)` has already applied, and he is sent no retake request).
 *  - **Road stop close, R+C 2 + 0.** The «0» is the point: on CAN the stop closes when the truck moves, with no tap
 *    at all, so there is no click to count. §8.2 D-11 is where that belongs.
 *  - **Deferred drop capture, R+C 2 + 3.** Олег defers nothing in the script.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000002&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { atBeat, renderAt } from '../../test/harness';

afterEach(cleanup);

function budget(name: string, max: number, user: UserEvent) {
  let taps = 0;
  return {
    async tap(match: string | RegExp): Promise<void> {
      taps += 1;
      if (taps > max) throw new Error(`§3.4 «${name}»: tap ${taps} of a budget of ${max} — «${String(match)}»`);
      await user.click(await screen.findByRole('button', { name: match }));
    },
    count: (): number => taps,
  };
}

async function receipt(title: string | RegExp): Promise<void> {
  expect((await screen.findAllByText(title)).length).toBeGreaterThan(0);
}

describe('§3.4 — the Ruptela + CAN column, home to receipt', () => {
  it('start shift: 2 taps, no camera', async () => {
    await atBeat(3);
    server.clock.set(demo('07:20'));
    const { user } = renderAt('/');
    const b = budget('Start shift R+C', 2, user);
    await b.tap('Почати зміну');
    await b.tap('Так, ці');
    expect(screen.queryByRole('button', { name: 'Зняти' })).toBeNull();
    await receipt(/^Зміну почато 07:20 · 241 476 км · CAN/);
    expect(b.count()).toBeLessThanOrEqual(2);
  });

  it('loading, 1 ТТН: 4 taps, 2 photos', async () => {
    await atBeat(6);
    const { user } = renderAt('/');
    const b = budget('Loading, 1 ТТН R+C', 4, user);
    await b.tap(/^Завантажено — фото ТТН/);
    await b.tap('Зняти');
    await b.tap('Зняти');
    await b.tap('Добре, все видно');
    await receipt(/^Завантажено 08:52 · 1 ТТН, 2 стор\./);
    expect(b.count()).toBeLessThanOrEqual(4);
  });

  it('refuel: 3 taps, 1 photo — no dash, because CAN already knows the odometer', async () => {
    await atBeat(8);
    server.clock.set(demo('12:01'));
    const { user } = renderAt('/');
    const b = budget('Refuel R+C', 3, user);
    await b.tap(/^Заправка/);
    await b.tap('Зняти');
    await b.tap('Добре');
    await receipt(/^Заправка 12:01/);
    expect(b.count()).toBeLessThanOrEqual(3);
  });

  it('end shift and confirm: 2 taps, from the card-out card', async () => {
    await atBeat(8);
    server.clock.set(demo('15:06'));
    const { user } = renderAt('/');
    const b = budget('End shift + confirm R+C', 2, user);
    // §3.3 D-14: on R+C the flow IS the done screen, and home offers it through the card-out row.
    await b.tap('Картку вийнято 15:06. Закінчити зміну?');
    expect(screen.queryByRole('button', { name: 'Зняти' })).toBeNull();
    await b.tap(/^Підтверджую/);
    await receipt(/^Зміну закінчено 15:06 · підтверджено/);
    expect(b.count()).toBeLessThanOrEqual(2);
  });

  it('«Мій день»: 1 tap', async () => {
    await atBeat(9);
    const { user, router } = renderAt('/');
    const b = budget('«Мій день» R+C', 1, user);
    await b.tap('Мій день');
    await waitFor(() => { expect(router.state.location.pathname).toBe('/day'); });
    expect(b.count()).toBe(1);
  });
});
