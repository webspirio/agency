// mocks/driver-report/src/pages/office/never.office.test.tsx
/** THE «MUST NEVER HAPPEN» ROWS OF §8.6 THAT ONLY THE CONSOLE CAN ANSWER — #13 (no second audit row, request,
 *  correction, number, receipt or code from a double click), #16 (no simulated value without «імітація», no seeded
 *  fleet row without «приклад») and #27 (no console row that fails to move after a driver's tap).
 *
 *  #27 is driven the way the demo drives it: the phone's write goes through `transportAs`, which is a client over
 *  the SAME route table the console reads, so what the assertion measures is the live path — a server event, an
 *  invalidation and a re-render — and not a re-mount with fresh data. The 500 ms is `findBy`'s own timeout, set
 *  explicitly so a slower path is a FAILURE rather than a pass at 900 ms. */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { toast } from '@agency/kit/toast';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { buildRecord } from '../../app/records';
import { demo } from '../../domain/clock';
import { HRYHORII, NATALIA, OLEH, PAVLO } from '../../domain/script';
import { atBeat, renderAt, transportAs } from '../../test/harness';

beforeAll(() => { URL.createObjectURL = vi.fn(() => 'blob:mock'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => {
  cleanup();
  // The kit's toast store is MODULE-GLOBAL and outlives `cleanup` (measured in W2-08), so a toast raised here would
  // still be on screen for the next test's assertions.
  toast.dismiss();
});

const width = (w: number): void => act(() => { window.innerWidth = w; window.dispatchEvent(new Event('resize')); });

/** TWO CLICKS INSIDE ONE REACT BATCH — the EC-137 shape §8.6 #13 names («clicked twice within 50 ms»).
 *  `user.dblClick` cannot measure it: the first click commits, the control is replaced or the route changes, and
 *  React's root delegation never sees the second. MEASURED on the driver route in this same task, where every
 *  `dblClick` assertion stayed green with THREE separate commit guards deleted. Both `click()`s here run against
 *  the same render, so only a guard that does not wait for a re-render can stop the second. */
async function clickTwice(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
    el.click();
  });
}

const world = () => server.world();
const stopId = (key: string): string => world().plannedStops.find((p) => p.plan_key === key)!.id;
const dayId = (plate: string, date: string): string => {
  const t = world().trucks.find((x) => x.plate === plate)!;
  return world().truckDays.find((d) => d.truck_id === t.id && d.date === date)!.id;
};
const office = () => transportAs(NATALIA, ['dispatcher']);
const phoneOf = (device: string) => transportAs({ id: device, role: 'driver' }, ['driver']);

/* ── #13 · a second record, number or batch from a double click ────────────────────────────────── */

