// mocks/driver-report/src/components/office/review/review.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia'); });
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type JSX, type ReactNode } from 'react';
import { server } from '../../../api/server';
import { demo } from '../../../domain/clock';
import { atBeat } from '../../../test/harness';
import { CallPopover, CorrectionDialog, ExceptionRow, FactGrid, OcrSuggestion, ReasonChips, RequestPopover, RequestTrack,
  SummaryCell, TimeInput, Timeline } from './index';

// No globals in either vitest project, so Testing Library never registers its own cleanup and a second render would
// stack a second tree into the same document (the same reason `shell.test.tsx` carries this line).
afterEach(cleanup);

const withQuery = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const item = { id: 'STOP_REVIEW:s1', code: 'STOP_REVIEW' as const, lane: 'REVIEW' as const, group: 'MONEY' as const, tone: 'hold' as const,
  title: 'Вільнянськ · завантаження · 2 ТТН, 4 стор. · поля не підтверджено', meta: 'АР 1234 ВС · Ватаманюк П. · Вільнянськ', opened_at: demo('08:41'),
  age_min: 1, evidence: null, primary_action: 'CHECK' as const, taken_by: null, resolved: null, truck_day_id: 'd', truck_plate: 'АР 1234 ВС',
  target: { stop_id: 's1', record_key: null, page_key: null }, values: null, request_line: null, phone: null, example: false };

