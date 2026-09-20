import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, screen, waitFor } from '@testing-library/react';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { PAVLO } from '../../domain/script';
import { rewindTo } from '../../stage/runner';
import { atBeat, renderAt } from '../../test/harness';

// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms (Wave 1 measured one
// false green and one false red from the leak).
afterEach(cleanup);

/* The order of these tests is no longer load-bearing. `renderAt` always mounts the memory router on its FIRST
 * entry, whose key is the literal string 'default', and `useFlow` remembers which draft it minted for an entry key
 * in a module-level map — so a test that opened a flow and walked away used to leave 'default' pointing at a draft
 * the next test's rebuild had deleted, and that test's flow read as «gone» and went home. `openOnce` now trusts a
 * remembered id only while its draft is still there and still that flow's (`src/app/flow.ts`, with its own test). */

const handed = () => server.phone(PAVLO).outbox.at(-1)!;

describe('«Стою» (§3.3 D-11, §8.2 D-11, beat 8)', () => {
  it('records «Тривога / укриття» as a road stop in two taps (home turns it into mode D, W2-01)', async () => {
    await atBeat(8);
    await rewindTo(demo('12:29'));
    server.clock.set(demo('12:30'));
    const { user, router } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: 'Тривога / укриття' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect([handed().record.type, handed().record.payload, handed().receipt?.title])
      .toEqual(['ROAD_STOP', { reason: 'ALERT', can_drive: null }, 'Тривога · з 12:30']);
  });

  it('records «Не завантажили» at a loading stop and nothing more', async () => {
    await atBeat(4, { at: demo('08:20') });      // at «Дніпро-Корм» since 06:10
    const { user } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: 'Не завантажили' }));
    await waitFor(() => expect(handed().record).toMatchObject({ type: 'STOP_PROBLEM', payload: { kind: 'NOT_LOADED' } }));
    expect(handed().receipt?.title).toBe('Не завантажили · з 08:20');
    expect(handed().pages).toEqual([]);
  });

  it('asks to call before recording an accident', async () => {
    await atBeat(8);
    const { user } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: 'ДТП' }));
    expect(await screen.findByText('Спершу подзвоніть: Ірина Коваленко, диспетчер')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Записати ДТП' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Записати ДТП' }));
    await waitFor(() => expect(handed().record).toMatchObject({ type: 'ROAD_STOP', payload: { reason: 'ACCIDENT' } }));
  });

  it('«Поломка» asks whether he can drive, and «Подзвоніть мені» is one tap', async () => {
    await atBeat(8);
    const { user } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: 'Поломка' }));
    expect(await screen.findByText('Можете їхати?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Не можу їхати' }));
    await waitFor(() => expect(handed().record)
      .toMatchObject({ type: 'ROAD_STOP', payload: { reason: 'BREAKDOWN', can_drive: false } }));

    cleanup();
    const again = renderAt('/stand');
    await again.user.click(await screen.findByRole('button', { name: 'Подзвоніть мені' }));
    await waitFor(() => expect(again.router.state.location.pathname).toBe('/'));
    expect([handed().record.type, handed().receipt?.title]).toEqual(['CALL_ME', 'Попросили подзвонити · 11:50']);
  });

  it('«Є розбіжність» is a page he only reads, then records the problem', async () => {
    await atBeat(8);
    const { user, router } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: 'Є розбіжність' }));
    expect(await screen.findByText('Не згодні? Напишіть в акті, в графі «Особливі відмітки»: «Не згоден» — і підпишіть. Потім сфотографуйте акт.'))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зрозумів' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(handed().record).toMatchObject({ type: 'STOP_PROBLEM', payload: { kind: 'DISCREPANCY' } });
  });

  it('«Не приймають» files the problem against the open stop (its «Чекаю вказівки» is W2-05/W1-02)', async () => {
    await atBeat(8);
    const { user } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: 'Не приймають' }));
    await waitFor(() => expect(handed().record).toMatchObject({ type: 'STOP_PROBLEM', payload: { kind: 'NOT_ACCEPTED' } }));
    expect(handed().record.stop_id).toBe(server.world().plannedStops.find((s) => s.plan_key === '3312-2')!.id);
  });

  it("«Об'їзд» commits without a timer and says what it costs", async () => {
    await atBeat(8);
    const { user } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: "Об'їзд" }));
    await waitFor(() => expect(handed().record).toMatchObject({ type: 'ROAD_STOP', payload: { reason: 'DETOUR' } }));
    expect(handed().receipt?.title).toBe("Об'їзд з 11:50 · зайві кілометри офіс побачить без питань");
  });

  it('an alert INSIDE an open stop is a segment of that stop, not a road stop beside it (EC-58)', async () => {
    await atBeat(8);                             // «Злагода» is open: arrived 10:05, not yet unloaded
    const { user } = renderAt('/stand');
    await user.click(await screen.findByRole('button', { name: 'Тривога / укриття' }));
    await waitFor(() => expect(handed().record).toMatchObject({ type: 'SEGMENT', payload: { chip: 'ALERT' } }));
    const zlagoda = server.world().plannedStops.find((s) => s.plan_key === '3312-2')!.id;
    expect([handed().record.stop_id, handed().receipt?.title]).toEqual([zlagoda, 'Тривога / укриття · з 11:50']);
  });

  it('lists the eight road reasons, the stop’s own group, then «Подзвоніть мені» last', async () => {
    await atBeat(8);                             // at «Злагода», not yet unloaded
    renderAt('/stand');
    expect(await screen.findByText('Що сталося?')).toBeInTheDocument();
    const names = ['Тривога / укриття', 'Комендантська', 'Спека — стою', 'Блокпост', 'Поломка', "Об'їзд", 'ДТП', 'Ваговий контроль'];
    for (const n of names) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    expect(screen.getByText('На точці · Злагода')).toBeInTheDocument();
    const last = screen.getByRole('button', { name: 'Подзвоніть мені' });
    for (const n of [...names, 'Не приймають', 'Проблема з пломбою', 'Є розбіжність']) {
      expect(screen.getByRole('button', { name: n }).compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});
