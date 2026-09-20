/** W2-07 — «Дні на підтвердження» (C-07), «Подорожній лист» (C-08) and «Друк» (C-09).
 *
 *  THREE DEVIATIONS FROM THE PLAN'S STEP-1 BLOCK, each a measurement rather than a preference:
 *
 *  1. `afterEach(cleanup)`. Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never
 *     arms and a render leaks into the next test of the file (the Wave 1 measurement: one false green, one false red).
 *  2. The odometer matcher is written with U+0020 where the plan escapes a U+00A0. `fmtKm` emits U+00A0, the default
 *     normalizer turns a NODE's U+00A0 into U+0020 and never touches the matcher, so the plan's matcher cannot
 *     match. The Wave 1 gate's NBSP rescan read RAW bytes and could not see this one, which the plan spells as an
 *     escape. The RENDERED string still carries its U+00A0: the matcher moved, not the copy.
 *  3. The timeline rows are `listitem`s, not `row`s. The frozen W1-05 `Timeline` renders `<ol><li>` (a moment with a
 *     length is one row, not a table cell), and `listitem` does not support name-from-content — measured: a probe
 *     `<ol><li>ВОДІЙ…` answers `queryAllByRole('listitem', { name: /ВОДІЙ|ТТН/ })` with 0 and `…('row', …)` with 0, so
 *     the plan's `getAllByRole('row', { name: /ВОДІЙ|ТТН/ })` can never pass against the kit this task must consume.
 *     What §8.3 C-08 #2 actually asks — «the timeline of 15 rows each with a source badge» — is asserted whole:
 *     fifteen rows, and fifteen of them carrying a source word. */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { act, cleanup, screen, within } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { demo } from '../../domain/clock';
import { PAVLO } from '../../domain/script';
import { atBeat, renderAt, transportAs } from '../../test/harness';

afterEach(cleanup);

const dayId = (plate: string, date: string) => {
  const w = server.world();
  const t = w.trucks.find((x) => x.plate === plate)!;
  return w.truckDays.find((d) => d.truck_id === t.id && d.date === date)!.id;
};

describe('the truck-day (§4.2 C-07 … C-09, §8.3 C-07/C-08, C-09)', () => {
  it('beat 0: Friday’s waybill read-only, with the disabled КЕП button', async () => {
    await atBeat(0);
    renderAt(`/day/${dayId('АР 1234 ВС', '2026-09-18')}`);
    expect(await screen.findByText('Подорожній лист № ПЛ-000398 від 18.09.2026')).toBeInTheDocument();
    for (const t of [/212 км · з вантажем 98/, /32,3 л\/100 проти 32,0 \(базова\)/, /на зміні 11 год 33 хв/,
      /підтверджено Н\. Шевчук 18\.09 17:05 · надруковано · водій підписав 17:10/]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Закрити КЕП — після наказу КТЛ' })).toBeDisabled();
  });

  it('beat 10: the draft, the four cells, fifteen timeline rows with sources, no «0 л»', async () => {
    await atBeat(10);
    const { container } = renderAt(`/day/${dayId('АР 1234 ВС', '2026-09-21')}`);
    expect(await screen.findByText('Подорожній лист · 21.09.2026')).toBeInTheDocument();
    expect(screen.getByText('Чернетка електронного подорожнього листа · до наказу КТЛ')).toBeInTheDocument();
    for (const t of ['412 355 → 412 589', '31,8 л/100', '10 год 42 хв', 'Залишки: немає даних з Регіс (фаза 1) · факт за день не рахується']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    const moments = within(screen.getByRole('tabpanel')).getAllByRole('listitem');
    expect(moments).toHaveLength(15);
    expect(moments.filter((r) => /ВОДІЙ|ТТН/.test(r.textContent ?? ''))).toHaveLength(15);
    expect(container.textContent).not.toMatch(/(^|\s)0 л/);
  });

  it('confirms once on a double click, stamps ПЛ-000412 and offers printing', async () => {
    await atBeat(10, { at: demo('16:06') });
    const { user } = renderAt(`/day/${dayId('АР 1234 ВС', '2026-09-21')}`);
    await user.dblClick(await screen.findByRole('button', { name: 'Підтвердити день' }));
    expect(await screen.findByText('Подорожній лист № ПЛ-000412 від 21.09.2026')).toBeInTheDocument();
    expect(screen.getByText('Підтверджено Н. Шевчук 21.09 16:06')).toBeInTheDocument();
    expect(server.world().truckDays.filter((d) => d.waybill_no === 'ПЛ-000412')).toHaveLength(1);
    expect(server.world().truckDays.filter((d) => d.waybill_no === 'ПЛ-000413')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /Друкувати подорожній лист/ })).toBeInTheDocument();
  });

  it('lists four legs, two loaded with 24,4 and 12,4 т', async () => {
    await atBeat(10);
    const { user } = renderAt(`/day/${dayId('АР 1234 ВС', '2026-09-21')}`);
    await user.click(await screen.findByRole('tab', { name: 'Ділянки' }));
    const rows = within(screen.getByRole('tabpanel')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/База.*Дніпро-Корм.*порожній.*36/), expect.stringMatching(/з вантажем.*59.*24,4/),
      expect.stringMatching(/з вантажем.*116.*12,4/), expect.stringMatching(/Лан.*База.*порожній.*23/)]);
  });

  it('renders an example day whole, with UC-O15’s «зі слів водія» row', async () => {
    await atBeat(10);
    renderAt(`/day/${dayId('АР 0633 КХ', '2026-09-21')}`);
    expect(await screen.findByText('Подорожній лист · 21.09.2026')).toBeInTheDocument();
    const moments = within(screen.getByRole('tabpanel')).getAllByRole('listitem');
    expect(moments).toHaveLength(1);
    expect(moments[0]?.textContent).toMatch(/ЗІ СЛІВ.*зі слів водія · дзвінок 09:12 · О\. Кравець/);
  });

  it('prints the A4 sheet and tells the driver (§8.3 C-09)', async () => {
    await atBeat(11);
    renderAt(`/day/${dayId('АР 1234 ВС', '2026-09-21')}/print`);
    expect(await screen.findByText('ПОДОРОЖНІЙ ЛИСТ ВАНТАЖНОГО АВТОМОБІЛЯ № ПЛ-000412')).toBeInTheDocument();
    expect(screen.getByText(/Водій: Ватаманюк П\. ________/)).toBeInTheDocument();
    expect(screen.getByText('Сформовано з записів водія · підтвердила Н. Шевчук 21.09 16:06')).toBeInTheDocument();
    // §4.2 C-09 pins «Рух і одометр» as FIVE columns. «Місце» is `TimelineRow.place_short` since the Wave 2 round
    // gate — the domain's answer, not the place picked back out of the event sentence beside it.
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent))
      .toEqual(['Час', 'Подія', 'Місце', 'Одометр, км', 'Джерело']);
    expect(screen.getAllByText('Дніпро-Корм, Вільнянськ').length).toBeGreaterThan(0);
    const day = await call(transportAs({ id: PAVLO, role: 'driver' }, ['driver']), 'getMyDay', { params: { date: '2026-09-21' }, body: undefined });
    expect(day.printed_at).not.toBeNull();
  });
});

