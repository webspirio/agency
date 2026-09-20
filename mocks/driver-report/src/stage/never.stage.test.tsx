// mocks/driver-report/src/stage/never.stage.test.tsx
/** THE TWO «MUST NEVER HAPPEN» ROWS THAT BELONG TO THE STAGE — #14 (no `getUserMedia`, no permission prompt, no
 *  notification, no geolocation and no `beforeunload`, through a whole run of the beats) and #25 (a rewind never
 *  raises an item the script does not contain).
 *
 *  WHY THE STAGE HALF IS A SEPARATE FILE FROM THE PHONE HALF: the profile is read once, at module init, from
 *  `window.location.search`, so a file is either `?profile=demo` or `?profile=driver`. The phone half of #14 — the
 *  three camera flows driven to their receipts with the same spies in place — is in
 *  `src/pages/driver/never.driver.test.tsx`.
 *
 *  THE SPIES ARE DEFINED, NOT ABSENT. `chooseEngine()` picks the drawn viewfinder because the page is on the stage,
 *  not because there was no camera to find, and `engine.ts` promises it does not even READ `navigator.mediaDevices`
 *  on that path. An absent API would make this row green for the wrong reason; a spy makes any touch visible.
 *
 *  #25 IS DRIVEN THROUGH THE MENU, not through `rebuild()`. `beats.test.ts` already asserts every beat's counts
 *  against §5.6 by calling the runner directly; what is unproven until here is that the control the presenter
 *  actually uses lands on the same state. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=demo'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { call } from '../api/contract';
import { server } from '../api/server';
import { BEATS, NATALIA } from '../domain/script';
import type { Scope } from '../domain/types';
import { atBeat, renderAt, transportAs } from '../test/harness';

afterEach(cleanup);

describe('#14 — the stage asks the presenter’s laptop for nothing, through every beat', () => {
  const gum = vi.fn();
  const permission = vi.fn();
  const current = vi.fn();
  const watch = vi.fn();
  let listened: string[] = [];

  beforeEach(() => {
    for (const spy of [gum, permission, current, watch]) spy.mockReset();
    listened = [];
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
    Object.defineProperty(navigator, 'geolocation',
      { value: { getCurrentPosition: current, watchPosition: watch, clearWatch: vi.fn() }, configurable: true });
    // A Notification constructor that also carries `requestPermission`: reading either is harmless, CALLING either
    // is what puts a browser sheet on the projector in front of the client (D4).
    Object.defineProperty(globalThis, 'Notification',
      { value: Object.assign(function N() { permission(); }, { requestPermission: permission, permission: 'default' }),
        configurable: true, writable: true });
    const real = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, ...rest: unknown[]) => {
      listened.push(type);
      return (real as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof window.addEventListener);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('walks «Такт ▾» through all fourteen beats with no prompt and no beforeunload', async () => {
    await atBeat(0);
    const { user } = renderAt('/');
    await screen.findByRole('button', { name: 'Такт ▾' });

    for (const beat of BEATS) {
      await user.click(screen.getByRole('button', { name: 'Такт ▾' }));
      await user.click(screen.getByRole('menuitem', { name: new RegExp(beat.title.replace(/[()]/g, '.')) }));
      await waitFor(() => { expect(server.ui.beat).toBe(beat.n); });
    }

    expect(gum).not.toHaveBeenCalled();
    expect(permission).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
    // §5.8 and D4: the presenter's reload is the recovery, so nothing may ask him to confirm leaving.
    expect(listened).not.toContain('beforeunload');
    // The spy itself must have seen SOMETHING, or its silence above would prove nothing about the page.
    expect(listened.length).toBeGreaterThan(0);
  });
});

describe('#25 — a rewind raises only what the script contains', () => {
  /** §5.6 order: Зараз · Перевірка · Дні на підтвердження · Оригінали · В BAS. */
  const counts = async (scope: Scope): Promise<number[]> => {
    const sum = await call(transportAs(NATALIA, ['dispatcher']), 'getOfficeSummary',
      { params: {}, body: undefined, qry: { scope } });
    return [sum.counts.now, sum.counts.review, sum.counts.days_to_confirm, sum.counts.originals, sum.counts.bas_ready];
  };

  it.each([5, 11])('«Такт %i» picked from the menu lands on §5.6’s own counts', async (n) => {
    await atBeat(0);
    const beat = BEATS.find((b) => b.n === n)!;
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Такт ▾' }));
    await user.click(screen.getByRole('menuitem', { name: new RegExp(beat.title.replace(/[()]/g, '.')) }));
    await waitFor(() => { expect(server.ui.beat).toBe(n); });
    expect(await counts(beat.scope)).toEqual([...beat.counts]);
    // Landing a beat also lands its clock, its phone and its scope — the other things §5.6 fixes. The clock is
    // compared to the SECOND: on the stage it runs (that is the point of a live demo), so by the time this line
    // executes it has moved milliseconds past the beat's instant — measured as 05:42:00.019 against 05:42:00.000.
    expect([server.clock.nowIso().slice(0, 19), server.ui.phone, server.ui.scope])
      .toEqual([beat.clock.slice(0, 19), beat.phone, beat.scope]);
  });

  it('a rewind forward through the whole day ends on «Такт 10»’s counts, not on more', async () => {
    // 05:14 → 16:05 in one move, through the menu the presenter uses: §8.6 #25's own sentence.
    await atBeat(0);
    const last = BEATS.find((b) => b.n === 10)!;
    const { user } = renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Такт ▾' }));
    await user.click(screen.getByRole('menuitem', { name: new RegExp(last.title.replace(/[()]/g, '.')) }));
    await waitFor(() => { expect(server.ui.beat).toBe(10); });
    expect(await counts(last.scope)).toEqual([...last.counts]);
    // Every toggle is off after a landing (§5.4): a rewind must not leave «Офлайн» or a speed on the next beat.
    expect(server.toggles.offline).toBe(false);
    expect(Object.values(server.toggles.speed)).toEqual([]);
  });
});
