import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@agency/kit/button';
import { ConfirmDialog } from '@agency/kit/confirm-dialog';
import type { Column } from '@agency/kit/data-table';
import { EmptyState } from '@agency/kit/empty-state';
import { Field } from '@agency/kit/field';
import { Skeleton } from '@agency/kit/skeleton';
import { TextInput } from '@agency/kit/text-input';
import { ListPage } from '@agency/kit/templates/list-page';
import { httpClient } from '../api/client';
import { call, codeOf } from '../api/contract';
import type { Party } from '../domain/types';

/**
 * The write screen — the whole reason a mock has a store. Measured in the two
 * real mocks: 4 of logistic's 8 demo screens and both of yagoda's uncuttable
 * steps are the client watching a record be created, changed or refused.
 *
 * All five party operations are reached from here (`listParties`, `getParty`,
 * `createParty`, `renameParty`, `removeParty`), which is what lets `api:bound`
 * assert that no operation exists with nothing calling it.
 *
 * Every refusal is rendered from its `code`. The set of codes each branch can
 * see is closed by the contract, so a misspelling here is a compile error and a
 * code the operation cannot emit is unreachable by construction.
 */

/** A refusal message per declared code. Read from `code`, never from `message`. */
const SAYS: Record<string, string> = {
  PARTY_NAME_TAKEN: 'That name is already in the book.',
  PARTY_NAME_BLANK: 'A party needs a name.',
  PARTY_BALANCE_INVALID: "A balance looks like '1240.00' — two decimals, no separators.",
  PARTY_NOT_FOUND: 'That party is no longer there. Reload the list.',
};

const says = (error: unknown, code: string | undefined): string =>
  error ? (SAYS[code ?? ''] ?? `Something went wrong (${code ?? 'UNKNOWN'}).`) : '';

const LIMIT = '8';

