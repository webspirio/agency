// mocks/driver-report/src/pages/driver/taps.test.tsx
/** THE TAP BUDGET OF §3.4, DRIVEN THROUGH THE DOM — the Регіс column (Павло, `device-000001`).
 *
 *  Every other flow test in this tree mounts the flow's own route and counts from there. That is what the Wave 2
 *  parallel rule allowed and it leaves out the two taps that matter most: the one on HOME that opens the flow, and
 *  the receipt home renders when the flow comes back. §3.4 counts «from home to the receipt», so every drive below
 *  STARTS on home's primary, tile, quiet link or pinned card and ENDS on home's own `ReceiptCard` — its title and its
 *  «Далі: …» line, read off the screen rather than off `server.phone(…).outbox`.
 *
 *  WHY THE R+C COLUMN IS A SECOND FILE. `DEVICE_ID` is read once, at module init, from `window.location.search`
 *  (`src/app/device.ts`), so the phone a test file drives is fixed for the whole file — the same reason the Wave 2
 *  tests split into `flows.test.tsx` and `flows.rc.test.tsx`. The R+C budgets live in `taps.rc.test.tsx` and the
 *  bind budget, which is Григорій's phone, in `taps.bind.test.tsx`.
 *
 *  WHAT A TAP IS: one `user.click`. The shutter counts, «Добре» counts, and so does the tap on home that opened the
 *  flow. `flow()` throws the moment the count passes the budget, naming the flow, so a regression fails with the
 *  row of §3.4 it broke rather than with a missing element three screens later.
 *
 *  The matchers spell every group separator U+0020 while the SCREEN keeps its U+00A0: Testing Library normalises a
 *  node's U+00A0 to a space and never touches the matcher — except in a `getByRole` NAME option, which is not
 *  normalised that way, so those keep the U+00A0. Measured in Waves 1 and 2; fix the matcher, never the copy. */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { NATALIA, PAVLO } from '../../domain/script';
import { rewindTo } from '../../stage/runner';
import { atBeat, flushOutbox, renderAt, transportAs } from '../../test/harness';

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms and one drive's
// home screen would still be mounted under the next one's (measured in Wave 1: one false green, one false red).
afterEach(cleanup);

/** One drive: a tap counter bound to a budget, so going over fails HERE and says which row of §3.4 it was. */
function budget(name: string, max: number, user: UserEvent) {
  let taps = 0;
  return {
    /** Taps a control by its accessible name, waiting for it to appear. */
    async tap(match: string | RegExp): Promise<void> {
      taps += 1;
      if (taps > max) throw new Error(`§3.4 «${name}»: tap ${taps} of a budget of ${max} — «${String(match)}»`);
      await user.click(await screen.findByRole('button', { name: match }));
    },
    count: (): number => taps,
  };
}

/** Home's receipt of what was just recorded (§3.3 D-02): the title and the «Далі: …» line, as rendered. */
async function receipt(title: string | RegExp, next: string | null): Promise<void> {
  const found = await screen.findAllByText(title);
  expect(found.length).toBeGreaterThan(0);
  if (next !== null) expect(await screen.findByText(next)).toBeInTheDocument();
}

