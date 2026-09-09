import './test-setup';
import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Dot } from './dot';

it('renders a span with the given background colour', () => {
  const { container } = render(<Dot color="#2e7a3c" />);
  const span = container.querySelector('span');
  expect(span).toBeInTheDocument();
  expect(span).toHaveStyle({ background: '#2e7a3c' });
});
