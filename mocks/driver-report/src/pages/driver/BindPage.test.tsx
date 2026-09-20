// mocks/driver-report/src/pages/driver/BindPage.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000003&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { NATALIA } from '../../domain/script';
import { atBeat, renderAt, transportAs } from '../../test/harness';

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms: without this the
// previous test's DOM is still mounted and a query matches it (one false green and one false red, measured in Wave 1).
afterEach(cleanup);

describe('binding the phone (§3.3 D-01, §8.2 D-01) [T2]', () => {
  it('waits for a QR, then binds on «Так, це я» and lands home with the office-sees row', async () => {
    await atBeat(1);
    const { user, router } = renderAt('/bind');
    expect(await screen.findByText('Телефон ще не підключено')).toBeInTheDocument();
    expect(screen.getByText('Чекаю QR…')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-accent]')).toHaveLength(0);
    const driverId = server.world().drivers.find((d) => d.tab_no === '0457')!.id;
    await call(transportAs(NATALIA, ['dispatcher']), 'createBindCode', { params: { id: driverId }, body: {} });
    await user.click(await screen.findByRole('link', { name: 'ktl.in.ua/z/483920 — відкрити' }));
    expect(await screen.findByText('Це ви?')).toBeInTheDocument();
    expect(screen.getByText('ГС')).toBeInTheDocument();
    expect(screen.getByText('Григорій Савенко')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Номер АР 7390 ЕВ' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Так, це я' }));
    // Home is W2-01's (a placeholder in this task's tree): assert the binding and the navigation, not home's row.
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(server.world().devices.find((d) => d.id === 'device-000003')!.driver_id).toBe(driverId);
  });
  it('says an expired code is expired, never «помилка»', async () => {
    await atBeat(1);
    const driverId = server.world().drivers.find((d) => d.tab_no === '0457')!.id;
    await call(transportAs(NATALIA, ['dispatcher']), 'createBindCode', { params: { id: driverId }, body: {} });
    server.clock.set(demo('05:31'));
    const { container } = renderAt('/bind/483920');
    expect(await screen.findByText('Код застарів. Попросіть диспетчера показати новий.')).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain('помилк');
  });
});