describe('§3.4 — the Регіс column, home to receipt', () => {
  it('start shift: 4 taps, 1 photo', async () => {
    await atBeat(2);
    const { user } = renderAt('/');
    const b = budget('Start shift RG', 4, user);
    await b.tap('Почати зміну');
    await b.tap('Так, ці');
    await b.tap('Зняти');
    await b.tap('Так, 412 355');
    await receipt('Зміну почато 05:20 · 412 355 км', 'Далі: завантаження — Дніпро-Корм, Вільнянськ');
    expect(b.count()).toBeLessThanOrEqual(4);
  });

  it('arrival: 4 taps, 1 photo', async () => {
    await atBeat(3);
    const { user } = renderAt('/');
    const b = budget('Arrival RG', 4, user);
    await b.tap(/^Я на місці/);
    await b.tap('Черга');
    await b.tap('Зняти');
    await b.tap('Так, 412 391');
    await receipt('На місці 06:10 · 412 391 км', null);
    expect(b.count()).toBeLessThanOrEqual(4);
  });

  it('arrival at a no-photo place: 2 taps, 0 photos', async () => {
    await atBeat(8);
    await rewindTo(demo('13:44'));                 // S-26 unloads «Злагода» at 11:50: «Лан» is the next stop
    server.clock.set(demo('13:45'));
    const { user } = renderAt('/');
    const b = budget('Arrival, no-photo place', 2, user);
    await b.tap(/^Я на місці/);
    await b.tap('Черга');
    expect(screen.queryByRole('button', { name: 'Зняти' })).toBeNull();
    await receipt(/^На місці 13:45/, null);
    expect(b.count()).toBeLessThanOrEqual(2);
  });

  it('loading, 2 ТТН: 6 taps, 4 photos', async () => {
    await atBeat(4);
    const { user } = renderAt('/');
    const b = budget('Loading, 2 ТТН', 6, user);
    await b.tap(/^Завантажено — фото ТТН/);
    for (let i = 0; i < 4; i += 1) await b.tap('Зняти');
    await b.tap('Добре, все видно');
    await receipt('Завантажено 08:40 · 2 ТТН, 4 стор.',
      'Далі: вивантаження 1 з 2 — Злагода, Синельникове · Відсіки 1–3 · ТТН 004517');
    expect(b.count()).toBeLessThanOrEqual(6);
  });

  it('retake: 3 taps, 1 photo', async () => {
    await atBeat(5);
    const loaded = server.scriptRefs['S-10']!;
    await call(transportAs(NATALIA, ['dispatcher']), 'createRequest', { params: {}, body: {
      type: 'RETAKE_PHOTO', record_key: loaded, page_key: `${loaded}:p4`, reasons: ['BLUR'] } });
    const { user } = renderAt('/');
    const b = budget('Retake', 3, user);
    // The pinned card of §8.2 D-01 #5, end to end: the whole sentence is one node, so the name matches it whole.
    await b.tap(/^Потрібно від вас \(1\) · Диспетчер просить перезняти: ТТН 2 з 2, зворотний бік — розмито$/);
    await b.tap('Зняти');
    await b.tap('Добре');
    await receipt('Фото замінено · ТТН 2 з 2, зворотний бік', null);
    expect(b.count()).toBeLessThanOrEqual(3);
  });

  it('refuel: 5 taps, 2 photos', async () => {
    await atBeat(7);
    const { user } = renderAt('/');
    const b = budget('Refuel RG', 5, user);
    await b.tap(/^Заправка/);
    await b.tap('Зняти');
    await b.tap('Добре');
    await b.tap('Зняти');
    await b.tap('Так, 412 398');
    await receipt('Заправка 08:57 · 412 398 км', null);
    expect(b.count()).toBeLessThanOrEqual(5);
  });

  it('unloading: 3 taps, 1 photo', async () => {
    await atBeat(8);
    const { user } = renderAt('/');
    const b = budget('Unloading', 3, user);
    await b.tap(/^Вивантажено — фото ТТН з підписом/);
    await b.tap('Зняти');
    await b.tap('Добре');
    await receipt('Вивантаження 1 з 2 · 11:50 · ТТН 004517', null);
    expect(b.count()).toBeLessThanOrEqual(3);
  });

  it('road stop and its close: 2 taps, then 1', async () => {
    await atBeat(8);
    await rewindTo(demo('12:29'));                 // «Злагода» is unloaded, so this is a ROAD stop, not a segment
    server.clock.set(demo('12:30'));
    const { user } = renderAt('/');
    const open = budget('Road stop', 2, user);
    await open.tap(/^Стою/);
    await open.tap('Тривога / укриття');
    // Mode D renders this sentence twice by design — the RoadStopCard's own heading and the receipt's title
    // (measured in W2-01's `HomePage.test.tsx`), so the receipt is read as a pair rather than as a single match.
    await receipt('Тривога · з 12:30', null);
    expect(open.count()).toBeLessThanOrEqual(2);

    server.clock.set(demo('12:48'));
    const close = budget('Road stop close', 1, user);
    await close.tap('Закінчилось');
    await receipt('Тривога 12:30–12:48 · 18 хв', null);
    expect(close.count()).toBeLessThanOrEqual(1);
  });

  it('deferred drop capture: 2 taps to defer, then 5 to settle it', async () => {
    await atBeat(8);
    await rewindTo(demo('15:07'));                 // Павло has stood at «Лан» since 13:45 and has not unloaded
    server.clock.set(demo('15:08'));
    const first = renderAt('/');
    const defer = budget('Deferred drop, defer', 2, first.user);
    await defer.tap(/^Вивантажено — фото ТТН з підписом/);
    await defer.tap('Зніму після виїзду');
    await receipt('Вивантаження 2 з 2 · 15:08 · фото — після виїзду', null);
    expect(defer.count()).toBeLessThanOrEqual(2);
    // Not a tap: the phone delivering what it already recorded. The pinned card is drawn from `DriverToday.records`
    // — the office's answer — so until the outbox has run there is nothing for home to pin.
    await flushOutbox(PAVLO);
    first.unmount();

    server.clock.set(demo('15:17'));
    const { user } = renderAt('/');
    const settle = budget('Deferred drop, capture', 5, user);
    // The pinned card §8.2 asks for by name, once the deferral has been committed.
    await settle.tap('Потрібно від вас: фото ТТН з підписом і щитка — Лан');
    await settle.tap('Зняти');
    await settle.tap('Добре');
    await settle.tap('Зняти');
    await settle.tap(/^5 — 412 566/);
    await receipt('Фото додано 15:17 · ТТН 004518 · 412 566 км', null);
    expect(settle.count()).toBeLessThanOrEqual(5);
  });

  it('end shift and confirm: 4 taps, 1 photo', async () => {
    await atBeat(9);
    const { user } = renderAt('/');
    const b = budget('End shift + confirm', 4, user);
    await b.tap(/^Закінчити зміну/);
    await b.tap('Зняти');
    await b.tap('Так, 412 589');
    await b.tap(/^Підтверджую/);
    await receipt('Зміну закінчено 16:02 · підтверджено', null);
    expect(b.count()).toBeLessThanOrEqual(4);
  });

  it('«Мій день»: 1 tap', async () => {
    await atBeat(10);
    const { user, router } = renderAt('/');
    const b = budget('«Мій день»', 1, user);
    await b.tap('Мій день');
    await waitFor(() => { expect(router.state.location.pathname).toBe('/day'); });
    expect(await screen.findByText('06:10 Вільнянськ · завантаження')).toBeInTheDocument();
    expect(b.count()).toBe(1);
  });
});

