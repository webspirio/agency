// mocks/driver-report/src/test/harness.tsx
/** The page-test harness (I-17). A page test sets its profile and device in `vi.hoisted` (with `VITE_MOCK` stubbed, so
 *  `src/api/client.ts` installs the mock adapter), puts the realm's server at a beat with `atBeat`, mounts the real route
 *  tree with `renderAt`, performs "the other pane's" writes through `transportAs`, and delivers the phone's outbox with
 *  `flushOutbox`. Imported by *.test.* files only — nothing the app ships reaches this module.
 *
 *    vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001'); });
 */
import axios from 'axios';
import { afterEach, vi } from 'vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { toast } from '@agency/kit/toast';
import { mockAdapter, transport, type Transport } from '@agency/mock';
import { routes, serverNow } from '../api/routes';
import { server } from '../api/server';
import { flushNow } from '../app/outbox';
import { visibleScreens } from '../app/router';
import { addSeconds } from '../domain/clock';
import { intDiv } from '../domain/num';
import type { Instant } from '../domain/types';
import { rebuild } from '../stage/runner';

/** THE TWO TEARDOWNS EVERY FILE THAT MOUNTS A SCREEN NEEDS, in one place instead of in fourteen.
 *
 *  Neither `vitest.config.ts` at the root nor `mocks/driver-report/vite.config.ts` sets `globals: true`, so Testing
 *  Library never arms its own auto-cleanup guard and the renders of one test stay in the document for the next —
 *  measured in Wave 1 as one FALSE GREEN (a query matched the previous test's DOM) and one FALSE RED (it matched
 *  twice). The kit's toast store is worse: it is MODULE-GLOBAL, so it outlives `cleanup` entirely, and `ConsoleShell`
 *  mounts one `<Toaster />` — measured in W2-08, the CSV toast of test 1 was still on screen when test 4 mounted the
 *  shell and made an assertion about «Пілот» red for a file name it had never rendered.
 *
 *  Registering both here rather than per file is MEASURED, not assumed: a hook called while an imported module is
 *  evaluated arms for the importing file (a probe run in this task passed with it and failed without it). A file that
 *  also writes its own `afterEach(cleanup)` is unharmed — the second cleanup finds nothing left to unmount. */
afterEach(() => {
  cleanup();
  toast.dismiss();
});

/** Fake timers move only when a test turned them on; a real-timer test is left alone. */
function advanceFakeTimers(ms: number): void {
  if (vi.isFakeTimers()) vi.advanceTimersByTime(ms);
}

/** The realm's server rebuilt to «Такт n» (§5.6), its clock frozen at the beat's clock — or at `at`, which overrides
 *  it. `ui.beat` is set, so a shell's BootGate renders at once and never rebuilds under the test. */
export async function atBeat(n: number, opts: { at?: Instant } = {}): Promise<void> {
  await rebuild(n);
  if (opts.at !== undefined) server.clock.set(opts.at);
}

/** The real route tree of the profile the test's URL names, at `path`, in a fresh QueryClient that never retries.
 *  `state` is the history state the entry carries — what one screen hands the next through `navigate(to, { state })`
 *  (the Wave 2 cross-page contracts: `ArriveContext`, the loading's `noDoc`). */
export function renderAt(path: string, state?: unknown): RenderResult & { user: UserEvent; router: ReturnType<typeof createMemoryRouter> } {
  const entry = state === undefined ? path : { pathname: path, state };
  const router = createMemoryRouter(visibleScreens, { initialEntries: [entry] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { ...utils, user: userEvent.setup({ advanceTimers: advanceFakeTimers }), router };
}

/** A client over the realm's route table as `actor`, with `caps`, answering at the server clock: the other pane. */
export function transportAs(actor: { id: string; role: string }, caps: string[]): Transport {
  return transport(axios.create({ baseURL: '/api', paramsSerializer: { indexes: null },
    adapter: mockAdapter(routes, { caps: new Set(caps), actor: { id: actor.id, role: actor.role }, now: serverNow }) }));
}

/** Runs the phone's outbox to DONE with zero latency (through the app's own client, as the phone would). */
export function flushOutbox(deviceId: string): Promise<void> {
  return flushNow(deviceId);
}

/** The server clock moves on by `ms` (whole seconds) and the fake timers, when a test turned them on, by `ms`. */
export async function advance(ms: number): Promise<void> {
  server.clock.set(addSeconds(server.clock.nowIso(), intDiv(ms, 1000)));
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms);
}
