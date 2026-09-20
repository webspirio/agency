// mocks/driver-report/src/pages/driver/requests.test.tsx
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { NATALIA, PAVLO } from '../../domain/script';
import { atBeat, flushOutbox, renderAt, transportAs } from '../../test/harness';

afterEach(cleanup);

let visible: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void = () => {};
beforeAll(() => {
  globalThis.IntersectionObserver = class {
    constructor(cb: (e: never[]) => void) { visible = (e) => cb(e as never); }
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  } as never;
});

describe('office requests (§3.3 D-13, §2.4, §8.2 D-13, beat 5)', () => {
  it('marks a request seen after a second on screen, then retakes exactly that page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await atBeat(5);
    const key = server.scriptRefs['S-10']!;
    const req = await call(transportAs(NATALIA, ['dispatcher']), 'createRequest', { params: {}, body: { type: 'RETAKE_PHOTO', record_key: key, page_key: `${key}:p4`, reasons: ['BLUR'] } });
    const list = renderAt('/requests');
    expect(await screen.findByText('Перезняти: ТТН 2 з 2, зворотний бік')).toBeInTheDocument();
    expect(screen.getByText('Розмито')).toBeInTheDocument();
    for (const t of ['Зроблю на зупинці', 'Документа немає', 'Подзвоніть мені']) expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    act(() => visible([{ isIntersecting: true, intersectionRatio: 0.6 }]));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    await flushOutbox(PAVLO);
    expect(server.world().requests.find((r) => r.id === req.id)!.seen_at).not.toBeNull();
    list.unmount();
    const deep = renderAt(`/request/${req.id}`);
    expect(await screen.findByText('Диспетчер просить: Розмито')).toBeInTheDocument();
    expect(screen.getByText('Було так')).toBeInTheDocument();
    await deep.user.click(screen.getByRole('button', { name: 'Зняти' }));
    await deep.user.click(await screen.findByRole('button', { name: 'Добре' }));
    await waitFor(() => expect(server.phone(PAVLO).outbox.at(-1)!.receipt?.title).toBe('Фото замінено · ТТН 2 з 2, зворотний бік'));
    await flushOutbox(PAVLO);
    expect(server.world().requests.find((r) => r.id === req.id)!.done_at).not.toBeNull();
    vi.useRealTimers();
  });
  it('says so when nothing is asked', async () => {
    await atBeat(2);
    renderAt('/requests');
    expect(await screen.findByText('Від диспетчера нічого не потрібно')).toBeInTheDocument();
  });
});
