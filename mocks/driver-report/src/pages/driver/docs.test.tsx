// mocks/driver-report/src/pages/driver/docs.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { PAVLO } from '../../domain/script';
import { rewindTo } from '../../stage/runner';
import { atBeat, flushOutbox, renderAt } from '../../test/harness';

const stopId = (key: string) => server.world().plannedStops.find((p) => p.plan_key === key)!.id;
const lastRecord = (type: string) => server.world().records.filter((r) => r.device_id === PAVLO && r.type === type).at(-1)!;
/** The parallel rule: what the flow handed to home, not home's rendering of it. */
const handed = () => server.phone(PAVLO).outbox.at(-1)!;

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms: without this a
// mounted flow outlives its test and the next query matches the previous test's DOM (measured in Wave 1).
afterEach(cleanup);

describe('loading documents (§3.3 D-07, §8.2 D-07/08 #1, beat 4)', () => {
  it('shoots the four pages in order, reviews them and records «2 ТТН, 4 стор.»', async () => {
    await atBeat(4);
    const { user } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    const titles = ['ТТН 1 з 2 — лицьовий бік', 'ТТН 1 з 2 — зворотний бік, з часом і підписом', 'ТТН 2 з 2 — лицьовий бік', 'ТТН 2 з 2 — зворотний бік'];
    for (const t of titles) {
      expect(await screen.findByText(t)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Зняти' }));
    }
    expect(await screen.findByText('Перевірте: 4 сторінки')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добре, все видно' }));
    await waitFor(() => expect(handed().receipt).toEqual({ title: 'Завантажено 08:40 · 2 ТТН, 4 стор.',
      next: 'Далі: вивантаження 1 з 2 — Злагода, Синельникове · Відсіки 1–3 · ТТН 004517' }));
    expect(handed().pages.map((p) => p.drawn_variant)).toEqual(['ttn-004517-front', 'ttn-004517-back', 'ttn-004518-front', 'ttn-004518-back:soft']);
  });
  it('says «Записую…» on the commit that carries four photographs (EC-137)', async () => {
    // `useCommitOnce` already swallows the second tap; what the driver got for it was a button that looked like it
    // had not been pressed, on the slowest commit of the route. The grid's primary carries the guard's own `busy`.
    await atBeat(4);
    const { user } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    for (let i = 0; i < 4; i += 1) {
      await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    }
    const ok = await screen.findByRole('button', { name: 'Добре, все видно' });
    await user.click(ok);
    expect(ok).toHaveTextContent('Записую…');
    expect(ok).toHaveAttribute('aria-disabled', 'true');
  });
  it('counts the flow’s steps in the header and the set’s PAGES beside the shutter', async () => {
    // Two different numbers, and one prop used to drive both. §3.3 D-07 pins the FlowHeader at «2 з 5» — four pages
    // plus the grid — while §3.3 D-06's own diagram pins the thumbnail counter at «1 з 4», the pages alone.
    await atBeat(4);
    const { user } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    expect(await screen.findByText('1 з 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText('2 з 5')).toBeInTheDocument();
    expect(screen.getByText('1 з 4 ✓')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText('3 з 5')).toBeInTheDocument();
    expect(screen.getByText('2 з 4 ✓')).toBeInTheDocument();
  });
  it('opens «Чому немає документа?» when the arrival sent the driver here for exactly that', async () => {
    // The D-04 pre-step's quiet «Немає документа» is a full answer already (§3.3 D-04). Landing him on the camera
    // and asking him to tap «Немає документа» a second time is the tap the pre-step existed to save. The hand-over
    // is `state: { noDoc: true }` on the navigation ArrivePage makes — the Wave 2 cross-page contract.
    await atBeat(4);
    const { user } = renderAt(`/stop/${stopId('3312-1')}/loaded`, { noDoc: true });
    expect(await screen.findByText('Чому немає документа?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Зняти' })).toBeNull();
    // Exactly ONE entry was pushed: Back lands on the camera, not on the reasons again. `flow.go` is a fresh
    // function on every render, so an effect that re-fired would bury the camera under a stack of them.
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(await screen.findByText('ТТН 1 з 2 — лицьовий бік')).toBeInTheDocument();
  });
  it('records a loading without ТТН after the fine warning (§8.6 #11)', async () => {
    await atBeat(4);
    const { user } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    await user.click(await screen.findByRole('button', { name: 'Немає документа' }));
    await user.click(await screen.findByRole('button', { name: 'Відправник не дав ТТН' }));
    await user.click(await screen.findByRole('button', { name: 'Записати без ТТН' }));
    await flushOutbox(PAVLO);
    expect(lastRecord('LOADED').payload).toMatchObject({ no_doc_reason: 'SHIPPER_REFUSED', pages: [] });
  });
});

describe('unloading and the deferred capture (§3.3 D-08, §8.2 D-07/08 #2–#4, beats 8–9)', () => {
  it('asks for the consignee’s signed copy and never says «печатк»', async () => {
    await atBeat(8);
    const { user, container } = renderAt(`/stop/${stopId('3312-2')}/unloaded`);
    expect(await screen.findByText('ТТН з підписом одержувача')).toBeInTheDocument();
    expect(screen.getByText('Примірник 3 — той, що повертається в КТЛ')).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain('печатк');
    await user.click(screen.getByRole('button', { name: 'Зняти' }));
    await user.click(await screen.findByRole('button', { name: 'Добре' }));
    await waitFor(() => expect(handed().receipt?.title).toBe('Вивантаження 1 з 2 · 11:50 · ТТН 004517'));
  });
  it('defers at «Лан» and later asks «5 чи 8?»', async () => {
    await atBeat(8);
    await rewindTo(demo('15:07'));              // Павло stands at «Лан» since 13:45 (S-34), not yet unloaded
    server.clock.set(demo('15:08'));
    const lan = stopId('3312-3');
    const first = renderAt(`/stop/${lan}/unloaded`);
    await first.user.click(await screen.findByRole('button', { name: 'Зніму після виїзду' }));
    await waitFor(() => expect(handed().receipt?.title).toBe('Вивантаження 2 з 2 · 15:08 · фото — після виїзду'));
    expect(handed().record).toMatchObject({ type: 'UNLOADED', payload: { deferred: 'AFTER_EXIT', pages: [] } });
    first.unmount();
    server.clock.set(demo('15:17'));
    const later = renderAt(`/stop/${lan}/later`);
    await later.user.click(await screen.findByRole('button', { name: 'Зняти' }));
    await later.user.click(await screen.findByRole('button', { name: 'Добре' }));
    await later.user.click(await screen.findByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText('На щитку 5 чи 8?')).toBeInTheDocument();
    await later.user.click(screen.getByRole('button', { name: /^5 — 412\u00A0566/ }));
    await waitFor(() => expect(handed().receipt?.title).toBe('Фото додано 15:17 · ТТН 004518 · 412\u00A0566 км'));
  });
});

/* LAST IN THE FILE, DELIBERATELY — and the plan's own ordering put it third. This is the only test that LEAVES its
 * draft behind, and `useFlow` remembers the draft an entry opened in a module-level map keyed on `location.key`,
 * which `renderAt` always creates as React Router's `"default"` for a memory router's first entry. So the next
 * `renderAt` in this file resolves THIS draft's id, finds nothing under it (`atBeat` reset the phone) and redirects
 * home one frame after the camera paints. Measured: with this test third, both unloading tests fail — the first
 * finds «ТТН з підписом одержувача» and then loses it to the redirect, the second enqueues nothing at all. The
 * INTEGRATOR NOTE on `src/app/flow.ts` says what would make the order irrelevant. */
describe('the printing contract (§3.3 D-07, Wave 2 preamble)', () => {
  it('keeps the draft as «ТТН ще друкують»', async () => {
    await atBeat(4);
    const { user, router } = renderAt(`/stop/${stopId('3312-1')}/loaded`);
    await user.click(await screen.findByRole('button', { name: 'Немає документа' }));
    await user.click(await screen.findByRole('button', { name: 'ТТН ще друкують' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(Object.values(server.phone(PAVLO).drafts).map((d) => d.data.printing)).toEqual([true]);
  });
});
