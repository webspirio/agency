// mocks/driver-report/src/pages/driver/taps.bind.test.tsx
/** THE TAP BUDGET OF §3.4, ROW 1 — bind, 1 · 0, on Григорій's phone (`device-000003`, «Такт 1»).
 *
 *  A third file for the same reason `taps.rc.test.tsx` is a second one: `DEVICE_ID` is read once at module init
 *  from the URL, so a file drives one phone. This is also the only phone in the tree that has never read «Що бачить
 *  офіс» — `seen_examples` and `office_sees_read` are set for Павло and Олег in the seed — so the tail of §8.2
 *  D-01 #5, «the card «Що бачить офіс — прочитайте один раз» after «Так, це я»», can only be driven here.
 *
 *  §3.4 counts the bind at ONE tap and counts it «from the «Це ви?» screen»: the QR is scanned with the phone's
 *  camera, not tapped, so the deep link `#/bind/:code` is where the budget starts. */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000003&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { NATALIA } from '../../domain/script';
import { atBeat, renderAt, transportAs } from '../../test/harness';

afterEach(cleanup);

/** The office mints the code «Такт 1» opens with, exactly as S-01 does. */
async function mintCode(): Promise<string> {
  const driverId = server.world().drivers.find((d) => d.tab_no === '0457')!.id;
  const preview = await call(transportAs(NATALIA, ['dispatcher']), 'createBindCode', { params: { id: driverId }, body: {} });
  return preview.code;
}

describe('§3.4 — bind: 1 tap', () => {
  it('binds the phone and lands home with the one-time «Що бачить офіс» card', async () => {
    await atBeat(1);
    const code = await mintCode();
    const { user, router } = renderAt(`/bind/${code}`);
    expect(await screen.findByText('Це ви?')).toBeInTheDocument();

    let taps = 0;
    taps += 1;
    await user.click(screen.getByRole('button', { name: 'Так, це я' }));
    expect(taps).toBe(1);

    await waitFor(() => { expect(router.state.location.pathname).toBe('/'); });
    expect(server.world().devices.find((d) => d.id === 'device-000003')!.driver_id).not.toBeNull();
    // §8.2 D-01 #5: the row a freshly bound phone carries, and only a freshly bound one.
    expect(await screen.findByRole('button', { name: 'Що бачить офіс — прочитайте один раз' })).toBeInTheDocument();
  });

  /** MEASURED, AND LEFT AS IT IS — a finding for the fix loop rather than a change smuggled into a test task.
   *  Tapping that card on a phone with no shift open does NOT open «Що бачить офіс»: every pinned card goes through
   *  home's `open()`, which raises D-21's «Ви ще не почали зміну. Почати на АР 7390 ЕВ?» sheet first and continues
   *  to the card's page only after a chip is picked. §3.3 D-21 words itself «sheet over any first CAPTURE», and a
   *  read-once explainer is not a capture — nor are «Мій день» and «Ще», which take the same route. So a phone bound
   *  at «Такт 1» cannot read this row without being offered a shift it did not ask to start.
   *
   *  It is pinned here so the behaviour is not rediscovered as a surprise; the day somebody separates reading from
   *  capturing in `HomePage`, this test is the one to change, deliberately, with §3.3 D-21 quoted beside it. */
  it('is reached through D-21’s sheet, because every pinned card goes through home’s `open()`', async () => {
    await atBeat(1);
    const code = await mintCode();
    const { user } = renderAt(`/bind/${code}`);
    await user.click(await screen.findByRole('button', { name: 'Так, це я' }));
    await user.click(await screen.findByRole('button', { name: 'Що бачить офіс — прочитайте один раз' }));
    expect(await screen.findByText(/^Ви ще не почали зміну/)).toBeInTheDocument();
    expect(screen.queryByText('Що йде в офіс')).toBeNull();
  });

  it('renders «Що бачить офіс» on this phone when the route is opened directly', async () => {
    await atBeat(1);
    renderAt('/office-sees');
    expect(await screen.findByText('Що йде в офіс')).toBeInTheDocument();
  });
});