describe('#13 — a double click on a console commit writes one row, never two', () => {
  it('«Прийняти друковані» twice leaves one audit line and one version', async () => {
    width(1440);
    await atBeat(5);
    const before = world().audit.length;
    const day = world().plannedStops.find((p) => p.plan_key === '3312-1')!;
    renderAt(`/stop/${stopId('3312-1')}`);
    const accept = await screen.findByRole('button', { name: /Прийняти друковані/ });
    await clickTwice(accept);
    await waitFor(() => { expect(world().audit.length).toBe(before + 1); });
    expect(world().audit.length).toBe(before + 1);
    expect(day.id).not.toBe('');
  });

  it('«Прийняти зупинку» twice accepts the stop once', async () => {
    width(1440);
    await atBeat(5);
    const before = world().audit.length;
    renderAt(`/stop/${stopId('3312-1')}`);
    const accept = await screen.findByRole('button', { name: 'Прийняти зупинку' });
    await clickTwice(accept);
    await waitFor(() => { expect(world().audit.length).toBe(before + 1); });
    expect(world().audit.length).toBe(before + 1);
    expect(await screen.findByText(/Зупинку прийняла Н\. Шевчук/)).toBeInTheDocument();
  });

  it('«Надіслати водію» twice raises one request', async () => {
    width(1440);
    await atBeat(5);
    const before = world().requests.length;
    const { user } = renderAt(`/stop/${stopId('3312-1')}`);
    await user.click((await screen.findAllByRole('button', { name: 'Попросити перезняти' }))[3]!);
    await user.click(screen.getByRole('button', { name: 'Розмито' }));
    await clickTwice(screen.getByRole('button', { name: 'Надіслати водію' }));
    await waitFor(() => { expect(world().requests.length).toBe(before + 1); });
    expect(world().requests.length).toBe(before + 1);
  });

  it('«Зберегти виправлення» twice files one correction', async () => {
    width(1440);
    await atBeat(10);
    const before = world().corrections.length;
    const { user } = renderAt('/inbox/review');
    await user.click(await screen.findByRole('button', { name: 'Виправити' }));
    await screen.findByText('Виправити одометр · початок зміни');
    await user.click(screen.getByRole('button', { name: /Одрук|друк|Помилка набору|Друкарська/ }));
    await clickTwice(screen.getByRole('button', { name: 'Зберегти виправлення' }));
    await waitFor(() => { expect(world().corrections.length).toBe(before + 1); });
    expect(world().corrections.length).toBe(before + 1);
  });

  it('«Підтвердити день» twice stamps one waybill number', async () => {
    width(1440);
    await atBeat(10, { at: demo('16:06') });
    renderAt(`/day/${dayId('АР 1234 ВС', '2026-09-21')}`);
    await clickTwice(await screen.findByRole('button', { name: 'Підтвердити день' }));
    expect(await screen.findByText('Подорожній лист № ПЛ-000412 від 21.09.2026')).toBeInTheDocument();
    expect(world().truckDays.filter((d) => d.waybill_no === 'ПЛ-000412')).toHaveLength(1);
    expect(world().truckDays.filter((d) => d.waybill_no === 'ПЛ-000413')).toHaveLength(0);
  });

  it('«Оригінал отримано» twice marks one receipt, at one moment', async () => {
    width(1440);
    await atBeat(11, { at: demo('16:15') });
    server.setUi({ scope: 'PILOT' });
    const marked = (): { id: string; at: string }[] => world().ttnDocs
      .filter((d) => d.original !== null).map((d) => ({ id: d.id, at: d.original!.received_at }));
    const before = marked();
    renderAt('/originals');
    await screen.findByText(/Кравчук О\./);
    await clickTwice(screen.getAllByRole('button', { name: 'Оригінал отримано' })[0]!);
    expect(await screen.findByText(/отримано 16:15 · Н\. Шевчук/)).toBeInTheDocument();
    const after = marked();
    expect(after.length).toBe(before.length + 1);
    // The MOMENT, not just the count: `receiveOriginal` keeps the first mark by design («A second mark keeps the
    // first»), so a second write would be invisible in a count and would still move the receipt's time.
    const fresh = after.find((d) => !before.some((b) => b.id === d.id))!;
    expect(fresh.at).toBe(demo('16:15'));
  });

  it('«Підключити телефон» twice mints one code', async () => {
    width(1440);
    await atBeat(1);
    const before = world().bindCodes.length;
    const driverId = world().drivers.find((d) => d.tab_no === '0457')!.id;
    renderAt(`/drivers?open=${driverId}`);
    await clickTwice(await screen.findByRole('button', { name: 'Підключити телефон' }));
    await waitFor(() => { expect(world().bindCodes.length).toBe(before + 1); });
    expect(world().bindCodes.length).toBe(before + 1);
  });
});

/* ── #16 · a simulated value without «імітація», a seeded row without «приклад» ────────────────── */

