// mocks/driver-report/src/app/flow.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001'); });
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';
import { server } from '../api/server';
import { discardDraft, openDrafts, useCommitOnce, useFlow } from './flow';

function Flow() {
  const f = useFlow({ flow: 'arrive', steps: ['status', 'shoot', 'odometer'] as const, stopId: 'stop-000001', label: 'Я на місці' });
  const once = useCommitOnce();
  return (<div>
    <p>step:{f.step} {f.index + 1} з {f.total} key:{f.draft.key}</p>
    <button type="button" onClick={() => f.go('shoot')}>next</button>
    <button type="button" onClick={() => once.run(() => f.commit({ record: { key: f.draft.key } as never, pages: [], receipt: null }))}>{once.busy ? 'Записую…' : 'commit'}</button>
  </div>);
}
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <p>home</p> }, { path: '/stop/:stopId/arrive', element: <Flow /> }],
  { initialEntries: ['/', '/stop/stop-000001/arrive'], initialIndex: 1 })} />);
// Testing Library unmounts between tests only when a global `afterEach` exists, and this workspace runs without
// globals (packages/kit/src/test-setup.ts): without this a mounted flow outlives its test.
afterEach(cleanup);

describe('flows keep steps in history state (§2.2, EC-159, EC-137)', () => {
  it('mints one key when the flow opens and keeps it across steps', async () => {
    server.reset();
    mount();
    expect(await screen.findByText(/step:status 1 з 3 key:device-000001:417/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('next'));
    expect(screen.getByText(/step:shoot 2 з 3 key:device-000001:417/)).toBeInTheDocument();
    expect(openDrafts('device-000001')).toHaveLength(1);
  });
  it('commits once however fast the finger', async () => {
    server.reset();
    mount();
    const button = await screen.findByText('commit');
    await userEvent.dblClick(button);
    expect(await screen.findByText('home')).toBeInTheDocument();
    expect(server.phone('device-000001').outbox).toHaveLength(1);
    expect(openDrafts('device-000001')).toHaveLength(0);
  });
  it('lets the first commit through and no other, even two in one tick (§3.1, §8.6 #13)', () => {
    // The double click above is absorbed three times over (the page leaves, the draft is gone, enqueue dedupes on the
    // key); this is the guard itself, on its own.
    const { result } = renderHook(() => useCommitOnce());
    const fn = vi.fn();
    act(() => { result.current.run(fn); result.current.run(fn); });
    act(() => { result.current.run(fn); });
    expect([fn.mock.calls.length, result.current.busy]).toEqual([1, true]);
  });
});

/* The rules of §2.2 the two cases above do not reach: Back walks the steps, leaves on the first one with the draft
 * kept, and never re-enters a committed flow. `router.navigate(-1)` is the Android Back / mouse back button. */
function Stepper() {
  const f = useFlow({ flow: 'loaded', steps: ['shoot', 'review', 'receipt'] as const, stopId: 'stop-000001', label: 'Завантажено' });
  return (<div>
    <p>at:{f.step} key:{f.draft.key}</p>
    <button type="button" onClick={() => f.go(f.step === 'shoot' ? 'review' : 'receipt')}>forward</button>
    <button type="button" onClick={() => f.back()}>back</button>
    <button type="button" onClick={() => f.commit({ record: { key: f.draft.key } as never, pages: [], receipt: null })}>done</button>
  </div>);
}
const mountStepper = () => {
  const router = createMemoryRouter([{ path: '/', element: <p>home</p> }, { path: '/stop/:stopId/loaded', element: <Stepper /> }],
    { initialEntries: ['/', '/stop/stop-000001/loaded'], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
};

describe('Back inside a flow (§2.2, EC-159)', () => {
  it('walks back one step with the same key, and the draft remembers the step', async () => {
    server.reset();
    const router = mountStepper();
    await screen.findByText(/at:shoot key:device-000001:417/);
    await userEvent.click(screen.getByText('forward'));
    await userEvent.click(screen.getByText('forward'));
    expect(screen.getByText(/at:receipt key:device-000001:417/)).toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(await screen.findByText(/at:review key:device-000001:417/)).toBeInTheDocument();
    expect(openDrafts('device-000001').map((d) => d.step)).toEqual(['review']);
    await userEvent.click(screen.getByText('back'));
    expect(await screen.findByText(/at:shoot key:device-000001:417/)).toBeInTheDocument();
  });
  it('leaves on the first step without committing, and keeps the draft for «Продовжимо»', async () => {
    server.reset();
    mountStepper();
    await screen.findByText(/at:shoot/);
    await userEvent.click(screen.getByText('back'));
    expect(await screen.findByText('home')).toBeInTheDocument();
    expect(openDrafts('device-000001').map((d) => [d.flow, d.stop_id, d.key, d.label]))
      .toEqual([['loaded', 'stop-000001', 'device-000001:417', 'Завантажено']]);
    expect(server.phone('device-000001').outbox).toHaveLength(0);
    discardDraft('device-000001', openDrafts('device-000001')[0]!.id);
    expect(openDrafts('device-000001')).toHaveLength(0);
  });
  it('never re-enters a committed flow: Back into it lands on home and mints nothing', async () => {
    server.reset();
    const router = mountStepper();
    await screen.findByText(/at:shoot/);
    await userEvent.click(screen.getByText('forward'));
    await userEvent.click(screen.getByText('done'));
    expect(await screen.findByText('home')).toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(await screen.findByText('home')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect([openDrafts('device-000001'), server.phone('device-000001').outbox.map((e) => e.key)]).toEqual([[], ['device-000001:417']]);
    expect(server.world().devices.find((d) => d.id === 'device-000001')!.next_seq).toBe(418);
  });
});

/* The entry that opens a flow is remembered by its `location.key`, so a render React repeats finds its draft again
 * instead of minting a second one. A memory router with ONE initial entry always keys that entry with the literal
 * string 'default' — which is exactly what the page harness's `renderAt` builds — so every flow opened by a second
 * `renderAt` in the same test FILE asks about the SAME key. When the phone was rebuilt in between, the draft that key
 * names is gone, and a flow that resumes it reads «gone» and redirects home one frame after it paints. */
const mountFirstEntry = () => render(<RouterProvider router={createMemoryRouter(
  [{ path: '/', element: <p>home</p> }, { path: '/stop/:stopId/loaded', element: <Stepper /> }],
  { initialEntries: ['/stop/stop-000001/loaded'] })} />);

describe('a flow opened on the first history entry (§2.2, D11)', () => {
  it('mints its own draft when the one that entry opened before is gone', async () => {
    server.reset();
    mountFirstEntry();
    await screen.findByText(/at:shoot key:device-000001:417/);   // leaves the draft behind, uncommitted
    cleanup();
    server.reset();                                              // the rebuild `atBeat` performs: that draft is gone
    mountFirstEntry();
    expect(await screen.findByText(/at:shoot key:device-000001:417/)).toBeInTheDocument();
    expect(openDrafts('device-000001').map((d) => [d.flow, d.step])).toEqual([['loaded', 'shoot']]);
  });
});

/* «Продовжимо» resumes a draft from home. `stop_id` alone cannot rebuild every flow's route: a retake lives at
 * /request/:requestId and a put-off receipt at /refuel/:recordKey/later, and neither parameter is a stop. So the draft
 * keeps the pathname it was opened on, and home navigates back to it with the step and the draft id. */
function Retake() {
  const f = useFlow({ flow: 'retake', steps: ['shoot', 'review'] as const, label: 'Перезняти' });
  return (<div>
    <p>retake:{f.step} key:{f.draft.key}</p>
    <button type="button" onClick={() => f.go('review')}>forward</button>
    <button type="button" onClick={() => f.leave()}>leave</button>
  </div>);
}
function Home() {
  const navigate = useNavigate();
  const drafts = openDrafts('device-000001');
  return (<div><p>home</p>{drafts.map((d) => (
    <button key={d.id} type="button" onClick={() => navigate(d.path, { state: { step: d.step, draftId: d.id } })}>resume {d.label}</button>))}
  </div>);
}

describe('a draft remembers where it was opened (§3.2 «Продовжимо», D11)', () => {
  it('resumes a flow whose route names no stop — same key, same step, nothing minted', async () => {
    server.reset();
    const router = createMemoryRouter([{ path: '/', element: <Home /> }, { path: '/request/:requestId', element: <Retake /> }],
      { initialEntries: ['/', '/request/request-000007'], initialIndex: 1 });
    render(<RouterProvider router={router} />);
    await screen.findByText(/retake:shoot key:device-000001:417/);
    await userEvent.click(screen.getByText('forward'));
    await userEvent.click(screen.getByText('leave'));
    expect(openDrafts('device-000001').map((d) => [d.flow, d.stop_id, d.path, d.step]))
      .toEqual([['retake', null, '/request/request-000007', 'review']]);
    await userEvent.click(await screen.findByText('resume Перезняти'));
    expect(await screen.findByText(/retake:review key:device-000001:417/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/request/request-000007');
    expect(server.world().devices.find((d) => d.id === 'device-000001')!.next_seq).toBe(418);
  });
});
