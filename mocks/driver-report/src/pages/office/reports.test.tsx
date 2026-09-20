// mocks/driver-report/src/pages/office/reports.test.tsx
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { cleanup, screen, within } from '@testing-library/react';
import { toast } from '@agency/kit/toast';
import { server } from '../../api/server';
import { atBeat, renderAt } from '../../test/harness';

beforeAll(() => { URL.createObjectURL = vi.fn(() => 'blob:mock'); URL.revokeObjectURL = vi.fn(); });
// Neither vitest config sets `globals: true`, so Testing Library's auto-cleanup guard never arms and renders
// leak between the tests in a file (measured in Wave 1: one false green, one false red).
afterEach(cleanup);
// The kit's toast store is MODULE-GLOBAL and outlives `cleanup`, so the CSV toast the first test raises is still in it
// when the fourth mounts `ConsoleShell`'s one `<Toaster />` — and «…21.09.2026.csv…» then fails the D18 date check on a
// page that carries no date at all. Measured 20.09: without this line test 4 is red for test 1's reason.
afterEach(() => { toast.dismiss(); });

describe('reports on the demo path (§4.2 C-10, C-12, C-13, C-17)', () => {
  it('beat 6: three key points, Олег’s simulated, and a CSV without a dialog', async () => {
    await atBeat(6);
    const { user } = renderAt('/key-points');
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent);
    // plates render with NBSP inside the Plate component, hence «.» between their parts
    expect(rows).toEqual([expect.stringMatching(/АР.7390.ЕВ.*Дніпро-Корм.*06:05.*07:44 \(запис\).*356\u00A0154.*ФОТО/),
      expect.stringMatching(/АР.1234.ВС.*Дніпро-Корм.*06:10.*08:40 \(запис\).*412\u00A0391.*ФОТО/),
      expect.stringMatching(/АР.9012.МК.*Дніпро-Корм.*08:05.*—.*241\u00A0512.*CAN.*імітація/)]);
    await user.click(screen.getByRole('button', { name: 'Завантажити CSV' }));
    expect(await screen.findByText('Файл КТЛ-ключові-точки-21.09.2026.csv · 3 рядки · збережено')).toBeInTheDocument();
  });
  it('beat 12: АР 8150 КС on top with the hatch, the next at most +3,4 %, «Що це дає» all examples', async () => {
    await atBeat(12);
    const { container } = renderAt('/trucks');
    const table = await screen.findByRole('table');
    const [first, second] = within(table).getAllByRole('button');
    expect(first!.textContent).toMatch(/АР.8150.КС.*33,9.*CAN.*32,0.*\+5,9\u00A0%/);
    expect(first!.querySelector('.hatch')).not.toBeNull();
    expect(second!.textContent).toMatch(/(\u2212\d+|\+?[0-3]),\d\u00A0%/);       // at most +3,x
    expect(second!.textContent).not.toMatch(/\+([4-9]|\d{2,}),\d\u00A0%/);
    expect(second!.querySelector('.hatch')).toBeNull();
    expect(within(container.querySelector('[data-panel="what-it-gives"]') as HTMLElement).getAllByText('приклад')).toHaveLength(4);
  });
  it('shows АР 8150 КС fuel with one mismatch on 18.09 and no ПДВ column', async () => {
    await atBeat(12);
    const truck = server.world().trucks.find((t) => t.plate === 'АР 8150 КС')!;
    const { container } = renderAt(`/trucks/${truck.id}/fuel`);
    expect(await screen.findByText('Норму КТЛ не затверджено — надлишок для ПДВ не рахується')).toBeInTheDocument();
    // §4.2 C-13: the PLATE is the heading, and it sits inside the console's own `PageHead` <h1> rather than in a
    // second header this page draws for itself (`PageHead.title` takes a ReactNode since the Wave 2 round gate).
    expect(within(screen.getByRole('heading', { level: 1 })).getByRole('img', { name: 'Номер АР 8150 КС' })).toBeInTheDocument();
    expect(screen.getByText(/18\.09 11:52/)).toBeInTheDocument();
    expect(screen.getByText(/або злив, або гора/)).toBeInTheDocument();
    expect(container.querySelectorAll('th')).not.toContainEqual(expect.objectContaining({ textContent: 'ПДВ' }));
  });
  it('beat 13: the offer — scope, weeks, what KTL decides — and no price or start date (D18)', async () => {
    await atBeat(13);
    const { container } = renderAt('/pilot');
    expect(await screen.findByText('Пілот · 3 водії · 1 диспетчер · 3 тижні')).toBeInTheDocument();
    expect(screen.getByText('Не тахограф, не медогляд і не система е-ТТН — воно з ними працює.')).toBeInTheDocument();
    expect(screen.getByText(/Рішення «далі чи ні»: після 2-го тижня пілоту/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ціна|грн|старт|\[дата\]|\[заповнює|\d{2}\.\d{2}\.\d{4}/i);
  });
});