describe('office review kit (§4.2 C-02 … C-06)', () => {
  it('cannot resolve without a reason chip', async () => {
    const onResolve = vi.fn();
    withQuery(<ExceptionRow item={item} onPrimary={() => {}} onTake={() => {}} onResolve={onResolve} />);
    expect(screen.getByRole('button', { name: 'Перевірити' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "З'ясовано ▾" }));
    await userEvent.click(screen.getByRole('button', { name: 'Не є проблемою' }));
    expect(onResolve).toHaveBeenCalledWith('NOT_A_PROBLEM');
  });
  it('accepts an odometer as is only with a reason, and shows a closed item muted', async () => {
    const onAcceptAsIs = vi.fn();
    const fix = { ...item, id: 'ODOMETER_TYPED:k', code: 'ODOMETER_TYPED' as const, group: 'ODOMETER' as const, primary_action: 'FIX' as const };
    const { rerender } = withQuery(<ExceptionRow item={fix} onPrimary={() => {}} onTake={() => {}} onResolve={() => {}} onAcceptAsIs={onAcceptAsIs} />);
    await userEvent.click(screen.getByRole('button', { name: 'Прийняти як є' }));
    await userEvent.click(screen.getByRole('button', { name: 'Водій пояснив телефоном' }));
    expect(onAcceptAsIs).toHaveBeenCalledWith('DRIVER_EXPLAINED');
    rerender(<QueryClientProvider client={new QueryClient()}><ExceptionRow item={{ ...fix, resolved: { by: 'Н. Шевчук', at: demo('16:05'), reason: 'одруківка',
      correction: { old: '318405', new: '381405' } } }} onPrimary={() => {}} onTake={() => {}} onResolve={() => {}} /></QueryClientProvider>);
    // The UI renders U+00A0 inside a grouped number; Testing Library normalises the NODE and never the matcher, so
    // every matcher below writes U+0020 (or \s) where the screen carries the NBSP (Wave 0 gate, measured).
    expect(screen.getByText('318 405').tagName).toBe('S');
    expect(screen.getByText(/→ 381\s405 · одруківка · Н\. Шевчук 21\.09 16:05/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Виправити' })).toBeNull();
  });
  // C-02's anatomy gives EVERY row the ghost «З'ясовано ▾» and C-03 then makes «З'ясовано» the PRIMARY of four
  // codes. §8.3 C-02/C-03 #3 asks of «З'ясовано» — the one the spec names without the arrow — that it cannot
  // complete without a reason chip, so the primary opens the row's own chips rather than closing the item itself
  // (the Wave 2 round gate left this open; the integrator's reading, applied in the only page that mounts this kit).
  it("a RESOLVE row's primary asks the same question as the ghost (§8.3 C-02/C-03 #3)", async () => {
    const onPrimary = vi.fn();
    const onResolve = vi.fn();
    const ask = { ...item, id: 'TTN_NO_MASS:x', code: 'TTN_NO_MASS' as const, primary_action: 'RESOLVE' as const };
    withQuery(<ExceptionRow item={ask} onPrimary={onPrimary} onTake={() => {}} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole('button', { name: "З'ясовано" }));
    expect(onPrimary).not.toHaveBeenCalled();
    expect(onResolve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Не є проблемою' }));
    expect(onResolve).toHaveBeenCalledWith('NOT_A_PROBLEM');
  });
  it('types a time as four digits', async () => {
    const onCommit = vi.fn();
    render(<TimeInput label="Прибуття" value={null} onCommit={onCommit} />);
    await userEvent.type(screen.getByLabelText('Прибуття'), '0748{Enter}');
    expect(screen.getByLabelText('Прибуття')).toHaveValue('07:48');
    expect(onCommit).toHaveBeenCalledWith('0748');
  });
  // Measured in W2-06: Enter commits «0748», the mutation invalidates, the refetch answers «07:48», and the blur
  // that follows (a click on anything else) committed the same time a SECOND time — a second SET_FIELD, a second
  // audit line and a second version bump for one keystroke, invisible to every assertion about the screen.
  it('commits one write per typed time, even after the page answers with the formatted value', async () => {
    const onCommit = vi.fn();
    function Field(): JSX.Element {
      const [value, setValue] = useState<string | null>(null);
      return (
        <>
          <TimeInput label="Прибуття" value={value} onCommit={(v) => { onCommit(v); setValue('07:48'); }} />
          <button type="button">Попросити перезняти</button>
        </>
      );
    }
    render(<Field />);
    await userEvent.type(screen.getByLabelText('Прибуття'), '0748{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Попросити перезняти' }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
  it('is read-only on a confirmed day (§4.2 C-04)', async () => {
    const onCommit = vi.fn();
    render(<TimeInput label="Прибуття" value="07:48" onCommit={onCommit} disabled />);
    const input = screen.getByLabelText('Прибуття');
    expect(input).toBeDisabled();
    await userEvent.type(input, '0900');
    expect(input).toHaveValue('07:48');
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('confesses an OCR suggestion and tracks a request', () => {
    render(<><OcrSuggestion value="004517" /><RequestTrack request={{ id: 'r', type: 'RETAKE_PHOTO', target_label: 'ТТН 2 з 2, зворотний бік', reasons: ['BLUR'],
      by: 'Н. Шевчук', unseen_line: null, states: { sent: demo('08:43'), delivered: demo('08:43'), seen: demo('08:43'), done: demo('08:44'), cancelled: null } }} /></>);
    expect(screen.getByText('OCR: 004517 · з фото — перевірте')).toBeInTheDocument();
    expect(screen.getByText('імітація')).toBeInTheDocument();
    expect(screen.getByText(/надіслано 08:43 → на телефоні 08:43 → побачив 08:43 → виконано 08:44/)).toBeInTheDocument();
  });
  it('corrects Ярошенко’s odometer with a reason, keeps the original struck, and never blurs (§8.3 C-05)', async () => {
    await atBeat(10);
    const rec = server.world().records.find((r) => r.device_id === 'device-000006' && r.type === 'SHIFT_START')!;
    const onSaved = vi.fn();
    withQuery(<CorrectionDialog open onOpenChange={() => {}} onSaved={onSaved} target={{ record_key: rec.key, title: 'Виправити одометр · початок зміни',
      context: 'АР 2745 ІВ · Ярошенко Р. · 21.09 05:40', current: '318405', expected: '381402', photo: <div /> }} />);
    const input = screen.getByLabelText('Нове значення, км');
    expect(input).toHaveValue('381\u00A0402');   // toHaveValue compares the value PROPERTY: no normaliser, so the NBSP stays
    const save = screen.getByRole('button', { name: 'Зберегти виправлення' });
    expect(save).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, '381405');
    await userEvent.click(screen.getByRole('button', { name: 'Одруківка' }));
    expect(screen.getByText(/Водій побачить: «число виправлено за фото щитка» · Згоден \/ Не згоден/)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.className ?? '').not.toMatch(/backdrop-blur/);
    await userEvent.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ old: '318405', new: '381405' })));
  });
});

/* The five drives above are this task's pinned contract. They mount five of the eleven exported components; the
 * kit FREEZES at the Wave 1 gate and fourteen Wave 2 pages build on all eleven, so the six the contract never
 * mounts get one drive each here — not a richer assertion than the plan asked for, a first one. */
const page = { key: 'device-000001:419:p4', record_key: 'device-000001:419', artefact: 'TTN_BACK' as const, doc_index: 2,
  page_no: 2, caption: 'ТТН 2 з 2 · зворотний бік', target_label: 'ТТН 2 з 2, зворотний бік',
  provenance: 'знято в застосунку 08:39 · 0,7 МБ', received: true,
  drawn_variant: 'ttn-004518-back:soft', image: null, superseded_by: null, supersedes: null, request: null };

describe('the six surfaces the contract above never mounts (§4.2 C-06, C-08)', () => {
  it('gates «Надіслати водію» on a reason and never offers «Не видно підпису» (§8.3 C-06 #1)', async () => {
    withQuery(<RequestPopover page={page} context="Вільнянськ · знято 08:39" onSent={() => {}}><button type="button">Попросити перезняти</button></RequestPopover>);
    await userEvent.click(screen.getByRole('button', { name: 'Попросити перезняти' }));
    expect(screen.getByRole('button', { name: 'Надіслати водію' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Не видно підпису' })).toBeNull();
    // §4.2 C-06's target line, byte for byte — a COMMA, from `page.target_label`, never the photo panel's middot
    // caption. The same bytes are what the driver's own card will read, which is the point of the Reading below.
    expect(screen.getByText('ТТН 2 з 2, зворотний бік · Вільнянськ · знято 08:39')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Розмито' }));
    expect(screen.getByText(/Диспетчер просить перезняти: ТТН 2 з 2, зворотний бік — розмито/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Надіслати водію' })).toBeEnabled();
  });
  // A CALL row's only visible control is `ExceptionRow`'s own primary, which calls `onPrimary()` and owns no
  // element a popover could hang from. Controlled, the page raises it with a state flag and the children become the
  // ANCHOR — what LaneList used to do by clicking a 1 px aria-hidden button it rendered beside the row.
  it('opens from a page that owns no trigger of its own', async () => {
    function Host(): JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <div className="relative">
          <button type="button" onClick={() => setOpen(true)}>Подзвонити</button>
          <CallPopover phone="+380 50 271 94 17" open={open} onOpenChange={setOpen}>
            <span aria-hidden="true" className="absolute right-0 bottom-0 block size-px" />
          </CallPopover>
        </div>
      );
    }
    render(<Host />);
    expect(screen.queryByText('+380 50 271 94 17')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Подзвонити' }));
    expect(await screen.findByText('+380 50 271 94 17')).toBeInTheDocument();
  });
  it('offers the number and one copy, and no tel: link', async () => {
    render(<CallPopover phone="+380 50 271 94 17"><button type="button">Подзвонити</button></CallPopover>);
    await userEvent.click(screen.getByRole('button', { name: 'Подзвонити' }));
    expect(screen.getByText('+380 50 271 94 17')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Копіювати' })).toBeInTheDocument();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });
  it('toggles a multi-select chip both ways', async () => {
    const onChange = vi.fn();
    render(<ReasonChips options={[{ value: 'A', label: 'Один' }, { value: 'B', label: 'Два' }]} value={['A']} multi onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Два' }));
    expect(onChange).toHaveBeenCalledWith(['A', 'B']);
    await userEvent.click(screen.getByRole('button', { name: 'Один' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
  it('lays out the requisites, a summary cell and the timeline (§4.2 C-08)', () => {
    render(<>
      <FactGrid items={[{ key: 'truck', label: 'АВТОМОБІЛЬ', value: 'Scania R450 · Регіс', plate: 'АР 1234 ВС', note: null },
        { key: 'trip', label: 'РЕЙС', value: 'Р-26-3312', plate: null, note: 'за планом з BAS' }]} />
      <SummaryCell cell={{ label: 'Одометр', value: '412 355 → 412 589', lines: ['234 км · з вантажем 175'],
        hold_lines: ['Залишки: немає даних з Регіс (фаза 1)'], simulated: true }} />
      <Timeline rows={[{ at: demo('06:10'), to: null, source: 'DRIVER', event: 'На місці: Дніпро-Корм, Вільнянськ · Черга',
        place_short: 'Дніпро-Корм, Вільнянськ', odometer: { value: 412391, source: 'PHOTO' }, thumbs: ['cluster:412391'],
        simulated: false, example: false },
        { at: demo('12:30'), to: demo('12:48'), source: 'DRIVER', event: 'Стою: Тривога / укриття · 18 хв',
          place_short: null, odometer: null, thumbs: [], simulated: true, example: true }]} highlight={(r) => r.to !== null} />
    </>);
    expect(screen.getByText('АВТОМОБІЛЬ')).toBeInTheDocument();
    expect(screen.getByLabelText('Номер АР 1234 ВС')).toBeInTheDocument();
    expect(screen.getByText('за планом з BAS')).toBeInTheDocument();
    expect(screen.getByText('412 355 → 412 589')).toBeInTheDocument();
    expect(screen.getByText('Залишки: немає даних з Регіс (фаза 1)')).toBeInTheDocument();
    expect(screen.getByText('12:30–12:48')).toBeInTheDocument();
    // NBSP in the render, U+0020 in the matcher (Wave 0 gate).
    expect(screen.getByText('412 391')).toBeInTheDocument();
    expect(screen.getAllByText('ФОТО').length).toBe(1);
    expect(screen.getByText('приклад')).toBeInTheDocument();
  });
});
