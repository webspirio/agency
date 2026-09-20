// mocks/driver-report/src/pages/driver/never.driver.test.tsx
/** THE «MUST NEVER HAPPEN» ROWS OF §8.6 THAT ONLY A RENDERED DRIVER SCREEN CAN ANSWER — #3 (no UTC on screen),
 *  #11 (no hard block: every «Немає документа» path finishes), #13 (no second record from a double tap), #14's phone
 *  half (no camera and no geolocation is ever asked for) and #24 (no office note reaches the driver).
 *
 *  ONE PHONE PER FILE. `DEVICE_ID` is read once at module init from `window.location.search`, so this file is
 *  Павло's `device-000001` — the Регіс truck and the demo's own flows. The two rows that are properties of a
 *  Ruptela truck, #9 (the motion lock, which on R+C follows the server's speed continuously) and #16 («імітація» on
 *  an AutoEvent-driven StopCard and on the R+C shift start), are in `never.driver.rc.test.tsx`. The same constraint
 *  already split `flows.test.tsx` from `flows.rc.test.tsx` in Wave 2.
 *
 *  Matchers spell group separators U+0020 and `getByRole` name options keep U+00A0 — measured in Waves 1 and 2. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { businessDate, DEMO_DATE, demo } from '../../domain/clock';
import { PAVLO } from '../../domain/script';
import { rewindTo } from '../../stage/runner';
import { atBeat, flushOutbox, renderAt, transportAs } from '../../test/harness';

afterEach(cleanup);

const stopId = (key: string): string => server.world().plannedStops.find((p) => p.plan_key === key)!.id;
const outbox = (): number => server.phone(PAVLO).outbox.length;
const phone = () => transportAs({ id: PAVLO, role: 'driver' }, ['driver']);
/** Павло's records of the DEMO DAY. The seed carries his 15.09 and 18.09 days as history (§7.6), so a whole-history
 *  count would be green over a second record made today. */
const todays = (type: string) => server.world().records
  .filter((r) => r.device_id === PAVLO && r.type === type && businessDate(r.occurred_at) === DEMO_DATE);

/* ── #3 · a UTC time on screen, or "today" from a literal date ────────────────────────────────── */

describe('#3 — the driver never reads a UTC time', () => {
  it('home at 05:21 Kyiv reads 05:2x and never 02:2x', async () => {
    await atBeat(2, { at: demo('05:21') });
    const { container } = renderAt('/');
    await screen.findByText('Одометр 412 355 км · вчора 17:48 · база');
    const text = container.textContent ?? '';
    expect(text).toMatch(/05:2\d/);                 // «останній зв'язок 05:20»
    expect(text).not.toMatch(/\b02:2\d\b/);         // the same instant in UTC
  });
  it('«Мій день» at 06:10 Kyiv reads the shift from 05:20, never 02:20 or 03:10', async () => {
    await atBeat(3);
    const { container } = renderAt('/day');
    expect(await screen.findByText(/На зміні з 05:20/)).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b02:20\b/);
    expect(text).not.toMatch(/\b03:10\b/);
  });
  it('«сьогодні» is the SERVER clock, not the machine’s: beat 10 shows 21.09, not the wall date', async () => {
    await atBeat(10);
    renderAt('/day');
    expect(await screen.findByText(/пн 21\.09/)).toBeInTheDocument();
    // The day after the demo day is in the future and must be unreachable, whatever today's real date is.
    expect(screen.getByRole('button', { name: /вт 22\.09/ })).toBeDisabled();
  });
});

/* ── #11 · a hard block other than a missing required photo, and even that answerable ──────────── */

/** The four reasons of a loading's «Немає документа» and the five of a signed ТТН (`NoDocumentPage`, §3.3 D-06). */
const LOADING_REASONS = ['ТТН ще друкують', 'Відправник не дав ТТН', 'Електронна ТТН', 'Подзвоніть мені'] as const;
const SIGNED_REASONS = ['Одержувач не підписує', 'ТТН лишилась у одержувача', 'Підпишуть пізніше',
  'Електронна ТТН', 'Подзвоніть мені'] as const;

