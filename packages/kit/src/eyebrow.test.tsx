import './test-setup';
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Eyebrow } from './eyebrow';

it('renders its text with the eyebrow classes', () => {
  render(<Eyebrow>Разом</Eyebrow>);
  expect(screen.getByText('Разом')).toHaveClass('uppercase', 'text-muted-foreground');
});