describe('#16 — the console labels every value it did not get from a driver', () => {
  it('marks Олег’s Ruptela truck «імітація» on the board, and the whole example fleet «приклад»', async () => {
    width(1440);
    await atBeat(10);
    renderAt('/');
    const table = await screen.findByRole('table');
    await waitFor(() => { expect(within(table).getAllByRole('button').length).toBeGreaterThanOrEqual(100); });
    // The VIEW MODEL first: the flag is what the chip renders from, so an unflagged row would be silent.
    const fleet = await call(office(), 'listFleet', { params: {}, body: undefined,
      qry: { scope: 'FLEET', filter: 'ALL', page: '1', limit: '100' } });
    const oleh = fleet.data.filter((r) => r.plate === 'АР 9012 МК');
    expect(oleh.length).toBeGreaterThan(0);
    expect(oleh.every((r) => r.simulated)).toBe(true);
    const examples = fleet.data.filter((r) => r.example);
    expect(examples.length).toBeGreaterThan(0);
    // Then the RENDERING of both flags.
    const row = within(table).getByRole('button', { name: /АР 9012 МК/ });
    expect(within(row).getByText('імітація')).toBeInTheDocument();
    expect(within(table).getAllByText('приклад').length).toBeGreaterThanOrEqual(examples.length);
  });

  it('is the chip that «Сховати позначки «імітація»» hides, never the value', async () => {
    width(1440);
    await atBeat(10);
    server.setToggle('hideSimChips', true);
    renderAt('/');
    const table = await screen.findByRole('table');
    const row = await within(table).findByRole('button', { name: /АР 9012 МК/ });
    expect(within(row).queryByText('імітація')).toBeNull();
    expect(row).toBeInTheDocument();
    server.setToggle('hideSimChips', false);
  });
});

/* ── #27 · a console row that does not move after a driver tap ─────────────────────────────────── */

/** The first live action of each beat, as the phone performs it, and what the console must say within 500 ms. */
const LIVE: readonly { beat: number; at: string; go: () => Promise<unknown>; says: RegExp }[] = [
  { beat: 2, at: '05:21', says: /На зміні · 0:0\d/, go: async () => {
    const truck = server.world().trucks.find((t) => t.plate === 'АР 1234 ВС')!;
    return call(phoneOf(PAVLO), 'submitRecord', { params: {}, body: buildRecord(
      { deviceId: PAVLO, seq: server.mintSeq(PAVLO), occurredAt: demo('05:20'), committedAt: demo('05:21') },
      'SHIFT_START', { truck_id: truck.id, trailer_id: truck.trailer_id, plan_match: true, inline: null,
        odometer: { value: 412355, source: 'DASH_PHOTO', basis: 'LAST_AT_BASE', expected: 412355, read: 412355,
          choice: 'CONFIRMED', page_key: null } }) });
  } },
  { beat: 3, at: '06:10', says: /У черзі на завантаження/, go: async () => call(phoneOf(PAVLO), 'submitRecord',
    { params: {}, body: buildRecord({ deviceId: PAVLO, seq: server.mintSeq(PAVLO), occurredAt: demo('06:10'),
      committedAt: demo('06:10'), stopId: server.world().plannedStops.find((p) => p.plan_key === '3312-1')!.id },
    'ARRIVED', { order: 'PLANNED', claimed_at: null, chip: 'QUEUE', odometer: null, unplanned_kind: null,
      new_place: false }) }) },
  { beat: 4, at: '08:40', says: /щойно · 08:40/, go: async () => call(phoneOf(PAVLO), 'submitRecord',
    { params: {}, body: buildRecord({ deviceId: PAVLO, seq: server.mintSeq(PAVLO), occurredAt: demo('08:40'),
      committedAt: demo('08:40'), stopId: server.world().plannedStops.find((p) => p.plan_key === '3312-1')!.id },
    'LOADED', { ttn_count: 2, pages: [], no_doc_reason: null, deferred: null }) }) },
  { beat: 6, at: '08:52', says: /щойно · 08:52/, go: async () => call(phoneOf(OLEH), 'submitRecord',
    { params: {}, body: buildRecord({ deviceId: OLEH, seq: server.mintSeq(OLEH), occurredAt: demo('08:52'),
      committedAt: demo('08:52'), stopId: server.world().plannedStops.find((p) => p.plan_key === '3313-1')!.id },
    'LOADED', { ttn_count: 1, pages: [], no_doc_reason: null, deferred: null }) }) },
  { beat: 7, at: '08:57', says: /щойно · 08:57/, go: async () => call(phoneOf(PAVLO), 'submitRecord',
    { params: {}, body: buildRecord({ deviceId: PAVLO, seq: server.mintSeq(PAVLO), occurredAt: demo('08:57'),
      committedAt: demo('08:57') }, 'CALL_ME', {}) }) },
  { beat: 8, at: '12:30', says: /щойно · 12:30/, go: async () => call(phoneOf(PAVLO), 'submitRecord',
    { params: {}, body: buildRecord({ deviceId: PAVLO, seq: server.mintSeq(PAVLO), occurredAt: demo('12:30'),
      committedAt: demo('12:30') }, 'ROAD_STOP', { reason: 'ALERT', can_drive: null }) }) },
  { beat: 9, at: '16:02', says: /щойно · 16:02/, go: async () => call(phoneOf(HRYHORII), 'submitRecord',
    { params: {}, body: buildRecord({ deviceId: HRYHORII, seq: server.mintSeq(HRYHORII), occurredAt: demo('16:02'),
      committedAt: demo('16:02') }, 'CALL_ME', {}) }) },
];

