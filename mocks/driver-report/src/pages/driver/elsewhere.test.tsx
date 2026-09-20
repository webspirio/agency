// mocks/driver-report/src/pages/driver/elsewhere.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { atBeat, renderAt } from '../../test/harness';

afterEach(cleanup);

describe('«Де ви?» (§3.3 D-12, §8.2 D-12, §8.6 #8) [T2]', () => {
  it('offers the planned stops, the places nearby and a new place — and never a photo of the place', async () => {
    await atBeat(8);
    const { user, router } = renderAt('/elsewhere');
    expect(await screen.findByText('Де ви?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Лан, Балабине · ТТН 004518/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Нове місце/ }));
    expect(await screen.findByText('Що тут?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Зняти' })).toBeNull();
    // The ArriveContext is read off the ENTRY THIS PAGE PUSHES, not off `router.state` after the dust settles:
    // `ArrivePage` (W2-02) copies `location.state.arrive` into its draft and then replaces the entry with its own
    // `{ step, draftId, depth }` (the Wave 2 preamble says so), so a later read finds the flow's state and not
    // mine. Reading the first entry at that path asserts exactly what this page hands over, and stays true whether
    // the other side of the contract is the real ArrivePage or still its placeholder.
    const pushed: unknown[] = [];
    const off = router.subscribe((s) => { if (s.location.pathname === '/stop/new/arrive') pushed.push(s.location.state); });
    await user.click(screen.getByRole('button', { name: 'Інше' }));
    await waitFor(() => { expect(pushed).not.toHaveLength(0); });
    off();
    expect(pushed[0]).toMatchObject({ arrive: { order: 'UNPLANNED', new_place: true, unplanned_kind: 'OTHER' } });
  });
});
