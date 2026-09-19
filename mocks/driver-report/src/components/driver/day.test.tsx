// mocks/driver-report/src/components/driver/day.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import type { TripStopView } from '../../domain/project';
import { DayDoneCard, RoadStopCard, StopCard, TripRailCard } from './day';

// Neither vitest project sets `globals`, so Testing Library's auto-cleanup guard (`typeof afterEach === 'function'`)
// is false and nothing unmounts between `it`s. Measured here: without this line the fourth case finds TWO
// «Подзвонити — Ірина Коваленко, диспетчер» buttons — its own and the one the third case left mounted — and fails
// on a duplicate that has nothing to do with the code. Same reason as chrome.test.tsx:13 and app/speed.test.ts:46.
afterEach(cleanup);

const stops: TripStopView[] = [
  { stop_id: 's1', state: 'done', time: '06:10–08:40', place: 'Дніпро-Корм, Вільнянськ', detail: 'Завантаження · 2 ТТН · 24,4 т', hold: null,
    status: { text: 'Прийнято диспетчером', icon: 'CheckCheck', tone: 'plain' }, departure: { text: 'виїзд — не раніше 08:40 (запис)', simulated: false } },
  { stop_id: 's2', state: 'current', time: '+52 км', place: 'Злагода, Синельникове', detail: 'Вивантаження 1 з 2 · відсіки 1–3 · ТТН 004517 · 12,000 т', hold: null, status: null, departure: null },
  { stop_id: 's3', state: 'future', time: '+116 км', place: 'Лан, Балабине', detail: 'Вивантаження 2 з 2 · відсіки 4–6 · ТТН 004518 · 12,400 т', hold: 'Фото на території заборонені', status: null, departure: null },
];

describe('the day as a road (§3.3 D-02, §6.1, §8.2 D-02 #5)', () => {
  it('draws done, current and future stops with the markers and the departure line', () => {
    const { container } = render(<TripRailCard header="Рейс Р-26-3312 · 24,4 т" source="план з BAS 20.09 17:40" stops={stops}
      markers={[{ after_stop_id: 's1', kind: 'REFUEL', text: '08:57 Заправка · ОККО Н-08' }]} emptySlot={null} />);
    expect(screen.getByText('Рейс Р-26-3312 · 24,4 т')).toBeInTheDocument();
    expect(screen.getByText('приклад')).toBeInTheDocument();
    expect(container.querySelector('[data-node="done"]')).not.toBeNull();
    expect(container.querySelector('[data-node="current"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-node="future"]')).toHaveLength(1);
    expect(screen.getByText('Фото на території заборонені')).toBeInTheDocument();
    expect(screen.getByText('08:57 Заправка · ОККО Н-08')).toBeInTheDocument();
    expect(screen.getByText('виїзд — не раніше 08:40 (запис)')).toBeInTheDocument();
    expect(screen.getByText('Прийнято диспетчером')).toBeInTheDocument();
  });
  it('times the stop from the server clock and opens «Що зараз?» from the status line', async () => {
    server.clock.set(demo('07:48'));
    const onStatus = vi.fn();
    render(<StopCard open={{ stop: { stop_id: 's1', plan_key: '3312-1', seq: 1, kind: 'LOADING', place_id: 'p', label: 'Дніпро-Корм', short: 'Дніпро-Корм, Вільнянськ',
      town: 'Вільнянськ', ttn_expected: 2, ttn_nos: [], drop_index: null, drop_count: null, compartments: null, mass_t: null, planned_km: null, no_photos: false,
      weigh_ticket: false, accepted_at: null }, arrived_at: demo('06:10'), auto: false, segment: { chip: 'QUEUE', since: demo('06:10') }, alert: null }}
      now={demo('07:48')} rc={false} onStatus={onStatus} />);
    expect(screen.getByText('Завантаження — «Дніпро-Корм»')).toBeInTheDocument();
    expect(screen.getByText('На місці 06:10')).toBeInTheDocument();
    expect(screen.getByText('1:38')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Черга · з 06:10/ }));
    expect(onStatus).toHaveBeenCalledOnce();
  });
  it('waits for instructions with the call button after «Не приймають» (D-11)', () => {
    render(<StopCard open={{ stop: { stop_id: 's2', plan_key: '3312-2', seq: 2, kind: 'DROP', place_id: 'p', label: 'Злагода', short: 'Злагода, Синельникове',
      town: 'Синельникове', ttn_expected: 0, ttn_nos: [], drop_index: 1, drop_count: 2, compartments: null, mass_t: null, planned_km: null, no_photos: false,
      weigh_ticket: false, accepted_at: null }, arrived_at: demo('10:05'), auto: false, segment: { chip: 'WAIT_ORDERS', since: demo('10:40') }, alert: null }}
      now={demo('10:50')} rc={false} onStatus={() => {}} onCall={{ name: 'Ірина Коваленко', role_label: 'диспетчер', until: '20:00', phone: '+380 67 214 55 08' }} />);
    expect(screen.getByRole('button', { name: /Чекаю вказівки · з 10:40/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подзвонити — Ірина Коваленко, диспетчер' })).toBeInTheDocument();
  });
  it('shows a road stop as a plain card with its timer and the call button', () => {
    render(<RoadStopCard road={{ key: 'k', reason: 'ALERT', since: demo('12:30') }} now={demo('12:48')}
      onCall={{ name: 'Ірина Коваленко', role_label: 'диспетчер', until: '20:00', phone: '+380 67 214 55 08' }} />);
    expect(screen.getByText('Тривога · з 12:30')).toBeInTheDocument();
    expect(screen.getByText('0:18')).toBeInTheDocument();
    expect(screen.getByText('таймер іде')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подзвонити — Ірина Коваленко, диспетчер' })).toBeInTheDocument();
  });
  it('closes the day in facts', () => {
    render(<DayDoneCard day={{ started_at: demo('05:20'), ended_at: demo('16:02'), on_shift_min: 642, on_site_min: 338, alert_min: 18, km: 234,
      docs_in_office: 5, docs_total: 5, owed: ['004517', '004518'] }} />);
    for (const t of ['Зміну закінчено 16:02', 'На зміні 05:20 – 16:02 · 10 год 42 хв', 'Документи: 5 з 5 в офісі', 'Здайте в офіс: ТТН 004517, 004518']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });
});
