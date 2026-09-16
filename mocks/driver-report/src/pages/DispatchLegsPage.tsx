import { useQuery } from '@tanstack/react-query';
import type { Column } from '@agency/kit/data-table';
import { DataTable } from '@agency/kit/data-table';
import { EmptyState } from '@agency/kit/empty-state';
import { Skeleton } from '@agency/kit/skeleton';
import { cn } from '@agency/kit/lib/cn';
import { httpClient } from '../api/client';
import { call } from '../api/contract';
import { DispatchShell } from './DispatchQueuePage';
import type { Leg } from '../domain/types';

/**
 * РЕЙСИ — and not one of them was typed by a driver.
 *
 * A рейс here is a QUERY, not a row somebody maintained: `legsOf` in
 * `src/domain/calc.ts` pairs each LOADING with the next UNLOADING on the same
 * truck and attaches every REFUEL between them. That is the whole argument of
 * this screen — the office gets a trip register out of four taps at a gate,
 * because nobody had to keep a trip object alive on a phone.
 *
 * The screen therefore has to be honest about the two places where the answer is
 * NOT a number. Both are marked «—», and neither is a zero.
 */

/* Sliced, never parsed — `new Date(iso)` would apply the presenter's timezone to
   a wire value the morning of the call. */
const dmy = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const hhmm = (iso: string): string => iso.slice(11, 16);
const stamp = (iso: string): string => `${dmy(iso)} ${hhmm(iso)}`;

/* Display grouping on a whole-kilometre COUNT. Never on a `Decimal2`: every
   litre and every l/100km on this screen is rendered verbatim, because a
   formatter is how a printed total stops matching the printed lines. */
const km = (value: number): string => value.toLocaleString('uk-UA');

/**
 * A NEGATIVE DISTANCE IS A DROPPED DIGIT, AND IT MUST SAY SO HERE.
 *
 * FOUND 2026-09-16 by looking at the running screen: the seeded leg where a
 * driver typed 24 148 for 241 480 rendered «Пробіг, км −216 852» in the same
 * plain figures as every correct row. The EVENT carries `ODOMETER_BACKWARDS` and
 * the queue shows it in amber — but a leg is a derivation and carries no flags,
 * so by the time the office reads it as a рейс the warning is gone and only a
 * nonsense number is left.
 *
 * Amber, never red, for the same reason the queue uses amber: nothing was
 * refused. The leg is real, both events are stored, and a human has to decide
 * which reading is wrong — which they cannot do if the screen does not tell them
 * there is something to decide.
 */
const suspect = (value: number | null): boolean => value !== null && Math.sign(value) === -1;

function Distance({ value }: { value: number | null }) {
  if (value === null) return <Unknown />;
  if (!suspect(value)) return <>{km(value)}</>;
  return (
    <span className="text-amber" title="Спідометр на вивантаженні менший, ніж на завантаженні">
      {km(value)} ⚠
    </span>
  );
}

const EN_DASH = '—';

export function DispatchLegsPage() {
  const legs = useQuery({
    queryKey: ['legs'],
    queryFn: () =>
      call(httpClient, 'listLegs', { params: {}, body: undefined, qry: { limit: '50' } }),
  });

  const rows = legs.data?.data ?? [];

  /**
   * The wide-screen table. Four columns fall away below their breakpoint rather
   * than being squeezed — but the phone does NOT get this table at all: it gets
   * the card stack below, because a horizontally scrolling table on a director's
   * phone between meetings is the same as no table.
   */
  const columns: Column<Leg>[] = [
    {
      id: 'plate',
      header: 'Авто',
      cell: (leg) => (
        <span className="font-medium whitespace-nowrap">{leg.plate}</span>
      ),
    },
    { id: 'driver', header: 'Водій', cell: (leg) => leg.driver_name, hideBelow: 'lg' },
    {
      id: 'route',
      header: 'Маршрут',
      cell: (leg) => (
        <span className="block max-w-[260px] truncate">
          {leg.from_place} → {leg.to_place}
        </span>
      ),
      hideBelow: 'md',
    },
    {
      id: 'started',
      header: 'Виїзд',
      cell: (leg) => <span className="whitespace-nowrap">{stamp(leg.started_at)}</span>,
      hideBelow: 'lg',
    },
    {
      id: 'ended',
      header: 'Повернення',
      cell: (leg) =>
        leg.ended_at === null ? <OnTheRoad /> : (
          <span className="whitespace-nowrap">{stamp(leg.ended_at)}</span>
        ),
    },
    {
      id: 'spidometr',
      header: 'Спідометр',
      align: 'right',
      className: 'font-mono tabular-nums whitespace-nowrap',
      cell: (leg) =>
        `${km(leg.odometer_out_km)} → ${leg.odometer_in_km === null ? EN_DASH : km(leg.odometer_in_km)}`,
      hideBelow: 'md',
    },
    {
      id: 'km',
      header: 'Пробіг, км',
      align: 'right',
      className: 'font-mono tabular-nums',
      cell: (leg) => <Distance value={leg.km} />,
    },
    {
      id: 'litres',
      header: 'Літрів',
      align: 'right',
      className: 'font-mono tabular-nums',
      // A decimal string, verbatim.
      cell: (leg) => leg.litres,
      hideBelow: 'sm',
    },
    {
      id: 'rate',
      header: 'л/100 км',
      align: 'right',
      className: 'font-mono tabular-nums whitespace-nowrap',
      cell: (leg) => <Rate leg={leg} />,
    },
  ];

  return (
    <DispatchShell current="#/reisy">
      <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">Рейси</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        Жоден рейс тут не заведений вручну: кожен зібраний із завантаження, наступного
        вивантаження тієї самої машини і заправок між ними.
      </p>

      {/**
       * THE NORM IS THE CLIENT'S OWN, and this line is on the screen rather than
       * in a comment because somebody on the call will ask which norm it is.
       *
       * There is no state norm left to point at: наказ Мінтрансу №43 was
       * repealed by наказ Мінінфраструктури №1011 від 02.11.2023, leaving only
       * ДержавтотрансНДІпроект's advisory Базові норми, which each enterprise
       * adopts by its own internal наказ. So the figure in `norm_l_100km` is
       * KTL's, per truck, and this product neither supplies nor validates it.
       */}
      <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Норма — власна, затверджена внутрішнім наказом підприємства: державної норми немає з
        02.11.2023 (наказ Мінтрансу №43 скасовано наказом Мінінфраструктури №1011).
      </p>

      {legs.isPending ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : legs.error ? (
        <div className="mt-5">
          <EmptyState title="Рейси не завантажились" hint="Онови сторінку." />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Рейсів ще немає"
            hint="Рейс з’являється, коли машина завантажилась — і закривається, коли вивантажилась."
          />
        </div>
      ) : (
        <>
          {/* The phone gets cards. Not a scaled-down table, not a scroller. */}
          <ul className="mt-5 space-y-2 sm:hidden">
            {rows.map((leg) => (
              <li key={leg.id}>
                <LegCard leg={leg} />
              </li>
            ))}
          </ul>

          <div className="mt-5 hidden sm:block">
            <DataTable<Leg> columns={columns} rows={rows} rowKey={(leg) => leg.id} />
          </div>
        </>
      )}
    </DispatchShell>
  );
}

