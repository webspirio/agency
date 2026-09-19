// mocks/driver-report/src/components/driver/capture/odometer.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { demo } from '../../../domain/clock';
import { expectedOdometer } from '../../../domain/odometer';
import { Keypad, OdometerStep } from './odometer';

// No globals in either vitest config, so Testing Library's auto-cleanup guard (`typeof afterEach === 'function'`) is
// false and nothing unmounts between `it`s: without this line the planless case below finds the FIRST test's «412 355»
// still in the document and reports a stale prefill that never happened. Same reason as components/driver/chrome.test.tsx:12.
afterEach(cleanup);

// Testing Library's default normalizer collapses a rendered U+00A0 to U+0020 and never touches the matcher, so every
// getByText / queryByText below writes the plain space the renderer's NBSP normalizes to. A getByRole `name:` matcher
// is NOT normalized that way — computeAccessibleName only collapses runs of two or more — so those keep U+00A0, which
// is what the button really carries. The RENDERED copy keeps its NBSP in both cases.

describe('the odometer step (§3.3 D-09, §8.2 D-09)', () => {
  const base = { read: null, rc: false, photo: null, realFrame: false, last: 412355, fromLabel: null, onRetake: () => {} };
  it('offers the base reading at a shift start as one confirmation', async () => {
    const onDone = vi.fn();
    const expected = expectedOdometer({ moment: 'SHIFT_START', last: { value: 412355, at: '2026-09-20T14:48:00.000Z' as never, kind: 'SHIFT_END_AT_BASE', place_short: 'База' },
      canDelta: null, plannedKm: null, fromLabel: null, now: demo('05:20'), rc: false });
    const { container, rerender } = render(<OdometerStep {...base} expected={expected} read={412355} plannedKm={null} onDone={onDone} />);
    expect(screen.getByText('412 355')).toBeInTheDocument();
    expect(screen.getByText('вчора о 17:48 на базі: 412 355 — порівняйте з фото')).toBeInTheDocument();
    expect(screen.getByText('імітація: число підставлене')).toBeInTheDocument();
    // §8.2 D-09 #4: «Так, правильно» belongs to the check screen alone. And one accent, which is what makes the
    // digit question's ZERO below a statement about that screen rather than about the component.
    expect(screen.queryByRole('button', { name: 'Так, правильно' })).toBeNull();
    expect(container.querySelectorAll('[data-accent]')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Так, 412 355' }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ value: 412355, source: 'DASH_PHOTO', basis: 'LAST_AT_BASE', choice: 'CONFIRMED' }));
    rerender(<OdometerStep {...base} expected={expected} read={412355} plannedKm={null} realFrame onDone={onDone} />);
    expect(screen.getByText('Макет: число підставлене, не розпізнане')).toBeInTheDocument();
  });
  it('asks «5 чи 8?» with two equal buttons and keeps the plan digit as ПЛАН ✓', async () => {
    const onDone = vi.fn();
    const expected = expectedOdometer({ moment: 'LATER', last: { value: 412450, at: demo('10:05'), kind: 'POINT', place_short: 'Злагода' },
      canDelta: null, plannedKm: 116, fromLabel: 'Злагоди', now: demo('15:17'), rc: false });
    const { container } = render(<OdometerStep {...base} expected={expected} read={412866} plannedKm={116} last={412450} onDone={onDone} />);
    expect(screen.getByText('На щитку 5 чи 8?')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-accent]')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /^5 — 412 566/ }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ value: 412566, read: 412866, source: 'PLAN_CONFIRMED', choice: 'DIGIT_EXPECTED' }));
  });
  // The three below are not in the plan's pinned test, and the acceptance criteria name all three: tier 1, the check
  // screen and the keypad's bridge to it. Without them «Так, правильно», `KEPT_AS_IS`, `AUTO` and the whole typed
  // path would ship with nothing that could ever go red on them.
  it('commits the CAN reading on an R+C truck with no screen and exactly once (tier 1)', () => {
    const onDone = vi.fn();
    const expected = expectedOdometer({ moment: 'ARRIVAL', last: { value: 241400, at: demo('11:00'), kind: 'POINT', place_short: 'База' },
      canDelta: 112, plannedKm: null, fromLabel: null, now: demo('12:01'), rc: true });
    const { container } = render(<OdometerStep {...base} rc expected={expected} plannedKm={null} onDone={onDone} />);
    expect(container).toBeEmptyDOMElement();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ value: 241512, source: 'CAN', basis: 'CAN_DELTA', choice: 'AUTO' }));
  });
  it('puts both numbers on the check screen and «Так, правильно» keeps the photo’s', async () => {
    const onDone = vi.fn();
    const expected = expectedOdometer({ moment: 'LATER', last: { value: 412450, at: demo('10:05'), kind: 'POINT', place_short: 'Злагода' },
      canDelta: null, plannedKm: 116, fromLabel: 'Злагоди', now: demo('15:17'), rc: false });
    render(<OdometerStep {...base} expected={expected} read={413866} plannedKm={116} last={412450} onDone={onDone} />);
    expect(screen.getByText('Перевірте число')).toBeInTheDocument();
    expect(screen.getByText('На фото: 413 866 · за планом ~412 566')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'за планом — 412 566' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'з фото — 413 866' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Так, правильно' }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ value: 413866, source: 'DASH_PHOTO', choice: 'KEPT_AS_IS' }));
  });
  it('sends a dropped digit from the keypad to the check screen rather than refusing it (EC-16)', async () => {
    const onDone = vi.fn();
    const expected = expectedOdometer({ moment: 'SHIFT_START', last: { value: 412355, at: '2026-09-20T14:48:00.000Z' as never, kind: 'SHIFT_END_AT_BASE', place_short: 'База' },
      canDelta: null, plannedKm: null, fromLabel: null, now: demo('05:20'), rc: false });
    render(<OdometerStep {...base} expected={expected} read={412355} plannedKm={null} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Інше число' }));
    for (const digit of ['4', '1', '2', '3', '5']) await userEvent.click(screen.getByRole('button', { name: digit }));
    expect(screen.getByRole('textbox')).toHaveValue('41235');
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getByText('Перевірте число')).toBeInTheDocument();
    expect(screen.getByText('Перевірте: менше, ніж було — 412 355 км')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Так, правильно' }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ value: 41235, source: 'DRIVER_TYPED', choice: 'KEPT_AS_IS' }));
  });
  it('offers no number with basis NONE', () => {
    const expected = expectedOdometer({ moment: 'ARRIVAL', last: { value: 412391, at: demo('06:10'), kind: 'POINT', place_short: 'Дніпро-Корм' },
      canDelta: null, plannedKm: null, fromLabel: null, now: demo('09:00'), rc: false });
    render(<OdometerStep {...base} expected={expected} read={null} plannedKm={null} onDone={() => {}} />);
    expect(screen.getByRole('button', { name: 'Добре — хай офіс прочитає' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ввести число' })).toBeInTheDocument();
    expect(screen.queryByText(/^\d{3}\s\d{3}$/)).toBeNull();
  });
});

describe('the keypad (§3.3 D-09 tier 3, §8.2 D-09 #3)', () => {
  it('holds the expected value selected, replaces it on the first digit, never shifts, and allows an empty «Готово»', async () => {
    const onDone = vi.fn();
    const { container } = render(<Keypad initial="412391" deltaLine={(v) => `+${v.length} км від виїзду`} warn={() => null} onDone={onDone} />);
    const readout = screen.getByRole('textbox');
    expect(readout).toHaveValue('412391');
    await userEvent.click(screen.getByRole('button', { name: '4' }));
    expect(readout).toHaveValue('4');
    expect(screen.getByText('+1 км від виїзду')).toBeInTheDocument();   // the delta line follows every digit
    expect(container.querySelector('[data-reserved-line]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Очистити/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getByText('Порожньо — хай офіс прочитає з фото?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onDone).toHaveBeenCalledWith(null);
  });
});
