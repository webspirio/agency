import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Component, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';

/**
 * THE RENDER SMOKE TEST — the one check that says the mock WORKS rather than
 * that it compiles.
 *
 * `tsc -b && vite build` and `vitest run` are both green over an OverviewPage
 * that throws on mount: the build never renders anything and the domain tests
 * never mount anything. The gate's answer to that was "open preview and confirm
 * by eye", which is prose, and prose does not propagate.
 *
 * It mounts through the real providers — the real hash router, the real
 * TanStack Query client, the real axios client with the real mock adapter — so
 * a break anywhere on that path is red here: a missing operation, an adapter
 * that resolves a 404 instead of throwing, a kit component whose props changed,
 * a seed that stopped summing to the total printed above it.
 *
 * Replace the assertions when you replace the domain. Do not delete the file:
 * it is the only thing standing between "it builds" and "it renders".
 */
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
let buildSeed: (typeof import('../domain/seed'))['buildSeed'];

beforeAll(async () => {
  vi.stubEnv('VITE_MOCK', '1');
  ({ OverviewPage } = await import('./OverviewPage'));
  ({ router } = await import('../app/router'));
  ({ buildSeed } = await import('../domain/seed'));
});

afterEach(() => {
  cleanup();
  caught.length = 0;
});

describe('the Overview screen actually renders', () => {
  it('paints the headline, the row count and the total', async () => {
    mount(<OverviewPage />);

    // The row count proves the query resolved through the adapter and the
    // handler read the STORE rather than rebuilding the seed per request.
    expect(await screen.findByText(String(buildSeed().length))).toBeTruthy();
    // The total proves the decimal string reached the DOM VERBATIM — the one
    // number a client checks on a screen share, and the one a stray
    // Number()/toFixed on the way to the tile would quietly change.
    expect(await screen.findByText('76332.20')).toBeTruthy();

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

    expect(await screen.findByText('76332.20')).toBeTruthy();
    expect(screen.queryByTestId('render-failed')).toBeNull();
    expect(caught).toEqual([]);
  });
});
