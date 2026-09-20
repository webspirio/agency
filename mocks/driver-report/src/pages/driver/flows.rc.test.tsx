// mocks/driver-report/src/pages/driver/flows.rc.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000002&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { server } from '../../api/server';
import { OLEH } from '../../domain/script';
import { atBeat, renderAt } from '../../test/harness';

afterEach(cleanup);

describe('Ruptela + CAN: no dash photo (§3.3 D-03, §8.2 D-03 #2)', () => {
  it('shows the CAN reading as a fact and starts in two taps with no camera', async () => {
    await atBeat(3, { at: '2026-09-21T04:20:00.000Z' as never });
    const { user } = renderAt('/shift/start');
    // The matcher spells the group separator U+0020: the rendered node keeps its U+00A0 and the default normalizer
    // turns it into a space before comparing.
    expect(await screen.findByText('Одометр 241 476 км · CAN')).toBeInTheDocument();
    expect(screen.getByText('імітація')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Так, ці' }));
    expect(screen.queryByRole('button', { name: 'Зняти' })).toBeNull();
    await waitFor(() => expect(server.phone(OLEH).outbox.at(-1)!.receipt?.title).toMatch(/^Зміну почато 07:20 · 241\u00A0476 км · CAN/));
  });
});
