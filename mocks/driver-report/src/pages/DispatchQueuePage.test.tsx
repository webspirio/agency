import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

/**
 * THE OFFICE SCREEN, MOUNTED — through the real adapter, the real contract and
 * the real seed.
 *
 * What this covers that nothing else does: the queue is the payoff of the whole
 * design, and a build is green over a screen that renders nothing. The domain
 * tests prove `flagsFor` computes ODOMETER_BACKWARDS; only this proves the
 * office is ever SHOWN it — a flag nobody renders is a flag that does not exist,
 * and the seed carries the dropped digit (24 148 where 241 480 belongs)
 * precisely so that path is exercised rather than described.
 *
 * `MemoryRouter` because the app's own router is a hash router the page never
 * touches: `DispatchNav` takes its `current` as a PROP, so nothing here depends
 * on a URL. The wrapper is the honest environment rather than a requirement.
 */
function mount(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

let DispatchQueuePage: (typeof import('./DispatchQueuePage'))['DispatchQueuePage'];

beforeAll(async () => {
  // Both stubs have to land BEFORE the page's import graph is evaluated: the
  // adapter is chosen at module scope in `src/api/client.ts`, and the profile —
  // which decides the capability set that gate 404s against — is resolved at
  // module scope in `src/profiles.ts`.
  //
  // VITE_PROFILE is not decoration here. Every operation on this screen except
  // `listEvents` declares `caps: ['dispatcher']`, and the scaffold's fallback
  // profile is the DRIVER. Without it the adapter answers 404 for `overview`,
  // `getEvent` and `confirmEvent` — which is the capability mechanism working
  // exactly as designed, and would look like a broken screen.
  vi.stubEnv('VITE_MOCK', '1');
  vi.stubEnv('VITE_PROFILE', 'dispatcher');
  ({ DispatchQueuePage } = await import('./DispatchQueuePage'));
});

afterEach(cleanup);

describe('the dispatcher queue', () => {
  it('renders the pending rows the seed left unconfirmed', async () => {
    mount(<DispatchQueuePage />);

    // Not a count and not a row id: both would pin this test to the seed's
    // current length, which is a number the demo is expected to keep editing.
    // A plate plus the kind is what a dispatcher actually looks at, and the
    // plate is the one element on a row nobody types.
    expect(await screen.findByText(/АР 1234 ВС/)).toBeTruthy();
    expect(screen.getAllByText('Завантаження').length).toBeGreaterThan(0);
  });

  it('shows the dropped-digit flag as a WARNING, not as a refusal', async () => {
    mount(<DispatchQueuePage />);

    // The seed's truck 3 unloads at 24 148 after loading at 241 000 — the
    // commonest real input error there is. The event was ACCEPTED and is on this
    // screen; the flag is the office being told, never the driver being blocked.
    const warning = await screen.findByText(/загубили цифру/);
    expect(warning).toBeTruthy();
  });

  it('offers the ТТН field and the confirm button on a selected event', async () => {
    const user = userEvent.setup();
    mount(<DispatchQueuePage />);

    // `pressed: false` selects exactly the queue rows: they are the only
    // controls on the screen carrying `aria-pressed`, which is what makes the
    // selection visible to assistive tech as well as to a stylesheet.
    const rows = await screen.findAllByRole('button', { pressed: false });
    const first = rows[0];
    if (!first) throw new Error('the queue rendered no selectable row');
    await user.click(first);

    // One input, and it is the honest centre of the design rather than an
    // oversight: the re-keying was moved off the gate, not removed.
    //
    // THE LABEL IS PER KIND, and asserting the shape rather than one string is
    // the point. FOUND 2026-09-16 by looking at the running screen: the newest
    // pending event is a REFUEL, and it rendered a fuel receipt beside a field
    // labelled «Номер ТТН з фото» — a fuel receipt carries no ТТН, so the office
    // was being asked for a number that is not on the document in front of them.
    // A test pinned to the literal «Номер ТТН…» went green through that, which
    // is why this one is pinned to the invariant instead: whatever the event,
    // there is exactly one field and it names the document actually photographed.
    expect(await screen.findByLabelText(/^Номер (ТТН|чека) з фото$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Підтвердити' })).toBeTruthy();
  });

  it('refuses a ТТН number that is already on another event, from the CODE', async () => {
    const user = userEvent.setup();
    mount(<DispatchQueuePage />);

    const rows = await screen.findAllByRole('button', { pressed: false });
    const first = rows[0];
    if (!first) throw new Error('the queue rendered no selectable row');
    await user.click(first);

    // A number the seed already put on truck 1's confirmed loading. This is the
    // best moment in the demo and it is the whole refusal path end to end:
    // `duplicateTtn` returns a code, `fail()` puts it in the envelope, the
    // adapter THROWS rather than resolving the 409 — an adapter that resolved it
    // would hand TanStack Query a success and the screen would render nothing —
    // and `codeOf` reads the code back so the table, not the server's sentence,
    // decides what a dispatcher is told.
    await user.type(await screen.findByLabelText(/^Номер (ТТН|чека) з фото$/), '0034512');
    await user.click(screen.getByRole('button', { name: 'Підтвердити' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/уже записаний/);
  });
});

