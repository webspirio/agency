// mocks/driver-report/src/pages/driver/MonthPage.tsx
/**
 * «Мій місяць» (§3.3 D-16, §8.2 D-15/16 #3) — his month as FACTS, and the screen the whole design says no to a
 * scoreboard on.
 *
 * There is no ranking here, no comparison with another driver, no money, no fuel and no kilometres or tonnes
 * presented as an achievement (§8.6 #12). What it counts is what he did: shifts, hours on shift, hours at the
 * points, documents accepted, originals accepted. Every one of those sentences is worded by `myMonthView` (I-12) —
 * this page renders `MyMonth.title`, `lines` and one row per shift day and computes nothing, which is the only way
 * a number cannot quietly become a rating on the way to the screen.
 *
 * A day row opens that day's «Мій день», so the month is a way INTO his own record rather than a summary that
 * replaces it.
 */
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useMyMonth } from '../../api/hooks';
import { DriverSkeleton, LightPage } from '../../components/driver';

const TITLE = 'Мій місяць';
const TACHO = 'Робочий час — за тахографом, після зчитування картки';
const EMPTY = 'Цього місяця змін не було';

export function MonthPage(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const month = params.month ?? '';
  const view = useMyMonth(month).data;

  return (
    <LightPage title={TITLE} onBack={() => { navigate('/'); }}>
      {view === undefined ? <DriverSkeleton /> : (
        <>
          <section className="card-ring flex flex-col gap-1 p-3">
            <h2 className="text-[1.625rem] leading-[2rem] font-semibold tracking-[-0.015em]">{view.title}</h2>
            {view.lines.map((line) => (
              <p key={line} className="tnum text-[1.125rem] leading-[1.625rem]">{line}</p>
            ))}
            <p className="pt-1 text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>{TACHO}</p>
          </section>
          {view.days.length === 0 ? (
            <p className="py-6 text-[1.125rem] leading-[1.625rem]" style={{ color: 'var(--text-2)' }}>{EMPTY}</p>
          ) : view.days.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => { navigate(`/day/${d.date}`); }}
              className="card-ring flex min-h-[4rem] w-full items-center gap-2 py-3 pr-2 pl-4 text-left"
            >
              <span className="tnum min-w-0 flex-1 text-[1.0625rem] leading-[1.5rem]">{d.line}</span>
              <ChevronRight aria-hidden="true" className="size-[1.25rem] shrink-0" style={{ color: 'var(--text-2)' }} />
            </button>
          ))}
        </>
      )}
    </LightPage>
  );
}
