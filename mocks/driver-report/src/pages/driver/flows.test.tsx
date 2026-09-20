// mocks/driver-report/src/pages/driver/flows.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { PAVLO } from '../../domain/script';
import { atBeat, flushOutbox, renderAt } from '../../test/harness';
import { SegmentPanel } from './SegmentPanel';

// Neither the root vitest config nor the mock's own sets `globals: true`, so Testing Library's auto-cleanup guard
// never arms: without this a render leaks into the next test in this file (measured in Wave 1 — one false green and
// one false red).
afterEach(cleanup);

const stopId = (key: string) => server.world().plannedStops.find((p) => p.plan_key === key)!.id;
const lastRecord = (type: string) => server.world().records.filter((r) => r.device_id === PAVLO && r.type === type).at(-1)!;
/** The parallel rule: what the flow handed to home, not home's rendering of it. */
const handed = () => server.phone(PAVLO).outbox.at(-1)!;

describe('start the shift on Регіс (§3.3 D-03, §8.2 D-03, beat 2)', () => {
  it('confirms truck and trailer, shoots the dash and confirms 412 355 in four taps', async () => {
    await atBeat(2);
    const { user, router } = renderAt('/shift/start');
    expect(await screen.findByText('Машина і причіп сьогодні')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Номер АР 1234 ВС' })).toBeInTheDocument();
    expect(screen.getByText('пневмобочка, 6 відсіків')).toBeInTheDocument();
    for (const t of ['Інша машина', 'Інший причіп']) expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    let taps = 0;
    const tap = async (name: string | RegExp) => { taps += 1; await user.click(await screen.findByRole('button', { name })); };
    await tap('Так, ці');
    expect(await screen.findByText('Сфотографуйте щиток')).toBeInTheDocument();
    await tap('Зняти');
    // The NBSP of `fmtKm` survives in the NODE; Testing Library's normalizer turns it into U+0020 before matching and
    // never touches the matcher, so a getByText matcher spells it with a plain space.
    expect(await screen.findByText('вчора о 17:48 на базі: 412 355 — порівняйте з фото')).toBeInTheDocument();
    expect(screen.queryByText(/машина стояла/)).toBeNull();
    await tap('Так, 412\u00A0355');
    expect(taps).toBeLessThanOrEqual(4);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(handed().receipt).toEqual({ title: 'Зміну почато 05:20 · 412\u00A0355 км', next: 'Далі: завантаження — Дніпро-Корм, Вільнянськ' });
    await flushOutbox(PAVLO);
    expect(lastRecord('SHIFT_START').payload).toMatchObject({ odometer: { value: 412355, source: 'DASH_PHOTO', basis: 'LAST_AT_BASE' } });
  });
});

describe('arrive and say what is happening (§3.3 D-04, D-05, §8.2 D-04/05, beat 3)', () => {
  it('asks «Що зараз?», advances on «Черга» and confirms +36 km', async () => {
    await atBeat(3);
    const { user } = renderAt(`/stop/${stopId('3312-1')}/arrive`);
    expect(await screen.findByText('Що зараз?')).toBeInTheDocument();
    for (const t of ['Черга', 'Одразу вантажать', 'Ваги', 'Лабораторія', 'Чекаю документи', 'Інше']) expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Черга' }));
    expect(await screen.findByText('Поки стоїте — сфотографуйте щиток')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText('+36 км від виїзду · за планом 36 · на прибутті')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Так, 412\u00A0391' }));
    await waitFor(() => expect(handed().receipt?.title).toBe('На місці 06:10 · 412\u00A0391 км'));
    expect(handed().record).toMatchObject({ type: 'ARRIVED', payload: { chip: 'QUEUE', order: 'PLANNED' } });
  });
  it('commits at «Лан» in two taps without a camera', async () => {
    await atBeat(8, { at: demo('13:45') });
    const { user } = renderAt(`/stop/${stopId('3312-3')}/arrive`);
    expect(await screen.findByText('Тут фото заборонені — ТТН і щиток знімете після виїзду')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Черга' }));
    expect(screen.queryByRole('button', { name: 'Зняти' })).toBeNull();
    await waitFor(() => expect(handed().receipt?.title).toMatch(/^На місці 13:45/));
  });
  it('lists the kind’s own mark first in «Що зараз?» and records a segment (D-05)', async () => {
    await atBeat(4, { at: demo('07:52') });
    const done = vi.fn();
    const router = createMemoryRouter([{ path: '/', element: <SegmentPanel stopId={stopId('3312-1')} onDone={done} /> }]);
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
    const rows = await screen.findAllByRole('button', { name: /Заїхав — вантажать|Черга|Ваги|Тривога \/ укриття/ });
    expect(rows[0]).toHaveTextContent('Заїхав — вантажать');
    expect(rows.at(-1)).toHaveTextContent('Тривога / укриття');
    await userEvent.click(screen.getByRole('button', { name: 'Ваги' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(handed().record).toMatchObject({ type: 'SEGMENT', payload: { chip: 'SCALES' } });
    expect(handed().receipt?.title).toBe('Ваги · з 07:52');
  });
});