describe('#11 — every «Немає документа» path finishes the flow', () => {
  it.each(LOADING_REASONS)('a loading answered «%s» leaves the driver on home with the record made', async (word) => {
    await atBeat(4);
    const before = outbox();
    const { user, router } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    await user.click(await screen.findByRole('button', { name: 'Немає документа' }));
    await user.click(await screen.findByRole('button', { name: word }));
    // «Відправник не дав ТТН» is the one row that warns first: 17 000 ₴ is the driver's own money (§3.3 D-06).
    if (word === 'Відправник не дав ТТН') {
      expect(await screen.findByText(/Без ТТН не виїжджайте — за це штраф 17 000 грн/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Записати без ТТН' }));
    }
    await waitFor(() => { expect(router.state.location.pathname).toBe('/'); });
    // «ТТН ще друкують» commits nothing on purpose — it keeps the draft, and home pins it (Wave 2 preamble).
    if (word === 'ТТН ще друкують') {
      expect(await screen.findByText('ТТН ще друкують — сфотографуйте, щойно дадуть')).toBeInTheDocument();
      expect(outbox()).toBe(before);
    } else {
      expect(outbox()).toBe(before + 1);
      expect(server.phone(PAVLO).outbox.at(-1)!.record.type).toBe('LOADED');
    }
  });

  it.each(SIGNED_REASONS)('an unloading answered «%s» leaves the driver on home with the record made', async (word) => {
    await atBeat(8);
    const before = outbox();
    const { user, router } = renderAt(`/stop/${stopId('3312-2')}/unloaded`);
    await user.click(await screen.findByRole('button', { name: 'Немає документа' }));
    await user.click(await screen.findByRole('button', { name: word }));
    await waitFor(() => { expect(router.state.location.pathname).toBe('/'); });
    expect(outbox()).toBe(before + 1);
    expect(server.phone(PAVLO).outbox.at(-1)!.record.type).toBe('UNLOADED');
  });

  it('no driver screen ever refuses: not one of the nine paths said «помилк»', async () => {
    await atBeat(4);
    const { user, container } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    await user.click(await screen.findByRole('button', { name: 'Немає документа' }));
    expect(container.textContent?.toLowerCase()).not.toContain('помилк');
    expect(container.textContent).toContain('Чому немає документа?');
  });
});

/* ── #13 · a second record, number or batch from a double tap ──────────────────────────────────── */

/** TWO TAPS INSIDE ONE REACT BATCH — the EC-137 shape, and the only shape that measures anything here.
 *
 *  `user.dblClick` does NOT measure it: the first click commits and navigates, the node detaches, and React's root
 *  delegation never sees the second. MEASURED IN THIS TASK — with `useCommitOnce`'s `if (fired.current) return`
 *  deleted AND `PrimaryAction`'s busy gate (`aria-disabled` + `pointer-events-none`) deleted, every `dblClick`
 *  assertion below stayed GREEN. A check that cannot fail is the thing this file exists to prevent.
 *
 *  Both `click()`s are dispatched inside ONE `act`, so both handlers run against the same render — which is what a
 *  50 ms double tap on a cold phone does — and only a commit guard can swallow the second.
 *
 *  WHAT THIS FILE MEASURED ABOUT THOSE GUARDS, by deleting them one at a time and re-running:
 *   1. `PrimaryAction`'s busy gate (`aria-disabled` + `pointer-events-none`) — removing it alone changes nothing.
 *   2. `useCommitOnce`'s `if (fired.current) return` — the same.
 *   3. `flow.commit`'s `drafts[draftId] === undefined` return — with all three gone, «Підтверджую», «Закінчилось»
 *      and the preset reply each file TWO records, and the three assertions below go red.
 *   4. `enqueue`'s «one key, one entry, however often a commit fires (EC-137)» — «Так, 412 355» and
 *      «Добре, все видно» stay green even with 1–3 removed, because a flow's record carries the DRAFT'S key and
 *      its seq was minted once. That is the guard §8.6 #13 actually names, and it is the one a UI change cannot
 *      evade; the three above it are what keep the button from looking unpressed while the commit runs. */
async function tapTwice(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
    el.click();
  });
}

