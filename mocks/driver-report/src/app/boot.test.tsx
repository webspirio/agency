// mocks/driver-report/src/app/boot.test.tsx
import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&beat=5'); });
import { render, screen, waitFor } from '@testing-library/react';
import { server } from '../api/server';
import { demo } from '../domain/clock';
import { advance, atBeat, renderAt } from '../test/harness';
import { BootGate } from './boot';

describe('a standalone profile builds its own server at ?beat (§7.7)', () => {
  it('renders its children only once the server sits at the beat', async () => {
    render(<BootGate defaultBeat={10}><p>ready</p></BootGate>);
    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(server.ui.beat).toBe(5);
  });
  it('never rebuilds a server it inherited from the stage', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', { value: { __ktlServer: server }, configurable: true });
    try {
      server.setUi({ beat: 7 });
      const done = [...server.done];
      render(<BootGate defaultBeat={2}><p>embedded</p></BootGate>);
      expect(await screen.findByText('embedded')).toBeInTheDocument();
      expect([server.ui.beat, server.done]).toEqual([7, done]);
    } finally {
      if (original) Object.defineProperty(window, 'parent', original);
    }
  });
  // Added by W0-20 beyond the plan's cases: an embedded gate before the stage has placed its server waits for the
  // stage, and builds nothing itself (the case above already sits at a beat, so it cannot tell).
  it('waits, embedded, for the stage to place the server, and never builds one itself', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', { value: { __ktlServer: server }, configurable: true });
    try {
      server.reset();
      render(<BootGate defaultBeat={2}><p>waiting</p></BootGate>);
      await new Promise((r) => setTimeout(r, 150));
      expect([screen.queryByText('waiting'), server.ui.beat]).toEqual([null, null]);
      server.setUi({ beat: 6 });
      expect(await screen.findByText('waiting')).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(window, 'parent', original);
    }
  });
  // Added by W0-20 beyond the plan's cases: the harness every Wave 2 page test starts from.
  it('lets a page test mount the real console at a beat, at its own moment, without the gate rebuilding under it', async () => {
    await atBeat(3, { at: demo('07:48') });
    const done = [...server.done];
    const { router, container } = renderAt('/inbox/review');
    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
    expect([router.state.location.pathname, server.ui.beat, server.done, server.clock.nowIso()])
      .toEqual(['/inbox/review', 3, done, demo('07:48')]);
    await advance(90_000);
    expect(server.clock.nowIso()).toBe(demo('07:49:30'));
  });
});
