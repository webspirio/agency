// mocks/driver-report/src/pages/driver/HomePage.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen, within } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { enqueue } from '../../app/outbox';
import { buildRecord } from '../../app/records';
import { demo } from '../../domain/clock';
import { NATALIA, PAVLO } from '../../domain/script';
import { rewindTo } from '../../stage/runner';
import { atBeat, flushOutbox, renderAt, transportAs } from '../../test/harness';

const accents = () => document.querySelectorAll('[data-accent]');

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms: without this the
// previous test's DOM is still mounted and a query matches it (one false green and one false red, measured in Wave 1).
afterEach(cleanup);

describe('home decides the one next action (§3.2, §8.2 D-02)', () => {
  it('mode A at 05:14: the plan, the plates, the base reading, «Почати зміну»', async () => {
    await atBeat(0);
    renderAt('/');
    expect(await screen.findByText('Ваш рейс сьогодні: Вільнянськ → Синельникове → Балабине')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Номер АР 1234 ВС' })).toBeInTheDocument();
    expect(screen.getByText('причіп')).toBeInTheDocument();
    expect(screen.getByText('Одометр 412 355 км · вчора 17:48 · база')).toBeInTheDocument();
    expect(accents()).toHaveLength(1);
    expect(within(accents()[0] as HTMLElement).getByText('Почати зміну')).toBeInTheDocument();
  });
  it('mode C at 07:48: the stop, «На місці 06:10», the hero «1:38», «Черга · з 06:10»', async () => {
    await atBeat(4, { at: demo('07:48') });
    renderAt('/');
    expect(await screen.findByText('Завантаження — «Дніпро-Корм»')).toBeInTheDocument();
    expect(screen.getByText('1:38')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Черга · з 06:10/ })).toBeInTheDocument();
    expect(within(accents()[0] as HTMLElement).getByText('Завантажено — фото ТТН')).toBeInTheDocument();
  });
  it('mode D: a road stop with its timer, the on-call person and «Закінчилось»', async () => {
    await atBeat(8);
    await rewindTo(demo('12:29'));              // S-26 unloads at «Злагода», so no stop is open
    server.clock.set(demo('12:30'));
    const seq = server.mintSeq(PAVLO);
    enqueue(PAVLO, { record: buildRecord({ deviceId: PAVLO, seq, occurredAt: demo('12:30'), committedAt: demo('12:30') }, 'ROAD_STOP', { reason: 'ALERT', can_drive: null }),
      pages: [], receipt: { title: 'Тривога · з 12:30', next: null } });
    await flushOutbox(PAVLO);
    renderAt('/');
    // Home shows this string TWICE here, by design: the RoadStopCard's own title (§3.3 D-02 «RoadStopCard»)
    // and the receipt of the commit that opened the stop (§3.3 D-02 «ReceiptCard», whose pinned titles
    // include «Тривога · з 12:30»). `findByText` rejects that as ambiguous, so each is named by the element
    // that must carry it and the pair is counted — strictly more than the one match the plan's line asked for.
    expect(await screen.findByRole('heading', { name: 'Тривога · з 12:30' })).toBeInTheDocument();
    expect(screen.getAllByText('Тривога · з 12:30')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Подзвонити — Ірина Коваленко, диспетчер' })).toBeInTheDocument();
    expect(within(accents()[0] as HTMLElement).getByText('Закінчилось')).toBeInTheDocument();
  });
  it('mode E after 16:03: the day in facts and no accent', async () => {
    await atBeat(10);
    renderAt('/');
    expect(await screen.findByText('Зміну закінчено 16:02')).toBeInTheDocument();
    for (const t of ['На зміні 05:20 – 16:02 · 10 год 42 хв', 'Документи: 5 з 5 в офісі', 'Здайте в офіс: ТТН 004517, 004518']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(accents()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Почати нову зміну' })).toBeInTheDocument();
  });
  it('beat 5: the request card sits above the primary and opens exactly that page', async () => {
    await atBeat(5);
    const loadedKey = server.scriptRefs['S-10']!;
    await call(transportAs(NATALIA, ['dispatcher']), 'createRequest', { params: {}, body: { type: 'RETAKE_PHOTO', record_key: loadedKey, page_key: `${loadedKey}:p4`, reasons: ['BLUR'] } });
    const { user, router } = renderAt('/');
    const card = await screen.findByRole('button', { name: /Потрібно від вас \(1\) · Диспетчер просить перезняти: ТТН 2 з 2, зворотний бік — розмито/ });
    await user.click(card);
    expect(router.state.location.pathname).toMatch(/^\/request\//);
  });
  it('offline: the strip holds, no dialog appears', async () => {
    await atBeat(7);
    server.setToggle('offline', true);
    const seq = server.mintSeq(PAVLO);
    enqueue(PAVLO, { record: buildRecord({ deviceId: PAVLO, seq, occurredAt: demo('08:57'), committedAt: demo('08:58') }, 'CALL_ME', {}), pages: [], receipt: null });
    renderAt('/');
    expect(await screen.findByText(/1 запис чекає інтернету · останній зв'язок/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    server.setToggle('offline', false);
  });
  it('never shows a UTC time, «0 км» or a caps eyebrow (§8.2 D-02 #10)', async () => {
    await atBeat(3);
    const { container } = renderAt('/');
    // Twice again, and again by design: §3.2 row 6 makes the mode-B primary «Я на місці» over the next stop's
    // short name, and §3.3 D-02 puts the same short name on its TripRail row.
    expect(await screen.findAllByText('Дніпро-Корм, Вільнянськ')).toHaveLength(2);
    expect(container.textContent).not.toMatch(/\b03:10\b|\b0 км\b|\b0 л\b/);
    expect(container.innerHTML).not.toMatch(/uppercase/);
  });
  it('keeps a «ТТН ще друкують» draft as its own card (D-06, the Wave 2 printing contract)', async () => {
    await atBeat(4);
    const stopId = server.world().plannedStops.find((p) => p.plan_key === '3312-1')!.id;
    server.phone(PAVLO).drafts['draft-1'] = { id: 'draft-1', flow: 'loaded', stop_id: stopId, seq: 419, key: 'device-000001:419',
      occurred_at: demo('08:40'), step: 'shoot', data: { printing: true }, pages: [], created_wall: Date.now(), label: 'Завантаження', path: `/stop/${stopId}/loaded` };
    renderAt('/');
    expect(await screen.findByText('ТТН ще друкують — сфотографуйте, щойно дадуть')).toBeInTheDocument();
  });
});
