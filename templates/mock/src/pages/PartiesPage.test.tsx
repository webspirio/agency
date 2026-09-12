import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The WRITE loop, mounted. A mock exists so a client can watch a record be
 * created, changed and refused, and none of that is exercised by a build or by
 * a domain test — both are green over a form that throws on submit.
 *
 * This is also the only test that proves the refusal path end to end: a domain
 * rule returns a code, `fail()` puts it in the envelope, the adapter THROWS
 * rather than resolving it, and the screen renders from `code` rather than from
 * the human-readable message.
 */
function mount(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

let PartiesPage: (typeof import('./PartiesPage'))['PartiesPage'];

beforeAll(async () => {
  vi.stubEnv('VITE_MOCK', '1');
  ({ PartiesPage } = await import('./PartiesPage'));
});

afterEach(cleanup);

describe('the party book', () => {
  it('lists the seeded rows through the contract', async () => {
    mount(<PartiesPage />);
    expect(await screen.findByText(/total · page 1/)).toBeTruthy();
  });

  it('refuses a duplicate name and says so from the CODE, not the message', async () => {
    const user = userEvent.setup();
    mount(<PartiesPage />);

    // A name the synth corpus CANNOT generate, so this does not depend on which
    // locale the mock was scaffolded with or on which rows the seed produced.
    const UNIQUE = 'Zzz Testfall';

    const add = async () => {
      await user.clear(await screen.findByLabelText('Name'));
      await user.type(await screen.findByLabelText('Name'), UNIQUE);
      await user.clear(await screen.findByLabelText('Balance'));
      await user.type(await screen.findByLabelText('Balance'), '10.00');
      await user.click(screen.getByRole('button', { name: 'Add party' }));
    };

    // NOT `findByText(UNIQUE)`: the book seeds 12 rows and the list pages at 8,
    // so a newly created row is on page 2 and was never going to be visible
    // here. The form clears its Name field only in `onSuccess`, so a cleared
    // input plus no alert is the success signal — and it does not depend on the
    // store's total, which makes it independent of the order these tests run in.
    await add();
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    });
    expect(screen.queryByRole('alert')).toBeNull();

    // The second one is the refusal: the rule returns PARTY_NAME_TAKEN, fail()
    // puts it in the envelope, the adapter THROWS rather than resolving it, and
    // the screen maps the code to its own sentence.
    await add();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/already in the book/i),
    );
  });

  it('refuses a malformed balance with a 400 rather than a 500', async () => {
    const user = userEvent.setup();
    mount(<PartiesPage />);

    await user.type(await screen.findByLabelText('Name'), 'Elke Fischer');
    await user.type(await screen.findByLabelText('Balance'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Add party' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/two decimals/i),
    );
  });
});
