// mocks/driver-report/src/stage/comfort.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=demo'); });
import { cleanup, screen } from '@testing-library/react';
import { server } from '../api/server';
import { atBeat, renderAt } from '../test/harness';
import { barLabels } from './layout';

/** Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms, and a leaked
 *  stage doubles every control this file addresses by role. The harness registers one too; a second finds nothing
 *  left to unmount. */
afterEach(cleanup);

describe('presenter comfort (§5.4, §5.5, §5.10) [T3]', () => {
  it('rewinds only forward', async () => {
    await atBeat(8);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Перемотати до… ▾' }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['12:30 · тривога', '12:48 · кінець тривоги', '16:02 · база', '16:05 · офіс, кінець дня']);
  });
  it('hides the bar on «P» and cycles focus on «F»', async () => {
    await atBeat(2);
    const { user } = renderAt('/');
    await screen.findByRole('button', { name: 'Такт ▾' });
    await user.keyboard('p');
    expect(server.ui.barHidden).toBe(true);
    await user.keyboard('f');
    expect(server.ui.focus).toBe('phone');
  });
  it('never shows a price guard: the pilot page carries no price by design (D18)', async () => {
    await atBeat(13);
    renderAt('/');
    await screen.findByRole('button', { name: 'Такт ▾' });
    expect(screen.queryByText(/ціна/i)).toBeNull();
  });
  it('offers the hidden menu without a real camera', async () => {
    await atBeat(2);
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: '⋯' }));
    expect(screen.getByRole('menuitem', { name: /Справжня камера/ })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: /Сховати позначки «імітація»/ }));
    expect(server.toggles.hideSimChips).toBe(true);
  });

  /** MEASURED IN CHROME, 2026-09-20, `?profile=demo#/beat/2` at 1 440 × 900: the bar's content was 1 819 px inside a
   *  1 440 px bar, so «Скинути демо», «⋯», the link indicator and the guard chips were clipped off the right-hand
   *  edge — at exactly the size §5.2 calls the rehearsal canvas. jsdom has no layout engine, so it cannot re-derive
   *  this and neither can this test: it pins the DECISION the browser proved right, and goes red only if somebody
   *  asks the 1 440 px canvas for the 1 819 px spelling again. The pixels are W3-05's to re-measure. */
  it('never asks the 1 440 px canvas for the labels that measured 1 819 px (§5.2, §5.4)', () => {
    // A 1 920 window still draws the bar on the FIXED 1 440 canvas, so the window is not the question.
    expect(barLabels('canvas', 1920)).toEqual({ identity: true, compact: true });
    expect(barLabels('canvas', 1440)).toEqual({ identity: true, compact: true });
    expect(barLabels('reflow', 1280)).toEqual({ identity: false, compact: true });
  });
});