export function PartiesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Party | null>(null);
  const [draft, setDraft] = useState({ name: '', company: '', address: '', balance: '' });
  const [rename, setRename] = useState('');

  const list = useQuery({
    queryKey: ['parties', page],
    queryFn: () =>
      call(httpClient, 'listParties', {
        params: {},
        body: undefined,
        qry: { page: String(page), limit: LIMIT },
      }),
  });

  const detail = useQuery({
    queryKey: ['party', selectedId],
    enabled: selectedId !== null,
    queryFn: () => {
      // Guarded rather than asserted: `enabled` keeps this from running with a
      // null id, and a non-null assertion would be a claim the type cannot see.
      if (selectedId === null) throw new Error('PartiesPage: detail query ran with no selection');
      return call(httpClient, 'getParty', { params: { id: selectedId }, body: undefined });
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['parties'] });
    await queryClient.invalidateQueries({ queryKey: ['party'] });
  };

  const create = useMutation({
    mutationFn: () => call(httpClient, 'createParty', { params: {}, body: draft }),
    onSuccess: async () => {
      setDraft({ name: '', company: '', address: '', balance: '' });
      await invalidate();
    },
  });

  const patch = useMutation({
    mutationFn: (id: string) =>
      call(httpClient, 'renameParty', { params: { id }, body: { name: rename } }),
    onSuccess: async () => {
      setRename('');
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      call(httpClient, 'removeParty', { params: { id }, body: undefined }),
    onSuccess: async () => {
      setSelectedId(null);
      setConfirming(null);
      await invalidate();
    },
  });

  const columns: Column<Party>[] = [
    { id: 'name', header: 'Name', cell: (row) => row.name },
    { id: 'company', header: 'Company', cell: (row) => row.company, hideBelow: 'sm' },
    {
      id: 'created_at',
      header: 'Since',
      cell: (row) => row.created_at.slice(0, 10),
      hideBelow: 'md',
    },
    {
      id: 'balance',
      header: 'Balance',
      align: 'right',
      // Decimal strings are rendered VERBATIM. Formatting one through a Number
      // is how a demo total stops matching the lines above it.
      className: 'tnum font-mono whitespace-nowrap',
      cell: (row) => row.balance,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setConfirming(row);
          }}
        >
          Delete
        </Button>
      ),
    },
  ];

  if (list.isPending) {
    return (
      <Shell>
        <div className="space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-72" />
        </div>
      </Shell>
    );
  }

  if (list.error) {
    return (
      <Shell>
        <EmptyState
          title="The party list did not come back"
          hint={says(list.error, codeOf('listParties', list.error))}
        />
      </Shell>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <Shell>
      <ListPage
        eyebrow="Book"
        title="Parties"
        description="Create, rename and remove a party. Every change lands in a store that lives as long as the page — a reload is 'reset demo data'."
        actions={
          <a className="text-sm text-primary underline underline-offset-4" href="#/">
            Back to the overview
          </a>
        }
        columns={columns}
        rows={list.data.data}
        rowKey={(row) => row.id}
        onRowClick={(row) => {
          setSelectedId(row.id);
          setRename(row.name);
        }}
        isEmpty={list.data.data.length === 0}
        empty={<EmptyState title="No parties on this page" />}
        footer={
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {list.data.total} total · page {list.data.page} · {list.data.limit} per page
            </span>
            <span className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={list.data.page === 1}
                onClick={() => setPage(list.data.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={list.data.data.length === 0}
                onClick={() => setPage(list.data.page + 1)}
              >
                Next
              </Button>
            </span>
          </div>
        }
      />

      <section className="mx-auto mt-6 grid w-full max-w-[1200px] gap-4 lg:grid-cols-2">
        <form
          onSubmit={submit}
          className="rounded-xl border border-border bg-card p-4"
          aria-label="Add a party"
        >
          <h2 className="mb-3 font-display text-lg">Add a party</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="name" label="Name" required>
              {(a11y) => (
                <TextInput
                  {...a11y}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              )}
            </Field>
            <Field name="company" label="Company">
              {(a11y) => (
                <TextInput
                  {...a11y}
                  value={draft.company}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                />
              )}
            </Field>
            <Field name="address" label="Address">
              {(a11y) => (
                <TextInput
                  {...a11y}
                  value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                />
              )}
            </Field>
            <Field name="balance" label="Balance" hint="Two decimals, e.g. 1240.00">
              {(a11y) => (
                <TextInput
                  {...a11y}
                  value={draft.balance}
                  onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={create.isPending}>
              Add party
            </Button>
            {create.error ? (
              <p role="alert" className="text-sm text-destructive">
                {says(create.error, codeOf('createParty', create.error))}
              </p>
            ) : null}
          </div>
        </form>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg">Selected party</h2>
          {selectedId === null ? (
            <EmptyState title="Pick a row" hint="The detail comes from its own request." />
          ) : detail.isPending ? (
            <Skeleton className="h-24" />
          ) : detail.error ? (
            <EmptyState
              title="That party did not come back"
              hint={says(detail.error, codeOf('getParty', detail.error))}
            />
          ) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Company</dt>
                <dd>{detail.data.company}</dd>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{detail.data.address}</dd>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="tnum font-mono">{detail.data.balance}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{detail.data.created_at.slice(0, 10)}</dd>
              </dl>
              <Field name="rename" label="Rename">
                {(a11y) => (
                  <TextInput {...a11y} value={rename} onChange={(e) => setRename(e.target.value)} />
                )}
              </Field>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  disabled={patch.isPending}
                  onClick={() => patch.mutate(detail.data.id)}
                >
                  Save name
                </Button>
                {patch.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {says(patch.error, codeOf('renameParty', patch.error))}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => setConfirming(open ? confirming : null)}
        title="Remove this party?"
        description={confirming ? `${confirming.name} will be removed from the book.` : undefined}
        confirmLabel="Remove"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (confirming) remove.mutate(confirming.id);
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-background px-4 py-8 sm:px-6">{children}</div>;
}