/** C-07 is in §4.2 and in this task's acceptance, and the plan's Step-1 block does not reach it — a page with no test
 *  is a page whose check cannot fail. The list is asserted where it decides something: the count in the segment label,
 *  the columns of the one real row, and the row opening its own day. */
describe('«Дні на підтвердження» (§4.2 C-07)', () => {
  // 1 440 px, not jsdom's default 1 024: §8.3 C-07 states the column set at 1 440 and W3-06 folded «Км» and
  // «Документи» into their neighbours below `wide` so that eight columns fit the 690 px pane of a 946 px console
  // (§8.6 #22). A test that does not say which width it is asserting is asserting whichever one jsdom guessed.
  it('beat 10: the waiting count, the pilot row’s columns, and the row opening its waybill', async () => {
    act(() => { window.innerWidth = 1440; window.dispatchEvent(new Event('resize')); });
    await atBeat(10);
    const { user, router } = renderAt('/days');
    expect(await screen.findByRole('heading', { name: 'Дні на підтвердження' })).toBeInTheDocument();
    expect(screen.getByText('День — це подорожній лист машини за зміну. Підтверджений день стає лише для читання і йде у файл для BAS.')).toBeInTheDocument();
    // The count settles after the list read, and it is the count of the BEAT'S OWN SCOPE: «Такт 10» runs the console
    // in «Весь парк · 100 (приклад)» and SCRIPT pins its days_to_confirm at 7. §4.2 C-07's «· 1» is the pilot figure.
    expect(await screen.findByRole('radio', { name: 'На підтвердження · 7' })).toBeInTheDocument();
    for (const name of ['Підтверджені', 'У BAS']) expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Ватаманюк П\./ });
    for (const t of ['Ватаманюк П.', 'пн 21.09', '05:20–16:02', '234', '5 з 5', 'підтвердив 16:03']) {
      expect(within(row).getByText(t)).toBeInTheDocument();
    }
    expect(within(row).getByRole('img', { name: 'Номер АР 1234 ВС' })).toBeInTheDocument();
    await user.click(row);
    expect(router.state.location.pathname).toBe(`/day/${dayId('АР 1234 ВС', '2026-09-21')}`);
  });
});
