import './test-setup';
import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from './sparkline';

it('renders an svg with a line path for the values', () => {
  const { container } = render(<Sparkline values={[1, 3, 2, 5]} />);
  expect(container.querySelector('svg')).toBeInTheDocument();
  expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
});

it('renders nothing for an empty series', () => {
  const { container } = render(<Sparkline values={[]} />);
  expect(container.querySelector('svg')).toBeNull();
});
