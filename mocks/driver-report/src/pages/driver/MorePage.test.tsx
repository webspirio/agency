// mocks/driver-report/src/pages/driver/MorePage.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen } from '@testing-library/react';
import { server } from '../../api/server';
import { enqueue } from '../../app/outbox';
import { buildRecord } from '../../app/records';
import { demo } from '../../domain/clock';
import { PAVLO } from '../../domain/script';
import { atBeat, renderAt } from '../../test/harness';

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms: without this the
// previous test's DOM is still mounted and a query matches it (one false green and one false red, measured in Wave 1).
afterEach(cleanup);

describe('«Ще» (§3.3 D-18, §8.2 D-17/18/20/21, §8.6 #10) [T2]', () => {
  it('offers only «Світла | Темна» and asks before leaving with unsent records', async () => {
    await atBeat(7);
    server.setToggle('offline', true);
    for (let i = 0; i < 3; i += 1) {
      const seq = server.mintSeq(PAVLO);
      enqueue(PAVLO, { record: buildRecord({ deviceId: PAVLO, seq, occurredAt: demo('08:57'), committedAt: demo('08:57') }, 'CALL_ME', {}), pages: [], receipt: null });
    }
    const { user } = renderAt('/more');
    expect(await screen.findByText('Світла')).toBeInTheDocument();
    expect(screen.getByText('Темна')).toBeInTheDocument();
    expect(screen.queryByText('Як у системі')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Вийти' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('3 записи ще не в офісі');
    expect(screen.getByText('Якщо вийдете — вони пропадуть.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Залишитись' })).toBeInTheDocument();
    server.setToggle('offline', false);
  });
  // The phone's own name is DERIVED — §3.3 D-18's example is Григорій's Redmi 8 while «Ще» is reached on Павло's —
  // and it now arrives on `today.device.os_label` instead of being read out of the stores by the page (the round's
  // integrator note: the API could answer it, and a page reaching past the contract is one more thing to undo).
  it('«Про телефон» names the phone the contract answered with (§3.3 D-18)', async () => {
    await atBeat(7);
    const { user } = renderAt('/more');
    await user.click(await screen.findByRole('button', { name: 'Про телефон' }));
    expect(await screen.findByText('Телефон: Android 11 · Chrome')).toBeInTheDocument();
  });
});
