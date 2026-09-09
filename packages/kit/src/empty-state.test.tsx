import './test-setup';
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';

it('renders the title and optional hint', () => {
  render(<EmptyState title="Порожньо" hint="Ще нічого не додано" />);
  expect(screen.getByText('Порожньо')).toBeInTheDocument();
  expect(screen.getByText('Ще нічого не додано')).toBeInTheDocument();
});
