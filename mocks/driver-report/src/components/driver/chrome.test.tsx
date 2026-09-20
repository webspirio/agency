// mocks/driver-report/src/components/driver/chrome.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fuel, MapPin } from 'lucide-react';
import { ActionBar, AppHeader, CallButton, FlowHeader, InlineStartSheet, MotionLock, PrimaryAction, QuietButton, ReceiptCard,
  StatusLine, SyncStrip, Tile, TimeChips } from './index';

// No globals in either vitest config, so Testing Library's auto-cleanup guard (`typeof afterEach === 'function'`) is
// false and nothing unmounts between `it`s: without this line every `screen` query below searches the whole day's
// renders, and a duplicate found there is a false green. Same reason as src/app/speed.test.ts:46.
afterEach(cleanup);

describe('driver chrome (§3.1, §6.5)', () => {
  it('heads the app with the lockup, the рейс and a named theme toggle', async () => {
    render(<AppHeader tripNo="Р-26-3312" />);
    expect(screen.getByText('Звіт водія')).toBeInTheDocument();
    expect(screen.getByText('Р-26-3312')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Темна тема' }));
    expect(screen.getByRole('button', { name: 'Світла тема' })).toBeInTheDocument();
  });
  it('heads a flow with Back, the name, «2 з 5» and a five-cell rail, no caps eyebrow', () => {
    const { container } = render(<FlowHeader title="Завантаження" step={{ index: 1, total: 5 }} onBack={() => {}} />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.getByText('2 з 5')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-rail-cell]')).toHaveLength(5);
    expect(container.querySelector('[data-rail-cell="current"]')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/uppercase/);
  });
  it('has exactly one accent button, which goes inert with «Записую…»', async () => {
    const onPress = vi.fn();
    const { container, rerender } = render(<ActionBar><Tile icon={Fuel} word="Заправка" sub="чек і щиток" onPress={() => {}} />
      <PrimaryAction icon={MapPin} verb="Я на місці" place="Дніпро-Корм, Вільнянськ" onPress={onPress} />
      <QuietButton label="Я в іншому місці" onPress={() => {}} /></ActionBar>);
    expect(container.querySelectorAll('[data-accent]')).toHaveLength(1);
    expect(screen.getByText('Дніпро-Корм, Вільнянськ')).toBeInTheDocument();
    rerender(<ActionBar><PrimaryAction icon={MapPin} verb="Я на місці" busy onPress={onPress} /></ActionBar>);
    expect(screen.getByText('Записую…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Записую/ })).toHaveAttribute('aria-disabled', 'true');
  });
  it('shows status as rule + icon + word, tappable when asked', async () => {
    const onPress = vi.fn();
    render(<StatusLine tone="hold" icon={MapPin} text="Черга · з 06:10" onPress={onPress} />);
    await userEvent.click(screen.getByRole('button', { name: /Черга · з 06:10/ }));
    expect(onPress).toHaveBeenCalledOnce();
  });
  it('offers «Скасувати» for 15 s, then «Скасовано · Повернути» after an undo, and draws the stem on acknowledgement', () => {
    vi.useFakeTimers();
    const status = { tone: 'plain' as const, icon: 'Check' as const, text: 'В офісі ✓ 08:42', photo_hold: null, acknowledged: true };
    const { container, rerender } = render(<ReceiptCard title="Завантажено 08:40 · 2 ТТН, 4 стор." status={status} next="Далі: вивантаження 1 з 2 — Злагода, Синельникове · Відсіки 1–3 · ТТН 004517"
      createdWall={Date.now()} onUndo={() => {}} onRedo={() => {}} undone={false} />);
    expect(screen.getByRole('button', { name: /Скасувати/ })).toBeInTheDocument();
    expect(container.querySelector('.cl-stem')).not.toBeNull();
    rerender(<ReceiptCard title="t" status={{ ...status, tone: 'muted', icon: 'Undo2', text: 'Скасовано · Повернути', acknowledged: false }} next={null}
      createdWall={Date.now()} onUndo={() => {}} onRedo={() => {}} undone />);
    expect(screen.getByRole('button', { name: 'Повернути' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(15_001); });
    expect(screen.queryByRole('button', { name: /Скасувати|Повернути/ })).toBeNull();
    vi.useRealTimers();
  });
  it('speaks the sync strip politely and never as a modal', () => {
    render(<SyncStrip state={{ tone: 'hold', icon: 'CloudOff', text: "1 запис чекає інтернету · останній зв'язок 08:57" }} />);
    expect(screen.getByText("1 запис чекає інтернету · останній зв'язок 08:57").closest('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('offers the time chips in the product’s words', () => {
    render(<TimeChips options={['now', 15, 30, 60, 'earlier']} onPick={() => {}} />);
    for (const w of ['Щойно', '−15 хв', '−30 хв', '−1 год', 'Раніше…']) expect(screen.getByRole('button', { name: w })).toBeInTheDocument();
  });
  it('never dials from the stage: the call button opens the number sheet (§3.3 D-11)', async () => {
    const { container } = render(<CallButton person={{ name: 'Ірина Коваленко', role: 'диспетчер' }} phone="+380 67 214 55 08" />);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Подзвонити — Ірина Коваленко, диспетчер' }));
    expect(await screen.findByText('+380 67 214 55 08')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрити' })).toBeInTheDocument();
  });
  it('locks with words only: no button, no number, no dot (§8.6 #19)', () => {
    const { container } = render(<MotionLock nextStop="Лан, Балабине" />);
    expect(screen.getByRole('status')).toHaveTextContent('Ви в дорозі');
    expect(screen.getByText('Зупиніться, щоб заповнити')).toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.querySelector('[data-surface="dark"]')).not.toBeNull();
  });
  it('starts a forgotten shift in one chip', async () => {
    const onPick = vi.fn();
    render(<InlineStartSheet open plate="АР 1234 ВС" rc={false} startedLabel={null} onPick={onPick} onClose={() => {}} />);
    expect(screen.getByText('Ви ще не почали зміну. Почати на АР 1234 ВС?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '−30 хв' }));
    expect(onPick).toHaveBeenCalledWith('M30');
  });

  /* MEASURED IN CHROME AT THE WAVE 2 EXIT GATE, inside the stage's own phone frame — which is 360 px wide (§5.2),
   * not the 390 px every driver test here assumes. The action bar's two tiles laid out 139 px + 257 px inside a
   * 328 px row: «Стою» overflowed its row by 76 px and the phone document's scrollWidth was 420 against a
   * clientWidth of 360. That is §8.2 D-02 #2 («360 px, no horizontal scroll») red, on the first screen of the demo.
   *
   * The cause is one missing token. A flex item's `min-width` defaults to `auto`, which floors it at its own
   * min-content width — and because `truncate` sets `white-space: nowrap`, that min-content width is the WHOLE
   * untruncated sub-line. So the tile refused to shrink and the `truncate` inside it never got to do the one thing
   * this component's docblock promises. `min-w-0` removes the floor; measured again with it, the two tiles come out
   * 160 px + 160 px and scrollWidth returns to 360.
   *
   * jsdom has no layout, so this asserts the token rather than the pixels: the browser was the instrument and this
   * is the record. It goes red if anybody takes `min-w-0` off again, which is the failure that actually happened. */
  it('lets a tile shrink below its own text, so two fit a 360 px phone', () => {
    const { container } = render(<ActionBar><Tile icon={Fuel} word="Заправка" sub="чек і щиток" onPress={() => {}} />
      <Tile icon={MapPin} word="Стою" sub="тривога · поломка · проблема" onPress={() => {}} /></ActionBar>);
    const tiles = [...container.querySelectorAll('button')];
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      const tokens = new Set((tile.getAttribute('class') ?? '').split(/\s+/).filter((t) => t !== ''));
      expect(tokens).toContain('min-w-0');
      expect(tokens).toContain('flex-1');
    }
  });

  /* The same defect, the same measurement, one component along. `QuietButton half` is what `CameraScreen` puts in
   * its row 2, and at 360 px the loading and unloading capture screens ran to a scrollWidth of 430: «Зніму на
   * стоянці» reached 430 px against a clientWidth of 360. A `half` button is a flex ITEM, so it needs the floor
   * removed for the `truncate` on its label to ever fire; a full-width one is not, and does not. */
  it('lets a half-width quiet button shrink below its own label', () => {
    const { container } = render(<ActionBar>
      <QuietButton half dark icon={MapPin} label="Зніму на стоянці" onPress={() => {}} />
      <QuietButton half dark icon={Fuel} label="Немає документа" onPress={() => {}} /></ActionBar>);
    for (const btn of container.querySelectorAll('button')) {
      const tokens = new Set((btn.getAttribute('class') ?? '').split(/\s+/).filter((t) => t !== ''));
      expect(tokens).toContain('min-w-0');
      expect(tokens).toContain('flex-1');
    }
  });
});
