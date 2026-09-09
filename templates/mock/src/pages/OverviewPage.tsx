import type { ReactNode } from 'react';
import { AxiosError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import type { ErrorEnvelope } from '@agency/mock';
import { DataTable, type Column } from '@agency/kit/data-table';
import { EmptyState } from '@agency/kit/empty-state';
import { Skeleton } from '@agency/kit/skeleton';
import { DashboardPage } from '@agency/kit/templates/dashboard-page';
import { httpClient } from '../api/client';
import type { Overview, Party } from '../domain/types';
import { PROFILE } from '../profiles';

/**
 * The placeholder screen. It exists to prove three things are wired before a
 * single line of client domain is written: the adapter answers, `@agency/kit`
 * is styled (every surface below is a kit component — if they render as
 * unstyled boxes, the `@source` line in index.css is wrong), and the error
 * path reads `code` rather than a message string.
 *
 * Replace it. Do not build the client's screens around it.
 */

const COLUMNS: Column<Party>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name },
  { id: 'company', header: 'Company', cell: (row) => row.company, hideBelow: 'sm' },
  { id: 'address', header: 'Address', cell: (row) => row.address, hideBelow: 'md' },
  {
    id: 'balance',
    header: 'Balance',
    align: 'right',
    // Decimal strings are rendered verbatim. Formatting them through a Number
    // is how a demo total stops matching the lines above it.
    className: 'tnum font-mono whitespace-nowrap',
    cell: (row) => row.balance,
  },
];

/** The envelope's `code` is THE discriminator; `message` is for humans and
 *  `error` is decorative. Branching on anything else breaks at conversion. */
function codeOf(error: unknown): string {
  if (!(error instanceof AxiosError)) return 'UNKNOWN';
  const envelope = error.response?.data as ErrorEnvelope | undefined;
  return envelope?.code ?? 'UNKNOWN';
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-background px-4 py-8 sm:px-6">{children}</div>;
}

export function OverviewPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await httpClient.get<Overview>('/overview')).data,
  });

  if (isPending) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-[1400px] space-y-5">
          <Skeleton className="h-9 w-64" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-72" />
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-[1400px]">
          <EmptyState
            title="The overview request did not come back"
            hint={`Error code: ${codeOf(error)}. Every handler lives in src/api/routes.ts.`}
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <DashboardPage
        eyebrow={PROFILE.label}
        title={data.headline}
        description="Deterministic seed data, regenerated on every load. Replace src/domain/{types,seed,calc}.ts and src/api/routes.ts with the client's."
        statColumns={3}
        stats={[
          { label: 'Parties', value: data.rows },
          { label: 'Total balance', value: data.total, tone: 'berry' },
          {
            label: 'Generated',
            value: data.generated_at.slice(11, 19),
            hint: data.generated_at.slice(0, 10),
          },
        ]}
        sections={[
          {
            id: 'parties',
            eyebrow: 'Ledger',
            title: 'Balances',
            span: 'full',
            // The table draws its own card shell; a card inside a card is two
            // outlines.
            card: false,
            content: (
              <DataTable
                columns={COLUMNS}
                rows={data.parties}
                rowKey={(row) => row.id}
                empty={<EmptyState title="No parties in the seed" />}
              />
            ),
          },
        ]}
      />
    </Shell>
  );
}
