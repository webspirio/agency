// mocks/driver-report/src/stage/stage.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=demo'); });
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { server } from '../api/server';
import { BEATS } from '../domain/script';
import { atBeat, renderAt } from '../test/harness';

/** Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms and a render leaks
 *  into the next test — which is not academic here: every assertion below reads `document.querySelectorAll('iframe')`
 *  or a bar control by role, and a leaked stage doubles every one of them. */
afterEach(cleanup);

const frames = () => [...document.querySelectorAll('iframe')] as HTMLIFrameElement[];

describe('the presenter stage (§5, §8.4)', () => {
  it('mounts three phones and one console on the one server, Павло in the frame', async () => {
    await atBeat(0);
    renderAt('/');
    await screen.findByText('Телефон водія · Павло Ватаманюк · АР 1234 ВС');
    expect(screen.getByText('Офіс · Наталія Шевчук, оператор')).toBeInTheDocument();
    const srcs = frames().map((f) => f.getAttribute('src'));
    expect(srcs.filter((s) => s?.includes('profile=driver'))).toEqual([expect.stringContaining('device=device-000001&stage=1'),
      expect.stringContaining('device=device-000002&stage=1'), expect.stringContaining('device=device-000003&stage=1')]);
    expect(srcs.filter((s) => s?.includes('profile=dispatcher&user=natalia&stage=1'))).toHaveLength(1);
    expect(window.__ktlServer).toBe(server);
  });
  it('switches phones without reloading any of them', async () => {
    await atBeat(0);
    const { user } = renderAt('/');
    const before = frames().map((f) => f.getAttribute('src'));
    await user.click(await screen.findByRole('radio', { name: 'Ruptela-машина · Олег' }));
    expect(frames().map((f) => f.getAttribute('src'))).toEqual(before);
    expect(frames().find((f) => f.src.includes('device-000002'))!.closest('[data-phone]')).toHaveStyle({ visibility: 'visible' });
    expect(frames().find((f) => f.src.includes('device-000001'))!.closest('[data-phone]')).toHaveStyle({ visibility: 'hidden' });
    expect(screen.getByRole('button', { name: /GPS зник/ })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: 'Регіс-машина · Павло' }));
    expect(screen.getByRole('button', { name: /GPS зник/ })).toBeDisabled();
  });
  // §5.8: «The URL hash follows the beat (`#/beat/7`)». It did not — W3-05 measured `location.hash` still reading
  // `#/beat/0` after «Такт 7», and only a reload put it right. That is the wrong half of EC-166 to have working: a
  // fresh tab at `#/beat/3` landed on beat 3, but the tab the presenter is ACTUALLY standing in lied about where
  // it stood, so a reload mid-demo would come back to the wrong beat whenever the log was unreadable.
  it('follows the beat in the URL hash (§5.8, EC-166)', async () => {
    await atBeat(3);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Такт ▾' }));
    await user.click(screen.getByRole('menuitem', { name: /Такт 8 · Ферма, тривога, машина в русі/ }));
    await waitFor(() => expect(server.ui.beat).toBe(8));
    await waitFor(() => expect(window.location.hash).toBe('#/beat/8'));
  });
  it('turns the phones offline and says so in hold, idempotently', async () => {
    await atBeat(7);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: /^Офлайн/ }));
    expect(screen.getByText('Офлайн: увімкнено')).toBeInTheDocument();
    expect(server.toggles.offline).toBe(true);
    expect(screen.queryByText('LTE')).toBeNull();
  });
  it('lands any «Такт» with every toggle off, and asks twice before a reset', async () => {
    await atBeat(3);
    const { user } = renderAt('/');
    act(() => server.setToggle('offline', true));
    await user.click(await screen.findByRole('button', { name: 'Такт ▾' }));
    for (const b of BEATS) expect(screen.getByRole('menuitem', { name: new RegExp(b.title.replace(/[()]/g, '.')) })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Такт 8 · Ферма, тривога, машина в русі/ }));
    await waitFor(() => expect(server.ui.beat).toBe(8));
    expect(server.toggles.offline).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Скинути демо' }));
    expect(screen.getByRole('button', { name: 'Скинути? Ще раз' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Скинути? Ще раз' }));
    await waitFor(() => expect(server.ui.beat).toBe(0));
  });
  it('tells the presenter when a phone acts out of turn (EC-165)', async () => {
    await atBeat(7);
    renderAt('/');
    await screen.findByText(/Такт 7 · «Офлайн» → телефон Павла/);
    act(() => server.wrote('submitRecord', { actor: { id: 'device-000002', role: 'driver' }, now: server.clock.nowIso(), params: {}, body: { type: 'CALL_ME' } }, { truck_day_id: null, highlight: true }));
    expect(await screen.findByText('Зараз телефон Олега — такт 7 для Павла')).toBeInTheDocument();
  });
});