describe('#13 — a double tap is one record, never two', () => {
  it('«Так, 412 355» twice ends one shift start', async () => {
    await atBeat(2);
    const before = outbox();
    const { user } = renderAt('/shift/start');
    await user.click(await screen.findByRole('button', { name: 'Так, ці' }));
    await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await tapTwice(await screen.findByRole('button', { name: 'Так, 412 355' }));
    await waitFor(() => { expect(outbox()).toBe(before + 1); });
    expect(outbox()).toBe(before + 1);
  });

  it('«Добре, все видно» twice files one loading', async () => {
    await atBeat(4);
    const before = outbox();
    const { user } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    for (let i = 0; i < 4; i += 1) await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await tapTwice(await screen.findByRole('button', { name: 'Добре, все видно' }));
    await waitFor(() => { expect(outbox()).toBe(before + 1); });
    expect(outbox()).toBe(before + 1);
  });

  it('«Підтверджую» twice attests one day', async () => {
    await atBeat(9);
    const { user } = renderAt('/shift/end');
    await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await user.click(await screen.findByRole('button', { name: 'Так, 412 589' }));
    const before = outbox();
    await tapTwice(await screen.findByRole('button', { name: /^Підтверджую/ }));
    await waitFor(() => { expect(outbox()).toBe(before + 1); });
    await flushOutbox(PAVLO);
    // TODAY's, not the device's whole history: the seed carries Павло's attested days of 15.09 and 18.09 (§7.6).
    expect(todays('DRIVER_ATTESTED')).toHaveLength(1);
  });

  it('«Закінчилось» twice closes one road stop', async () => {
    await atBeat(8);
    await rewindTo(demo('12:29'));
    server.clock.set(demo('12:30'));
    const first = renderAt('/stand');
    await first.user.click(await screen.findByRole('button', { name: 'Тривога / укриття' }));
    await waitFor(() => { expect(first.router.state.location.pathname).toBe('/'); });
    await flushOutbox(PAVLO);
    first.unmount();

    server.clock.set(demo('12:48'));
    renderAt('/');
    const before = outbox();
    await tapTwice(await screen.findByRole('button', { name: 'Закінчилось' }));
    await waitFor(() => { expect(outbox()).toBe(before + 1); });
    await flushOutbox(PAVLO);
    expect(todays('ROAD_STOP_END')).toHaveLength(1);
  });

  it('a preset reply twice answers one request', async () => {
    await atBeat(5);
    const loaded = server.scriptRefs['S-10']!;
    const req = await call(transportAs({ id: 'user-natalia', role: 'operator' }, ['dispatcher']), 'createRequest',
      { params: {}, body: { type: 'RETAKE_PHOTO', record_key: loaded, page_key: `${loaded}:p4`, reasons: ['BLUR'] } });
    renderAt('/requests');
    const reply = await screen.findByRole('button', { name: 'Зроблю на зупинці' });
    const before = outbox();
    await tapTwice(reply);
    await waitFor(() => { expect(outbox()).toBe(before + 1); });
    await flushOutbox(PAVLO);
    expect(todays('REQUEST_REPLY')).toHaveLength(1);
    expect(req.id).not.toBe('');
  });
});

/* ── #14 (phone half) · no camera, no permission prompt, no geolocation ────────────────────────── */

describe('#14 — the phone never asks the device for anything, through a whole flow', () => {
  const gum = vi.fn();
  const current = vi.fn();
  const watch = vi.fn();

  beforeEach(() => {
    gum.mockReset();
    current.mockReset();
    watch.mockReset();
    // A DEFINED spy, not an absent API: `chooseEngine()` must pick DRAWN because the page is on the stage, not
    // because there was no camera to find. With these in place a wrong engine would call one of them and be caught.
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
    Object.defineProperty(navigator, 'geolocation',
      { value: { getCurrentPosition: current, watchPosition: watch, clearWatch: vi.fn() }, configurable: true });
  });

  const silent = (): void => {
    expect(gum).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
  };

  it('the shift start runs to its receipt without touching either API', async () => {
    await atBeat(2);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Почати зміну' }));
    await user.click(await screen.findByRole('button', { name: 'Так, ці' }));
    await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await user.click(await screen.findByRole('button', { name: 'Так, 412 355' }));
    expect(await screen.findByText('Зміну почато 05:20 · 412 355 км')).toBeInTheDocument();
    silent();
  });

  it('the loading runs to its receipt without touching either API', async () => {
    await atBeat(4);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: /^Завантажено — фото ТТН/ }));
    for (let i = 0; i < 4; i += 1) await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await user.click(await screen.findByRole('button', { name: 'Добре, все видно' }));
    expect(await screen.findByText('Завантажено 08:40 · 2 ТТН, 4 стор.')).toBeInTheDocument();
    silent();
  });

  it('the refuel runs to its receipt without touching either API', async () => {
    await atBeat(7);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: /^Заправка/ }));
    await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await user.click(await screen.findByRole('button', { name: 'Добре' }));
    await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await user.click(await screen.findByRole('button', { name: 'Так, 412 398' }));
    expect(await screen.findByText('Заправка 08:57 · 412 398 км')).toBeInTheDocument();
    silent();
  });
});

/* ── #24 · an office-only note or the blunt fuel line reaching the driver ──────────────────────── */

describe('#24 — nothing the office writes for itself reaches the driver', () => {
  it.each([5, 10, 12])('no driver response at beat %i carries «злив» or a note', async (beat) => {
    await atBeat(beat);
    const t = phone();
    const bodies = [
      await call(t, 'getToday', { params: {}, body: undefined }),
      await call(t, 'getMyDay', { params: { date: '2026-09-21' }, body: undefined }),
      await call(t, 'getMyMonth', { params: { month: '2026-09' }, body: undefined }),
      await call(t, 'listNearbyPlaces', { params: {}, body: undefined, qry: { page: '1', limit: '100' } }),
    ];
    const json = JSON.stringify(bodies);
    expect(json.toLowerCase()).not.toContain('злив');
    // A `note` KEY, not the word: the office's own sentence rides on a field named exactly that (§8.6 #24).
    expect(json).not.toMatch(/"note"\s*:/);
    expect(json.length).toBeGreaterThan(100);       // the matcher must still have had something to read
  });
});
