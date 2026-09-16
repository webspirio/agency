/**
 * THE HOME SCREEN, MOUNTED. Small on purpose: this is not a test of TanStack
 * Query, of the router or of the adapter — each of those has its own — it is the
 * one assertion that the three things a driver can do are ON the screen he
 * opens, reached through the contract, with real seeded data behind them.
 *
 * It is worth having because nothing else catches its failure. `tsc` is green
 * over a screen that renders one button; the wire golden drives `me` without
 * ever mounting anything; and the build compiles a home screen that throws at
 * first paint. The client's whole product is those three targets.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * `retry: false` for the same reason `main.tsx` sets it: a retry backoff turns a
 * refusal into four seconds of nothing. `MemoryRouter` because the page calls
 * `useNavigate` — the real app uses a HASH router, and that difference is
 * deliberate rather than overlooked: what is under test is that the buttons
 * exist and carry the right words, not which history implementation moves them.
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

/* Imported dynamically, AFTER the env stub. `src/api/client.ts` reads
   `import.meta.env.VITE_MOCK` at module init to decide whether to install the
   mock adapter — stubbing it after the import would leave the page talking to a
   baseURL that does not exist. */
let DriverHomePage: (typeof import('./DriverHomePage'))['DriverHomePage'];

beforeAll(async () => {
  vi.stubEnv('VITE_MOCK', '1');
  ({ DriverHomePage } = await import('./DriverHomePage'));
});

afterEach(cleanup);

describe('the driver’s home screen', () => {
  it('offers exactly the three things that ever happen', async () => {
    mount(<DriverHomePage />);

    /* By their Ukrainian names, in the register the client's drivers use. A
       rename to anything an office would write — «Звіт про завантаження» — is a
       red test rather than a quiet regression, because the register IS the
       product here. */
    expect(await screen.findByRole('button', { name: /ЗАВАНТАЖЕННЯ/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ВИВАНТАЖЕННЯ/i })).toBeTruthy();

    /* ЗАПРАВКА is asserted on the HOME screen specifically. Fuel logging is the
       one feature every adoption source names as the one drivers skip, and the
       reason is always that it is buried inside a trip — so «it exists
       somewhere» is not the property worth pinning. */
    expect(screen.getByRole('button', { name: /ЗАПРАВКА/i })).toBeTruthy();
  });

  it('renders the plate of the truck the bound driver drives', async () => {
    mount(<DriverHomePage />);

    /* The first truck in the seed, reached through `me` — so this is green only
       if the operation, the adapter and the capability gate all worked. The
       profile defaults to `driver`, which is the one capability `me` declares. */
    expect(await screen.findByText('АР 1234 ВС')).toBeTruthy();
  });

  it('states the queue calmly and never the word «помилка»', async () => {
    mount(<DriverHomePage />);

    /* The seed leaves this driver one event the office has not read, so the
       strip says how many are waiting. What is being pinned is the TONE: an
       unacknowledged row is a sentence about the office, never an error about
       him. A driver shown «помилка» re-takes the photograph and goes back to
       paper — the failure mode that killed the client's two previous attempts. */
    expect(await screen.findByText(/ще не прийняв офіс/)).toBeTruthy();
    expect(screen.queryByText(/помилка/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