describe('§8.2 D-01 #5 — the pinned cards each flow leaves behind, on home', () => {
  it('«Зніму пізніше» on a refuel pins the receipt it still owes', async () => {
    await atBeat(7);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: /^Заправка/ }));
    await user.click(await screen.findByRole('button', { name: 'Зніму пізніше' }));
    expect(await screen.findByText('Потрібно від вас: чек із заправки 08:57')).toBeInTheDocument();
  });

  it('mode D reads «Тривога · з 12:30» after «Стою»', async () => {
    await atBeat(8);
    await rewindTo(demo('12:29'));
    server.clock.set(demo('12:30'));
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: /^Стою/ }));
    await user.click(await screen.findByRole('button', { name: 'Тривога / укриття' }));
    expect(await screen.findByRole('heading', { name: 'Тривога · з 12:30' })).toBeInTheDocument();
  });

  it('«Що бачить офіс — прочитайте один раз» is what «Так, це я» leaves on a fresh phone', async () => {
    // Павло's device was bound long ago and has read it (`seen_examples` / `office_sees_read` in the seed), so the
    // row cannot appear for him. Григорій's bind is the drive; this asserts the LINK the card opens is a route of
    // this phone too, and `taps.bind.test.tsx` drives the card itself on the phone that has never read it.
    await atBeat(10);
    renderAt('/office-sees');
    expect(await screen.findByText('Що йде в офіс')).toBeInTheDocument();
  });
});
