// mocks/driver-report/src/pages/office/board.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { buildRecord } from '../../app/records';
import { demo } from '../../domain/clock';
import { HRYHORII, PAVLO } from '../../domain/script';
import { atBeat, renderAt, transportAs } from '../../test/harness';

const width = (w: number) => act(() => { window.innerWidth = w; window.dispatchEvent(new Event('resize')); });
/** The row ORDER, which is what §8.6 #15 forbids moving under the pointer. Not the rows' WORDS: §4.2 C-01 «Live»
 *  and §5.9 #3 require a changed row to update in place and to gain «щойно · 06:10», so a whole-textContent
 *  comparison here could only ever be red — measured, on the state line and the live line of the CALL_ME row. */
const order = (table: HTMLElement) =>
  within(table).getAllByRole('button').map((r) => /АР.\d{4}.\S{2}/.exec(r.textContent ?? '')?.[0] ?? '');

// Neither vitest config sets `globals: true`, so Testing Library never arms its auto-cleanup and the renders of one
// file leak into each other — measured in Wave 1 as one false green and one false red.
afterEach(cleanup);

describe('«Парк зараз» (§4.2 C-01, §8.3 C-01)', () => {
  it('shows the pilot at 05:14: three rows, three tiles, sources, no «зателефонуйте»', async () => {
    width(1440);
    await atBeat(0);
    const { container } = renderAt('/');
    expect(await screen.findByText('Пілот: 3 машини · нижче — як це виглядатиме на всіх 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /АР 1234 ВС.*Ватаманюк П\..*Не на зміні · план з 05:30/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /АР 9012 МК.*Кравчук О\..*На базі · план з 07:30/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /АР 7390 ЕВ.*Савенко Г\..*Не на зміні · телефон не підключено/ })).toBeInTheDocument();
    for (const t of ['Не почали в застосунку', 'У черзі', "Без зв'язку понад 2 год"]) expect(screen.getByText(t)).toBeInTheDocument();
    expect(container.textContent).not.toContain('зателефонуйте');
    expect(screen.getAllByText(/· позиція — з Регісу, фаза 2$/).length).toBeGreaterThan(0);
  });
  it('shows the office the driver’s start within half a second, highlighted «щойно · 05:21» (§8.2 D-03 #4)', async () => {
    width(1440);
    await atBeat(2);
    server.clock.set(demo('05:21'));
    renderAt('/');
    // findAll: at «Такт 2» Григорій is already bound, so TWO pilot rows read «Не на зміні · план з 05:30».
    await screen.findAllByText(/Не на зміні · план з 05:30/);
    const truck = server.world().trucks.find((t) => t.plate === 'АР 1234 ВС')!;
    const seq = server.mintSeq(PAVLO);
    await call(transportAs({ id: PAVLO, role: 'driver' }, ['driver']), 'submitRecord', { params: {}, body: buildRecord({ deviceId: PAVLO, seq,
      occurredAt: demo('05:20'), committedAt: demo('05:21') }, 'SHIFT_START', { truck_id: truck.id, trailer_id: truck.trailer_id, plan_match: true,
      odometer: { value: 412355, source: 'DASH_PHOTO', basis: 'LAST_AT_BASE', expected: 412355, read: 412355, choice: 'CONFIRMED', page_key: null }, inline: null }) });
    expect(await screen.findByText('щойно · 05:21', undefined, { timeout: 500 })).toBeInTheDocument();
    expect(screen.getByText(/На зміні · 0:0\d/)).toBeInTheDocument();
    expect(await screen.findByText('Павло Ватаманюк · Зміну почато 05:20')).toBeInTheDocument();
  });
  it('keeps the order under the pointer and collects the new needs-action row in the hold bar (§8.6 #15)', async () => {
    width(1440);
    await atBeat(3);
    const { user } = renderAt('/');
    const table = await screen.findByRole('table');
    const before = order(table);
    await user.hover(table);
    // Григорій, not Павло: «АР 1234 ВС» already sorts first at «Такт 3», so a CALL_ME from PAVLO reorders nothing and
    // the assertion below could not fail — measured, with `frozen` off. «АР 7390 ЕВ» is the row that has to move.
    const seq = server.mintSeq(HRYHORII);
    await call(transportAs({ id: HRYHORII, role: 'driver' }, ['driver']), 'submitRecord', { params: {}, body: buildRecord({ deviceId: HRYHORII, seq,
      occurredAt: server.clock.nowIso(), committedAt: server.clock.nowIso() }, 'CALL_ME', {}) });
    expect(await screen.findByText(/потребу(є|ють) дії — показати/)).toBeInTheDocument();
    expect(order(table)).toEqual(before);
  });
  it('folds to cards and a sheet on a phone (§8.3 shell #4, C-01 «Mobile card»)', async () => {
    width(390);
    await atBeat(0);
    const { user } = renderAt('/');
    await screen.findByText('Пілот: 3 машини · нижче — як це виглядатиме на всіх 100');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Подзвонити' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Парк зараз/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Меню' }));
    expect(await screen.findByRole('link', { name: /Парк зараз/ })).toBeInTheDocument();
  });
  it('shows the whole fleet at 16:05 with «приклад» and 3 in «Зараз»', async () => {
    width(1440);
    await atBeat(10);
    renderAt('/');
    expect(await screen.findByText('Весь парк · 100 машин · приклад · потребують дії — зверху')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('button').length).toBeGreaterThanOrEqual(100));
    expect(screen.getByRole('link', { name: /Зараз\s*3/ })).toBeInTheDocument();
  });
});
