// mocks/driver-report/src/components/shared/shared.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { server } from '../../api/server';
import { ExampleChip, KtlLockup, Plate, QrPattern, SimChip, SourceBadge, TruckMark } from './index';

describe('shared primitives (§6.5, §6.9 – §6.11)', () => {
  it('draws a plate as an image with NBSP spaces', () => {
    render(<Plate plate="АР 1234 ВС" size="md" />);
    const plate = screen.getByRole('img', { name: 'Номер АР 1234 ВС' });
    expect(plate.textContent).toContain('АР 1234 ВС');
    expect(plate.textContent).toContain('UA');
  });
  it('confesses simulation and examples, and hides the first only on the hidden-menu toggle', () => {
    const { rerender } = render(<><SimChip /><ExampleChip /></>);
    expect(screen.getByText('імітація')).toBeInTheDocument();
    expect(screen.getByText('приклад')).toBeInTheDocument();
    act(() => server.setToggle('hideSimChips', true));
    rerender(<><SimChip /><ExampleChip /></>);
    expect(screen.queryByText('імітація')).toBeNull();
    act(() => server.setToggle('hideSimChips', false));
  });
  it('names every source in the office’s words', () => {
    render(<>{(['CAN', 'PHOTO', 'PLAN_OK', 'TYPED', 'OFFICE', 'ESTIMATE', 'FROM_CALL', 'DRIVER', 'TTN', 'RUPTELA', 'TACHO'] as const).map((s) => <SourceBadge key={s} source={s} />)}</>);
    for (const w of ['CAN', 'ФОТО', 'ПЛАН ✓', 'ВРУЧНУ', 'ОФІС', 'ОЦІНКА', 'ЗІ СЛІВ', 'ВОДІЙ', 'ТТН', 'Ruptela', 'ТАХОГРАФ']) {
      expect(screen.getByText(w)).toBeInTheDocument();
    }
    expect(screen.getByText('ВРУЧНУ').className).toContain('text-hold');
  });
  it('draws the same QR for the same text and a different one otherwise, never decodable', () => {
    const path = (t: string) => render(<QrPattern text={t} size={220} />).container.querySelector('path')!.getAttribute('d');
    expect(path('ktl.in.ua/z/483920')).toBe(path('ktl.in.ua/z/483920'));
    expect(path('ktl.in.ua/z/483920')).not.toBe(path('ktl.in.ua/z/591736'));
    expect(screen.getAllByRole('img', { name: 'QR-код (імітація)' }).length).toBeGreaterThan(0);
  });
  it('writes the lockup and the Mark', () => {
    const { container } = render(<><KtlLockup size={15} /><TruckMark /></>);
    expect(screen.getByText('KTL')).toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(3);
  });
});
