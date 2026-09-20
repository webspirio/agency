// mocks/driver-report/src/pages/office/paper.test.tsx
/** W2-09 — «Оригінали» (C-14), «Робочий час» (C-15), «Водії» + the driver card (C-16).
 *
 *  Two measured notes carried from the Wave 1 gate:
 *  1. NBSP. `fmtCode('483920')` renders «483 920» with U+00A0, Testing Library normalises a NODE's U+00A0 to U+0020
 *     and NEVER the matcher — and `toHaveTextContent` normalises with `/\s+/g`, which matches U+00A0. So the matcher
 *     below writes U+0020 where the screen carries the NBSP. The RENDERED copy keeps its NBSP.
 *  2. `afterEach(cleanup)`. Neither vitest project sets `globals: true`, so Testing Library never registers its own
 *     cleanup and a second `renderAt` in this file would stack a second tree into the same document.
 *
 *  The beat of the first drive is 11, not 10, and that is a correction to the plan rather than a convenience:
 *  `originalsRows` (frozen in W0-17) only puts today's ТТН in «Очікуємо сьогодні» once that day's waybill is PRINTED,
 *  and S-47/S-48 (confirm + print АР 1234 ВС, 16:06) are `beat: 10` LIVE entries, which `rebuild(10)` does not apply.
 *  At beat 11 the clock is moved to 16:15 exactly as the plan wrote it. */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { cleanup, screen } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { HRYHORII } from '../../domain/script';
import { atBeat, renderAt, transportAs } from '../../test/harness';

afterEach(cleanup);

describe('paper, hours and phones (§4.2 C-14 … C-16, §8.3 C-14/C-15/C-16) [T2]', () => {
  it('receives Олег’s overdue original', async () => {
    await atBeat(11, { at: demo('16:15') });
    server.setUi({ scope: 'PILOT' });
    const { user } = renderAt('/originals');
    expect(await screen.findByText(/Кравчук О\./)).toBeInTheDocument();
    expect(screen.getByText(/ТТН 004503 \(«Добробут»\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ватаманюк П\. · Р-26-3312 · ТТН 004517, 004518/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Оригінал отримано' })[0]!);
    expect(await screen.findByText('отримано 16:15 · Н. Шевчук')).toBeInTheDocument();
  });
  it('shows shift length beside the tachograph, never a legal verdict', async () => {
    await atBeat(10);
    renderAt('/worktime');
    expect(await screen.findByText(/Чи діє Положення №340 на ваші рейси під час воєнного стану/)).toBeInTheDocument();
    // `find`, not `get`: the banner is painted before the query lands, so the plan's synchronous `getByRole` here
    // would read the loading skeleton. The assertion is the plan's, the wait is what makes it one.
    expect(await screen.findByRole('columnheader', { name: 'Тривалість змін' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Робочий час' })).toBeNull();
    expect(screen.getAllByText('потрібен графік змінності').length).toBeGreaterThan(0);
  });
  it('beat 1: shows the QR, counts down and ticks as the phone binds', async () => {
    await atBeat(1);
    const driverId = server.world().drivers.find((d) => d.tab_no === '0457')!.id;
    const { user } = renderAt(`/drivers?open=${driverId}`);
    await user.click(await screen.findByRole('button', { name: 'Підключити телефон' }));
    expect(await screen.findByText('14:59')).toBeInTheDocument();
    expect(screen.getByText(/Або відкрийте ktl\.in\.ua\/z і введіть код/)).toHaveTextContent('483 920');
    await call(transportAs({ id: HRYHORII, role: 'driver' }, ['driver']), 'getBindPreview', { params: { code: '483920' }, body: undefined });
    await call(transportAs({ id: HRYHORII, role: 'driver' }, ['driver']), 'confirmBinding', { params: { code: '483920' }, body: {} });
    expect(await screen.findByText('Телефон підключено 05:15 · Android 10 · Chrome')).toBeInTheDocument();
  });
});