describe('#27 — the console moves within half a second of the driver’s tap', () => {
  it.each(LIVE)('beat $beat: the board says it by $at', async ({ beat, at, go, says }) => {
    width(1440);
    await atBeat(beat);
    server.setUi({ scope: 'PILOT' });
    server.clock.set(demo(at));
    renderAt('/');
    await screen.findByRole('table');
    await go();
    // 500 ms EXACTLY, so a slower path fails instead of passing at `findBy`'s 1 000 ms default.
    expect(await screen.findByText(says, undefined, { timeout: 500 })).toBeInTheDocument();
  });

  it('beat 6: the sidebar’s «Перевірка» count moves too', async () => {
    width(1440);
    await atBeat(6);
    server.setUi({ scope: 'PILOT' });
    const { container } = renderAt('/');
    const sidebar = async (): Promise<string> => {
      const nav = await screen.findByRole('navigation');
      return nav.textContent ?? '';
    };
    // The counts load after the chrome, so the FIRST reading is waited for too — otherwise this reads the nav's
    // pre-load zeros and the assertion below would be measuring a load rather than a live update.
    await waitFor(async () => { expect(await sidebar()).toMatch(/Перевірка\s*1/); });
    // S-15 in full, PAGES INCLUDED. Measured: a LOADED with `pages: []` moves the board's «щойно» line but NOT the
    // «Перевірка» count, because a loading with no ТТН sheet has no printed field to confirm — so a pageless
    // record here would have asserted the lane count against a record the lane is right to ignore.
    const seq = server.mintSeq(OLEH);
    const key = `${OLEH}:${String(seq)}`;
    await call(phoneOf(OLEH), 'submitRecord', { params: {}, body: buildRecord(
      { deviceId: OLEH, seq, occurredAt: demo('08:52'), committedAt: demo('08:52'), stopId: stopId('3313-1') },
      'LOADED', { ttn_count: 1, pages: [`${key}:p1`, `${key}:p2`], no_doc_reason: null, deferred: null }) });
    for (const [i, side] of (['TTN_FRONT', 'TTN_BACK'] as const).entries()) {
      await call(phoneOf(OLEH), 'uploadPhoto', { params: {}, body: { key: `${key}:p${String(i + 1)}`,
        record_key: key, artefact: side, doc_index: 1, page_no: i + 1, captured_at: demo('08:50'), source: 'DRAWN',
        bytes: 700000, quality: 'OK', quality_reasons: [],
        drawn_variant: `ttn-004533-${side === 'TTN_FRONT' ? 'front' : 'back'}` } });
    }
    await waitFor(async () => { expect(await sidebar()).toMatch(/Перевірка\s*2/); }, { timeout: 500 });
    expect(container).toBeInTheDocument();
  });
});
