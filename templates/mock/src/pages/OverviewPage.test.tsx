import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Component, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { overview } from '../domain/calc';

/**
 * THE RENDER SMOKE TEST — the one check that says the mock WORKS rather than
 * that it compiles.
 *
 * `tsc -b && vite build` and `vitest run` are both green over an OverviewPage
 * that throws on mount: the build never renders anything and the domain tests
 * never mount anything. The gate's answer to that was "open preview and
 * confirm by eye", which is prose, and prose does not propagate. This file is
 * the same confirmation as a check that goes red.
 *
 * It mounts through the real providers — the real hash router, the real
 * TanStack Query client, the real axios client with the real mock adapter — so
 * a break anywhere on that path is red here: a missing route, an adapter that
 * resolves a 404 instead of throwing, a kit component whose props changed, a
 * seed that stopped summing to the total printed above it.
 *
 * Replace the assertions when you replace `types/seed/calc`. Do not delete the
 * file: it is the only thing standing between "it builds" and "it renders".
 */

/** Pinned so the assertion is about the data, not about the clock. */
const NOW = '2026-09-09T08:30:00.000Z';

/** Anything React throws while mounting lands here instead of in a console
 *  nobody reads. An empty array is part of the assertion. */
const caught: string[] = [];

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    caught.push(error.message);
  }
  override render() {
    return this.state.failed ? <p data-testid="render-failed" /> : this.props.children;
  }
}

function mount(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <Boundary>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Boundary>,
  );
}

/** The adapter is selected by `import.meta.env.VITE_MOCK` in src/api/client.ts.
 *  `vite.config.ts` defines it for this package's own runner; the workspace
 *  runner collects `mocks/*` with no `define`, so it is stubbed here and the
 *  module graph is imported afterwards. Static imports would be hoisted above
 *  the stub and evaluate the client with no adapter. */
let OverviewPage: (typeof import('./OverviewPage'))['OverviewPage'];
let router: (typeof import('../app/router'))['router'];

beforeAll(async () => {
  vi.stubEnv('VITE_MOCK', '1');
  ({ OverviewPage } = await import('./OverviewPage'));
  ({ router } = await import('../app/router'));
});

afterEach(() => {
  cleanup();
  caught.length = 0;
});

describe('the Overview screen actually renders', () => {
  it('paints the headline, the total and every seeded row', async () => {
    const expected = overview(NOW);
    mount(<OverviewPage />);

    // Not a snapshot: each of these is a different way the screen can be dead.
    // The headline proves the query resolved through the adapter at all.
    expect(await screen.findByText(expected.headline)).toBeTruthy();
    // The total proves the decimal string reached the DOM VERBATIM — the one
    // number a client checks on a screen share, and the one a stray
    // Number()/toFixed on the way to the tile would quietly change.
    expect(await screen.findByText(expected.total)).toBeTruthy();
    // The table proves the kit's DataTable got rows, not an empty state.
    // getAllByText, not getByText: it still throws when a row is MISSING, and
    // it does not turn a seed where two generated names happen to collide into
    // a red that is about the corpus rather than about the screen.
    for (const party of expected.parties) {
      expect(screen.getAllByText(party.name).length).toBeGreaterThan(0);
      expect(screen.getAllByText(party.balance).length).toBeGreaterThan(0);
    }

    // The error path renders a different screen that is ALSO not a crash, so
    // "something rendered" is not enough — say which screen.
    expect(screen.queryByText(/did not come back/)).toBeNull();
    expect(screen.queryByTestId('render-failed')).toBeNull();
    expect(caught).toEqual([]);
  });

  it('is what `#/` resolves to through the real hash router', async () => {
    // createHashRouter + the capability filter in src/app/router.tsx. A screen
    // filtered out by the current profile, or a router that never matches,
    // renders nothing at all and every assertion above would still pass when
    // aimed at the page directly.
    window.location.hash = '#/';
    mount(<RouterProvider router={router} />);

    expect(await screen.findByText(overview(NOW).headline)).toBeTruthy();
    expect(screen.queryByTestId('render-failed')).toBeNull();
    expect(caught).toEqual([]);
  });
});
