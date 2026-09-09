import './test-setup';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './field';
import { TextInput } from './text-input';

describe('Field a11y wiring', () => {
  it('associates the label with the control', () => {
    render(
      <Field name="nameUa" label="Імʼя">
        {(a11y) => <TextInput {...a11y} />}
      </Field>,
    );
    expect(screen.getByLabelText('Імʼя')).toBe(document.getElementById('nameUa'));
  });

  it('leaves a valid control unmarked', () => {
    render(
      <Field name="nameUa" label="Імʼя">
        {(a11y) => <TextInput {...a11y} />}
      </Field>,
    );
    const input = screen.getByLabelText('Імʼя');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces the error and points the control at it', () => {
    render(
      <Field name="nameUa" label="Імʼя" error="Something went wrong">
        {(a11y) => <TextInput {...a11y} />}
      </Field>,
    );
    const input = screen.getByLabelText('Імʼя');
    const alert = screen.getByRole('alert');

    // LIFT NOTE — upstream `error` was an i18n KEY and this asserted that the
    // key resolved. The kit has no i18n runtime, so `error` is the resolved
    // message and this asserts it reaches the alert verbatim.
    expect(alert).toHaveTextContent('Something went wrong');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // The link must actually resolve — a dangling id is the whole bug class.
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('describes the control by its hint, and by hint + error together', () => {
    const { rerender } = render(
      <Field name="birth" label="Дата" hint="ДД.ММ">
        {(a11y) => <TextInput {...a11y} />}
      </Field>,
    );
    let input = screen.getByLabelText('Дата');
    let described = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(described)).toHaveTextContent('ДД.ММ');

    rerender(
      <Field name="birth" label="Дата" hint="ДД.ММ" error="Something went wrong">
        {(a11y) => <TextInput {...a11y} />}
      </Field>,
    );
    input = screen.getByLabelText('Дата');
    described = input.getAttribute('aria-describedby') ?? '';
    expect(described.split(' ')).toHaveLength(2);
    expect(described.split(' ').every((id) => document.getElementById(id))).toBe(true);
  });

  it('marks a required control', () => {
    render(
      <Field name="nameUa" label="Імʼя" required>
        {(a11y) => <TextInput {...a11y} />}
      </Field>,
    );
    expect(screen.getByLabelText('Імʼя')).toHaveAttribute('aria-required', 'true');
  });
});
