import './test-setup';
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatGrid } from './stat-grid';

it('renders its children in a grid', () => {
  render(
    <StatGrid>
      <span>a</span>
      <span>b</span>
    </StatGrid>,
  );
  expect(screen.getByText('a').parentElement).toHaveClass('grid');
});

it('maps the columns prop to a static grid class', () => {
  render(
    <StatGrid columns={3}>
      <span>x</span>
    </StatGrid>,
  );
  expect(screen.getByText('x').parentElement).toHaveClass('grid-cols-2', 'sm:grid-cols-3');
});

it('defaults to the responsive 5-column class', () => {
  render(
    <StatGrid>
      <span>y</span>
    </StatGrid>,
  );
  expect(screen.getByText('y').parentElement).toHaveClass('lg:grid-cols-5');
});