/**
 * AN OPEN LEG IS NOT AN ERROR. It is what most of a working fleet looks like at
 * any moment: loaded this morning, somewhere on the M-18, not yet unloaded. So
 * it reads «В дорозі» in muted ink, never amber and never red — the only thing
 * wrong with it is that it has not finished happening.
 */
function OnTheRoad() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground" />
      В дорозі
    </span>
  );
}

/** «—», and the reason it is not a zero is on whichever caller renders it. */
function Unknown() {
  return <span className="text-muted-foreground">{EN_DASH}</span>;
}

/**
 * CONSUMPTION, OR THE ADMISSION THAT IT IS UNKNOWN.
 *
 * `l_100km === null` on a CLOSED leg means no refuel was reported on it — the
 * truck ran on fuel bought before it started. That is UNKNOWN consumption, not
 * zero consumption, and `calc.ts` refuses to emit `0.00` for it precisely
 * because a zero in this column reads as a measurement, is a fabrication, and
 * drags every fleet average computed over it downwards.
 *
 * `over_norm` is not tidiness — it is a tax exposure. Fuel burnt above the
 * enterprise's own approved norm is not economic activity, so it triggers a
 * compensating VAT liability under пп.«г» п.198.5 ПКУ. That is why the actual
 * and the norm are printed together: the accountant needs the difference, not a
 * verdict, and amber says "look at this", not "this was refused".
 */
function Rate({ leg }: { leg: Leg }) {
  if (leg.l_100km === null) {
    return (
      <span className="text-muted-foreground" title="Заправок на цьому рейсі не було">
        {EN_DASH}
      </span>
    );
  }

  return (
    <span className={cn(leg.over_norm && 'font-semibold text-amber')}>
      {/* Both verbatim. Never reformatted, never through a Number. */}
      {leg.l_100km}
      {leg.over_norm ? <span className="font-normal"> / норма {leg.norm_l_100km}</span> : null}
    </span>
  );
}

/** The phone's row: the same nine facts, stacked, at a size a thumb can scroll
 *  past and an eye can read in a lift. */
function LegCard({ leg }: { leg: Leg }) {
  return (
    <article className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{leg.plate}</span>
        {leg.ended_at === null ? (
          <OnTheRoad />
        ) : (
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
            {stamp(leg.ended_at)}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">{leg.driver_name}</p>
      <p className="mt-1 text-sm">
        {leg.from_place} → {leg.to_place}
      </p>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Виїзд</dt>
        <dd className="text-right font-mono tabular-nums">{stamp(leg.started_at)}</dd>

        <dt className="text-muted-foreground">Спідометр</dt>
        <dd className="text-right font-mono tabular-nums">
          {km(leg.odometer_out_km)} →{' '}
          {leg.odometer_in_km === null ? EN_DASH : km(leg.odometer_in_km)}
        </dd>

        <dt className="text-muted-foreground">Пробіг, км</dt>
        <dd className="text-right font-mono tabular-nums">
          <Distance value={leg.km} />
        </dd>

        <dt className="text-muted-foreground">Літрів</dt>
        <dd className="text-right font-mono tabular-nums">{leg.litres}</dd>

        <dt className="text-muted-foreground">л/100 км</dt>
        <dd className="text-right font-mono tabular-nums">
          <Rate leg={leg} />
        </dd>
      </dl>
    </article>
  );
}
