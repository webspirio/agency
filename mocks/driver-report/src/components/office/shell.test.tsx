// mocks/driver-report/src/components/office/shell.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia'); });
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { JSX } from 'react';
import { demo } from '../../domain/clock';
import { ConsoleHeader, ContactCell, DocDots, LiveLine, Panel, ResponsiveTable, saveFile, Sidebar, StatusPill,
  useConsoleMode, type RTColumn } from './index';
import { CheckCheck } from 'lucide-react';

afterEach(cleanup);   // no globals here: Testing Library would not unmount by itself (src/app/speed.test.ts)

const counts = { now: 3, review: 11, days_to_confirm: 7, originals: 4, bas_ready: 57 };
const width = (w: number) => act(() => { window.innerWidth = w; window.dispatchEvent(new Event('resize')); });

describe('the console shell (§4.1, §8.3 shell)', () => {
  it('picks the layout from the console’s own width', () => {
    const { result } = renderHook(() => useConsoleMode());
    width(1440); expect(result.current).toBe('wide');
    width(946); expect(result.current).toBe('compact');
    width(890); expect(result.current).toBe('rail');
    width(390); expect(result.current).toBe('mobile');
  });
  it('lists the work queues with their counts on ink', () => {
    render(<MemoryRouter><Sidebar mode="wide" counts={counts} onCall={{ name: 'Ірина Коваленко', until: '20:00' }} /></MemoryRouter>);
    for (const t of ['Звіт водія', 'КТЛ · офіс', 'Робота', 'Звіти', 'Налаштування', 'Парк зараз', 'Дні на підтвердження', 'В BAS', 'Пілот']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Зараз\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Перевірка\s*11/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Парк зараз$/ })).toBeInTheDocument();
    expect(screen.getByText('Черговий: Ірина Коваленко · до 20:00')).toBeInTheDocument();
  });
  it('shows short labels in the rail', () => {
    render(<MemoryRouter><Sidebar mode="rail" counts={counts} onCall={{ name: 'Ірина Коваленко', until: '20:00' }} /></MemoryRouter>);
    for (const t of ['Парк', 'Зараз', 'Перевірка', 'Дні', 'Папір', 'Точки', 'Машини', 'Час', 'BAS', 'Водії', 'Пілот']) expect(screen.getByText(t)).toBeInTheDocument();
  });
  it('heads the page with the server clock, the scope and the user', async () => {
    const onScope = vi.fn();
    render(<ConsoleHeader mode="wide" clock={demo('08:43')} scope="PILOT" onScope={onScope}
      user={{ id: 'user-000001', name: 'Наталія Шевчук', initials: 'НШ', role: 'OPERATOR', role_label: 'оператор' }} />);
    for (const t of ['пн 21.09 · 08:43', 'НШ', 'Наталія Шевчук', 'оператор', 'Пілот · 3', 'Весь парк · 100 (приклад)']) expect(screen.getByText(t)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Весь парк · 100 (приклад)'));
    expect(onScope).toHaveBeenCalledWith('FLEET');
  });
  it('never makes the accent a status (D10)', () => {
    const { container } = render(<StatusPill tone="plain" icon={CheckCheck} word="прийнято" />);
    expect(container.innerHTML).not.toMatch(/accent/);
  });
  it('describes documents and contact in words', () => {
    render(<><DocDots ttn="full" signed="part" receipts="full" label="ТТН: 2 з 2 · підписані: 1 з 2 · чеки: 1" />
      <ContactCell at={demo('05:59')} unsent={3} stale now={demo('08:41')} /><LiveLine at={demo('05:21')} /></>);
    expect(screen.getByLabelText('ТТН: 2 з 2 · підписані: 1 з 2 · чеки: 1')).toBeInTheDocument();
    expect(screen.getByText('2 год 42 хв · тоді в телефоні 3')).toBeInTheDocument();
    expect(screen.getByText('щойно · 05:21')).toBeInTheDocument();
  });
  it('makes every row a button that Enter opens, and turns rows into cards on a phone', async () => {
    const onOpen = vi.fn();
    const rows = [{ id: 'a', plate: 'АР 1234 ВС' }, { id: 'b', plate: 'АР 9012 МК' }];
    const cols = [{ id: 'plate', header: 'Машина', width: 240, cell: (r: { plate: string }) => r.plate }];
    const { rerender } = render(<ResponsiveTable columns={cols} rows={rows} rowKey={(r) => r.id} onOpen={onOpen} card={(r) => <p>card {r.plate}</p>} mode="wide" />);
    const row = screen.getByRole('button', { name: /АР 1234 ВС/ });
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(rows[0]);
    rerender(<ResponsiveTable columns={cols} rows={rows} rowKey={(r) => r.id} onOpen={onOpen} card={(r) => <p>card {r.plate}</p>} mode="mobile" />);
    expect(screen.getByText('card АР 1234 ВС')).toBeInTheDocument();
  });
  // A merged column loses its header, so the second line has to label itself — and WHICH of the two spellings is
  // used is the table's decision. A page deciding it would be `hideAt` re-derived outside the table (W2-08's note).
  it('labels a merged second line from the column, not from the page', () => {
    type Row = { id: string; plate: string; norm: string };
    const rows: Row[] = [{ id: 'a', plate: 'АР 8150 КС', norm: '32,0' }];
    const cols: RTColumn<Row>[] = [
      { id: 'fuel', header: 'Пальне', width: 240, cell: (r) => r.plate },
      { id: 'norm', header: 'Норма', width: 88, hideAt: ['compact'], mergeInto: 'fuel',
        cell: (r) => r.norm, mergedCell: (r) => `норма ${r.norm}` },
    ];
    const table = (mode: 'wide' | 'compact'): JSX.Element =>
      <ResponsiveTable columns={cols} rows={rows} rowKey={(r) => r.id} card={(r) => <p>{r.plate}</p>} mode={mode} />;
    const { rerender } = render(table('wide'));
    expect(screen.getByRole('columnheader', { name: 'Норма' })).toBeInTheDocument();
    expect(screen.getByText('32,0')).toBeInTheDocument();
    rerender(table('compact'));
    expect(screen.queryByRole('columnheader', { name: 'Норма' })).toBeNull();
    expect(screen.getByText('норма 32,0')).toBeInTheDocument();
  });
  /* Measured in Chrome at 946 px, the width the stage's console frame runs at, while re-measuring §8.6 #22: the
   * panel head of «Парк зараз» read «Маш…». Title and hint were both `truncate` inside one `min-w-0` row, and the
   * title is the first flex item, so the hint's long sentence — «потребують дії — зверху · порядок не
   * змінюється, поки курсор над таблицею» — took the room and the panel's NAME was the thing that gave way. The
   * name is the identity of the panel and the hint is its footnote, so the name is `shrink-0` now. A token test,
   * because jsdom cannot measure a truncation; the browser was the instrument. */
  it('never lets a panel’s hint truncate its title (§4.1 PanelHead)', () => {
    render(<Panel title="Машини" hint="потребують дії — зверху · порядок не змінюється, поки курсор над таблицею"><p>rows</p></Panel>);
    const title = screen.getByRole('heading', { name: 'Машини' });
    expect(title.className.split(/\s+/)).toContain('shrink-0');
    expect(title.className.split(/\s+/)).not.toContain('truncate');
    expect(screen.getByText(/потребують дії/).className.split(/\s+/)).toContain('truncate');
  });
  it('saves a file through a blob link, never a dialog', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    saveFile('КТЛ-ключові-точки-21.09.2026.csv', 'text/csv;charset=utf-8', '﻿a\r\n');
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('КТЛ-ключові-точки-21.09.2026.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
