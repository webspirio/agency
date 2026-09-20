// mocks/driver-report/src/pages/driver/lock.test.tsx
/** THERE IS ONE MOTION LOCK ON THE DRIVER ROUTE, and it lives in `DriverShell` (§3.3 D-19, §8.2 D-19).
 *
 *  `useMotionLock` keeps its lock in component state, so a screen that calls it a second time gets a SECOND,
 *  independent lock. On an RG truck the reading happens inside `guard()`, so a screen guarding with its own instance
 *  locks only itself — the shell never learns the truck is moving, its `inert` wrapper never goes up, and its five
 *  second «Продовжимо: …» banner never fires. Worse, a screen that renders the overlay INSTEAD of itself unmounts the
 *  flow under it, and §8.2 D-19 #2 asks for the opposite: «the screen under it is unchanged».
 *
 *  So every driver screen takes the guard from the shell (`useDriverGuard`) and renders no overlay of its own. This
 *  file is the check on that, across the route rather than inside one page. */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen } from '@testing-library/react';
import { server } from '../../api/server';
import { atBeat, renderAt } from '../../test/harness';

afterEach(cleanup);

/** Павло's Регіс truck: no CAN, so the only reading ever taken is the one inside `guard()`. */
const REGIS = 'truck-000001';

describe('the motion lock is the shell’s, and only the shell’s (§3.3 D-19, §8.2 D-19)', () => {
  it('raises ONE overlay over a screen that stays mounted, and swallows the tap that raised it', async () => {
    await atBeat(8);
    const { user } = renderAt('/elsewhere');
    expect(await screen.findByText('Де ви?')).toBeInTheDocument();

    server.setToggle('speed', { [REGIS]: 60 });
    await user.click(screen.getByRole('button', { name: /Нове місце/ }));

    // One overlay, not two: the shell's. A page with a lock of its own would add a second `role="status"`.
    expect(screen.getAllByText('Ви в дорозі')).toHaveLength(1);
    // The screen under it is unchanged — still «Де ви?», still mounted, and inside the shell's inert wrapper.
    const here = screen.getByText('Де ви?');
    expect(here.closest('[inert]')).not.toBeNull();
    // The tap that raised the lock did nothing else (§3.3 D-19: «swallows the tap»).
    expect(screen.queryByText('Що тут?')).toBeNull();
  });
});
