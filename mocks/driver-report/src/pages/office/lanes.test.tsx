// mocks/driver-report/src/pages/office/lanes.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { cleanup, screen, within } from '@testing-library/react';
import { demo } from '../../domain/clock';
import { atBeat, renderAt } from '../../test/harness';

// Neither vitest config sets `globals: true`, so Testing Library never arms its auto-cleanup and the renders of one
// file leak into each other — measured in Wave 1 as one false green and one false red.
afterEach(cleanup);

describe('«Перевірка» and «Зараз» (§4.2 C-02, C-03, §8.3 C-02/C-03)', () => {
  it('beat 5: one loading to check, opening the paper-mirror', async () => {
    await atBeat(5);
    const { user, router } = renderAt('/inbox/review');
    expect(await screen.findByText('Вільнянськ · завантаження · 2 ТТН, 4 стор. · поля не підтверджено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Перевірити' }));
    expect(router.state.location.pathname).toMatch(/^\/stop\//);
  });
  it('beat 10: eleven items in three groups, Ярошенко’s evidence, the self-closed footer', async () => {
    await atBeat(10);
    renderAt('/inbox/review');
    for (const g of ['Тримає рахунок', 'Одометр', 'Інше']) expect(await screen.findByText(g)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: "З'ясовано ▾" })).toHaveLength(11);
    // U+0020, not the rendered U+00A0: Testing Library normalises the NODE's NBSP to a space, never the matcher.
    expect(screen.getByText('318 405 · введено вручну · очікували ~381 402 · водій залишив як є')).toBeInTheDocument();
    expect(screen.getByText('Закрилось само сьогодні: 23')).toBeInTheDocument();
  });
  it('opens the correction dialog for an operator, prefilled with what was expected (§4.2 C-03 FIX → C-05)', async () => {
    await atBeat(10);
    const { user } = renderAt('/inbox/review');
    await user.click(await screen.findByRole('button', { name: 'Виправити' }));
    expect(await screen.findByText('Виправити одометр · початок зміни')).toBeInTheDocument();
    // U+00A0, kept: `toHaveValue` reads a property and normalises nothing — unlike `getByText`, which turns the
    // NODE's NBSP into a space. The two matchers need the two different bytes for the same rendered string.
    expect(screen.getByLabelText('Нове значення, км')).toHaveValue('381\u00A0402');
  });
  // The row's one visible control is `ExceptionRow`'s primary, and the kit owns that button: the page holds the
  // popover's open state and gives `CallPopover` a 1 px anchor to sit under (the round's integrator note, applied).
  it('«Подзвонити» opens the number from a row that owns no trigger of its own (§4.2 C-02)', async () => {
    await atBeat(10, { at: demo('16:05') });
    const { user } = renderAt('/inbox/now');
    const call = (await screen.findAllByRole('button', { name: 'Подзвонити' }))[0]!;
    expect(screen.queryByText(/^\+380( \d{2,3}){4}$/)).toBeNull();
    await user.click(call);
    expect(await screen.findByText(/^\+380( \d{2,3}){4}$/)).toBeInTheDocument();
  });
  it('resolves only with a reason and names who did it', async () => {
    await atBeat(10, { at: demo('16:05') });
    const { user } = renderAt('/inbox/now');
    const row = (await screen.findAllByRole('article'))[0]!;
    await user.click(within(row).getByRole('button', { name: "З'ясовано ▾" }));
    await user.click(within(row).getByRole('button', { name: 'Водій пояснив телефоном' }));
    expect(await screen.findByText('З\'ясувала Н. Шевчук 16:05')).toBeInTheDocument();
  });
});
