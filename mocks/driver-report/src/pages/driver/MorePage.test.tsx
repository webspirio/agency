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
  // TWO MEASUREMENTS FROM W3-05, RE-MEASURED IN W3-06, written down as the spelling that carries them. jsdom has
  // no layout engine and can judge neither a pixel nor a scroll; what it can hold is the class TOKEN the browser
  // proved right — and a token comparison, never a substring, because the gate measured one of its own assertions
  // passing spuriously on `max-h-full` containing `h-full`.
  //
  //  · §8.5 «the driver route works at 200 % root size without horizontal scroll». At 360 px the theme row could
  //    not wrap, so `documentElement.scrollWidth` read 386 against 360 at 130 % (the gate size EC-78 names — the
  //    «Темна» button was clipped) and 594 at 200 %. Both `flex-wrap`s are the fix: the outer row drops the switch
  //    onto its own line, the switch drops «Темна» under «Світла».
  //  · §8.5 «Targets: driver primary 4–4.5rem, all others 3.5rem». The two segments were `min-h-[2.75rem]` = 44 px
  //    inside a 56 px shell — the one control on the driver route below the floor.
  it('wraps the theme switch and gives both segments a 3.5rem target (§8.5)', async () => {
    await atBeat(7);
    const { container } = renderAt('/more');
    const group = await screen.findByRole('group', { name: 'Тема' });
    const row = group.parentElement;
    expect((row?.className ?? '').split(/\s+/)).toContain('flex-wrap');
    expect(group.className.split(/\s+/)).toContain('flex-wrap');
    const segments = [...group.querySelectorAll('button')];
    expect(segments).toHaveLength(2);
    for (const b of segments) {
      const tokens = b.className.split(/\s+/);
      expect(tokens).toContain('min-h-tap');
      expect(tokens).not.toContain('min-h-[2.75rem]');
    }
    expect(container).toBeTruthy();
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
