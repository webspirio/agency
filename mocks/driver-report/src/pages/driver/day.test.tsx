// mocks/driver-report/src/pages/driver/day.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { atBeat, flushOutbox, renderAt, transportAs } from '../../test/harness';
import { NATALIA, PAVLO } from '../../domain/script';

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms: without this the
// second render in a file queries the first one's DOM (measured in Wave 1: one false green and one false red).
afterEach(cleanup);

describe('end of the shift (§3.3 D-14, §8.2 D-14, beat 9)', () => {
  it('saves the shift end before the confirmation and words the day without «робоч»', async () => {
    await atBeat(9);
    const { user, container } = renderAt('/shift/end');
    await user.click(await screen.findByRole('button', { name: 'Зняти' }));
    expect(await screen.findByText('+23 км від «Лану» · за планом 23')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Так, 412\u00A0589' }));
    expect(await screen.findByText('Зміну закінчено')).toBeInTheDocument();
    for (const t of ['На зміні 05:20 – 16:02 · 10 год 42 хв', 'На точках 5 год 38 хв · тривога 18 хв', '234 км', 'Документи: 5 з 5 в офісі',
      'Здайте в офіс: ТТН 004517, 004518', 'Перерви і керування — за тахографом', 'підпис водія — діятиме після наказу КТЛ']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText('зміна 05:20–16:02 · 234 км · документів 5')).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain('робоч');
    await flushOutbox(PAVLO);
    const office = transportAs(NATALIA, ['dispatcher']);
    const days = await call(office, 'listTruckDays', { params: {}, body: undefined, qry: { state: 'to-confirm', scope: 'PILOT' } });
    expect(days.data.find((d) => d.plate === 'АР 1234 ВС')!.attested_at).toBeNull();
  });
});

describe('«Мій день» (§3.3 D-15, §8.2 D-15/16)', () => {
  it('shows his facts first and the office’s lines under them (beat 10)', async () => {
    await atBeat(10);
    renderAt('/day');
    expect(await screen.findByText('06:10 Вільнянськ · завантаження')).toBeInTheDocument();
    for (const t of ['на місці 06:10–08:40 · 2 год 30 хв', 'за ТТН: прибуття 07:48', 'прочитано 412 866 · ви вибрали 412 566',
      'На зміні — за записами застосунку. Робочий час — за тахографом.']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(screen.getByText(/Прийнято диспетчером 10:09/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /вт 22\.09/ })).toBeDisabled();
  });
  it('counts his month as facts, never a score', async () => {
    await atBeat(10);
    const { container } = renderAt('/month/2026-09');
    expect(await screen.findByText('17 змін · на зміні 186 год · з них на точках 61 год')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/грн|л\/100|рейтинг/);
  });
});

/* Beyond the plan's Step-1 block: the two screens it never opens, so §8.2 D-17/18/20/21 #1 and the D-15 stop detail
   are held by a check rather than by this task's report. */
describe('«Що бачить офіс» and one stop as pictures (§3.3 D-17, D-15 stop detail)', () => {
  it('lists every section of «Що бачить офіс» (§8.2 D-17/18/20/21 #1)', async () => {
    await atBeat(10);
    renderAt('/office-sees');
    expect(await screen.findByText('Що йде в офіс')).toBeInTheDocument();
    for (const t of ['Що телефон перевіряє, але не надсилає', 'Чого немає', 'Хто бачить', 'Скільки зберігаємо',
      'Місце', 'Інтернет', 'Фото документів, числа, які ви підтвердили, час. Місце — тільки в момент натискання.',
      'Цього місяця застосунок витратив 108 МБ', 'приклад']) expect(screen.getByText(t)).toBeInTheDocument();
  });
  it('shows the stop’s pages, each with its own state line', async () => {
    await atBeat(10);
    const stopId = server.world().plannedStops.find((p) => p.plan_key === '3312-1')!.id;
    renderAt(`/day/2026-09-21/stop/${stopId}`);
    const thumbs = await screen.findAllByRole('button', { name: /Прийнято диспетчером 10:09/ });
    expect(thumbs.length).toBe(5);
  });
});
