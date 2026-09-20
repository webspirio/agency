import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { server } from '../../api/server';
import { receiptState } from '../../app/outbox';
import { businessDate, DEMO_DATE } from '../../domain/clock';
import { PAVLO } from '../../domain/script';
import { atBeat, flushOutbox, renderAt } from '../../test/harness';

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms and two renders of
// the same route would sit in one document — one false green and one false red, measured in Wave 1.
afterEach(cleanup);

/** The refuels of TODAY. The seed carries Павло's 15.09 and 18.09 fills as history (§7.6), so «the console shows no
 *  refuel until «Офлайн» is off» is a statement about the demo day, not about the whole world. */
const refuelsToday = () => server.world().records
  .filter((r) => r.type === 'REFUEL' && r.device_id === PAVLO && businessDate(r.occurred_at) === DEMO_DATE);

/** Everything on screen EXCEPT the drawn paper. The drawn receipt is a photograph of a receipt and prints its own
 *  litres and payment line (§6.11); what §8.2 D-10 #2 forbids is the APP asking for them or showing them as data. */
function chromeOf(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const paper of clone.querySelectorAll('[data-artefact]')) paper.remove();
  return clone.textContent ?? '';
}

describe('refuel, receipt first (§3.3 D-10, §8.2 D-10, beat 7)', () => {
  it('reads the receipt, never asks litres or payment, then confirms 412 398 — offline first', async () => {
    await atBeat(7);
    server.setToggle('offline', true);
    const { user, container } = renderAt('/refuel');
    expect(await screen.findByText('Сфотографуйте чек')).toBeInTheDocument();
    expect(screen.getByText('Чек цілком, з QR-кодом')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText(/ОККО · 21\.09 08:57 · 22\s800,00 грн · чек 58213 · картка \*\*\*\*4417/)).toBeInTheDocument();
    expect(screen.getByText('Бак повний')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'так' })).toBeChecked();
    for (const never of ['250,00', 'Готівка', 'Своя картка', 'Картка КТЛ']) expect(chromeOf(container)).not.toContain(never);
    await user.click(screen.getByRole('button', { name: 'Добре' }));
    await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText('+7 км · за планом 7')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Так, 412 398' }));
    // The parallel rule: the receipt the flow handed to home, and its state — home (W2-01) renders it.
    const handed = () => server.phone(PAVLO).outbox.at(-1)!;
    await waitFor(() => expect(handed().receipt?.title).toBe('Заправка 08:57 · 412 398 км'));
    expect(receiptState(handed(), true, server.clock.nowIso()).text).toBe('Збережено в телефоні · №0422 · надішлеться сам');
    expect(handed().record.payload).toMatchObject({ station: 'ОККО Н-08', receipt_no: '58213', rro_no: '3000211458',
      sum_uah: '22800.00', card_mask: '****4417', full_tank: true, deferred: false,
      odometer: { value: 412398, source: 'DASH_PHOTO', basis: 'PLANNED_KM', choice: 'CONFIRMED' } });
    expect(handed().pages.map((p) => p.artefact)).toEqual(['RECEIPT', 'CLUSTER']);
    expect(refuelsToday()).toHaveLength(0);
    server.setToggle('offline', false);
    await flushOutbox(PAVLO);
    expect(handed().state).toBe('DONE');
    expect(receiptState(handed(), false, server.clock.nowIso()).text).toMatch(/^В офісі ✓/);
    expect(refuelsToday()).toHaveLength(1);
  });

  it('«Зніму пізніше» commits the stub, and the later flow adds the receipt alone (D7)', async () => {
    await atBeat(7);
    const { user, router } = renderAt('/refuel');
    await user.click(await screen.findByRole('button', { name: 'Зніму пізніше' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const stub = server.phone(PAVLO).outbox.at(-1)!;
    expect(stub.record.type).toBe('REFUEL');
    expect(stub.record.payload).toMatchObject({ deferred: true, odometer: null });
    expect(stub.pages).toEqual([]);
    expect(stub.receipt).toEqual({ title: 'Заправка 08:57', next: 'Потрібно від вас: чек із заправки 08:57' });

    await flushOutbox(PAVLO);
    cleanup();
    const later = renderAt(`/refuel/${stub.record.key}/later`);
    expect(await screen.findByText('Сфотографуйте чек')).toBeInTheDocument();
    await later.user.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText(/ОККО · 21\.09 08:57 · 22\s800,00 грн/)).toBeInTheDocument();
    expect(screen.queryByText('Бак повний')).toBeNull();
    await later.user.click(screen.getByRole('button', { name: 'Добре' }));
    await waitFor(() => expect(later.router.state.location.pathname).toBe('/'));
    const added = server.phone(PAVLO).outbox.at(-1)!;
    expect(added.record.type).toBe('DOCS_ADDED');
    expect(added.record.stop_id).toBeUndefined();
    expect(added.record.payload).toMatchObject({ odometer: null, deferred: 'AT_PARKING' });
    expect(added.pages.map((p) => p.artefact)).toEqual(['RECEIPT']);
    // W0-15 files a stop-less DOCS_ADDED — and its page — against the device's newest deferred refuel (D7).
    await flushOutbox(PAVLO);
    expect(server.world().pages.filter((p) => p.record_key === stub.record.key).map((p) => p.artefact)).toEqual(['RECEIPT']);
  });
});
