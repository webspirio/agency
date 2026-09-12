import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@agency/kit/empty-state';
import { Skeleton } from '@agency/kit/skeleton';
import { DashboardPage } from '@agency/kit/templates/dashboard-page';
import { httpClient } from '../api/client';
import { call, codeOf } from '../api/contract';
import { PROFILE } from '../profiles';

/**
 * The first screen. It exists to prove four things are wired before a line of
 * client domain is written: the adapter answers, `@agency/kit` is styled (every
 * surface below is a kit component — if they render as unstyled boxes the
 * `@source` line in index.css is wrong), the error path reads `code` rather than
 * a message string, and the request goes through the CONTRACT rather than a
 * hand-written URL.
 *
 * Note what is NOT here: no path literal and no response type argument. `call`
 * takes an operation KEY, and both the URL and the response type come from
 * `src/api/contract.ts`. That is what makes the two sides one claim instead of
 * two that happen to agree — and it is what `api:bound` checks.
 *
 * Replace it. Do not build the client's screens around it.
 */
function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-background px-4 py-8 sm:px-6">{children}</div>;
}

export function OverviewPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['overview'],
    queryFn: () => call(httpClient, 'overview', { params: {}, body: undefined }),
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
        </div>
      </Shell>
    );
  }

  if (error) {
    // `codeOf` is keyed to the operation, so the set of codes this branch can
    // see is exactly the set `overview` declares — HARD RULE 5 says branch on
    // `code` and nothing else.
    return (
      <Shell>
        <div className="mx-auto w-full max-w-[1400px]">
          <EmptyState
            title="The overview request did not come back"
            hint={`Error code: ${codeOf('overview', error) ?? 'UNKNOWN'}. Every handler lives in src/api/routes.ts.`}
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
        description="Deterministic seed data, regenerated on every load. Replace src/domain/{types,seed,rules,calc}.ts and src/api/contract.ts with the client's."
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
            content: (
              <a className="text-primary underline underline-offset-4" href="#/parties">
                Open the party book
              </a>
            ),
          },
        ]}
      />
    </Shell>
  );
}
