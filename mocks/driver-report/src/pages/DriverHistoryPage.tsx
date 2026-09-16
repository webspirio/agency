/**
 * «МОЇ ЗВІТИ ЗА ТИЖДЕНЬ» — the only screen in this product that GIVES the driver
 * something instead of taking something from him.
 *
 * It exists because every adoption source converges on the same cause of death:
 * an app that only increases oversight is uninstalled. The client's brief did
 * not contain one reason for a driver to open this thing — every requirement in
 * it was a fact the office wanted. This screen is that reason, and it is cheap:
 * the rows already exist, and the man who took the photographs is the one person
 * who has never been able to see what he sent.
 *
 * It is also where the product tells the truth about what it is NOT. See the
 * last paragraph on the page.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@agency/kit/empty-state';
import { Skeleton } from '@agency/kit/skeleton';
import { BigButton } from '../components/DriverChrome';
import { DashCluster, FuelReceipt, PaperTtn } from '../components/Artifacts';
import { queries } from '../api/queries';
import type { DriverEvent, EventKind } from '../domain/types';

const KIND_SAYS: Readonly<Record<EventKind, string>> = {
  LOADING: 'Завантаження',
  UNLOADING: 'Вивантаження',
  REFUEL: 'Заправка',
};

/** Enough to cover a week of one truck without a pager. A driver scrolls; he
 *  does not page, and a «далі» button is a control that can be pressed wrongly. */
const LIMIT = '60';

export function DriverHistoryPage() {
  const navigate = useNavigate();

  const me = useQuery(queries.query('me', { params: {}, body: undefined }));

  /* NO `pending` FILTER. The driver's week is everything he sent, confirmed or
     not — the office's reading queue is the office's business and showing it
     here would turn his own screen into another status board about him. */
  const list = useQuery(
    queries.query('listEvents', { params: {}, body: undefined, qry: { limit: LIMIT } }),
  );

  if (me.isPending || list.isPending) {
    return (
      <Shell>
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </Shell>
    );
  }

  if (me.error || list.error) {
    return (
      <Shell>
        <EmptyState title="Не відкрилося" hint="Зв’язку немає. Спробуй за хвилину." />
      </Shell>
    );
  }

  /* HIS OWN ROWS, NARROWED HERE — and that is a mock's compromise rather than
     the design. `listEvents` is shared with the dispatcher deliberately (one
     operation, one response shape, the filtering is the server's job), and in
     the product the bearer's own driver_id narrows it before a row leaves the
     database. The mock has no session to narrow by, so the screen filters on the
     truck the bound driver drives. The row a driver must never see is another
     driver's, and this is where that stops being true if it is left as is. */
  const mine = list.data.data.filter((row) => row.truck_id === me.data.truck_id);

  /* INTEGER kilometres, and the arithmetic is allowed here: the money rules are
     off under src/pages, and an odometer is a count rather than a decimal. The
     figure is the spread between his lowest and highest reading, which is a
     FLOOR on the distance driven, never the distance itself — it under-reports
     every kilometre driven before the first report of the week. Anything
     stronger belongs in `legsOf`, where the office computes it from pairs. */
  const readings = mine.map((row) => row.odometer_km);
  const km = readings.length === 0 ? 0 : Math.max(...readings) - Math.min(...readings);

  return (
    <Shell>
      <header className="space-y-1">
        <h1 className="text-3xl leading-tight font-bold tracking-tight">Мої звіти</h1>
        <p className="text-base text-muted-foreground">
          {me.data.driver_name} · {me.data.plate}
        </p>
      </header>

      {/* Two numbers, both big, both HIS. Not a dashboard: a dashboard is a
          screen somebody else reads about him. */}
      <div className="grid grid-cols-2 gap-3">
        <Figure value={String(mine.length)} label="звітів" />
        <Figure value={km.toLocaleString('uk-UA')} label="км за тиждень" />
      </div>

      {mine.length === 0 ? (
        <EmptyState
          title="Поки що порожньо"
          hint="Як тільки запишеш перше завантаження — воно з’явиться тут."
        />
      ) : (
        <ul className="space-y-3">
          {mine.map((row) => (
            <li
              key={row.id}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <Thumb row={row} />
              <div className="min-w-0 flex-1">
                <p className="text-lg leading-tight font-bold">{KIND_SAYS[row.kind]}</p>
                <p className="truncate text-sm text-muted-foreground">{row.place}</p>
                <p className="mt-1 font-mono text-sm tabular-nums">
                  {stamp(row.occurred_at)} · {row.odometer_km.toLocaleString('uk-UA')} км
                </p>
                {/* Litres and hryvnia are DECIMAL STRINGS off the wire and are
                    rendered verbatim. Reformatting one here — through a Number,
                    a toFixed, or a locale formatter — is how a demo total stops
                    matching the lines above it. */}
                {row.litres === null ? null : (
                  <p className="font-mono text-sm tabular-nums text-muted-foreground">
                    {row.litres} л
                    {row.amount_uah === null ? null : <> · {row.amount_uah} грн</>}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <BigButton tone="quiet" onClick={() => navigate('/')}>
        На головну
      </BigButton>

      {/* THE HONEST LINE, and it is here rather than in a policy page because
          this is the screen where a driver would otherwise conclude the app is
          counting his hours.

          From 26.07.2026 the new Положення — наказ №340 in the наказ №1727
          redaction — covers domestic carriage above 3.5 t, and the TACHOGRAPH is
          the legal record of working time. This product records four taps and a
          photograph. Letting a driver believe otherwise is the kind of promise
          that ends a client relationship at the first inspection, and it costs
          one sentence to not make it. */}
      <p className="text-center text-sm text-muted-foreground">
        Це не тахограф. Години тут — для обліку, не для перевірки.
      </p>
    </Shell>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <p className="rounded-2xl bg-muted px-4 py-4 text-center">
      <span className="block font-mono text-4xl leading-none font-bold tabular-nums">{value}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{label}</span>
    </p>
  );
}

/**
 * The drawn artefact, shrunk. Scaled rather than redrawn at thumbnail size: the
 * artefacts RE-RENDER per row, so each thumbnail carries that row's own ТТН
 * number, plate and litres instead of one stock picture repeated eleven times —
 * which is the detail that makes a demo read as a product. Clipped by the box on
 * purpose; `aria-hidden` because the row already states the kind in words.
 */
function Thumb({ row }: { row: DriverEvent }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none block h-[76px] w-[76px] shrink-0 overflow-hidden rounded-lg bg-muted"
    >
      <span className="block w-[340px] origin-top-left scale-[0.2235]">
        {row.kind === 'REFUEL' ? (
          <FuelReceipt
            station={row.place}
            litres={row.litres}
            amount={row.amount_uah}
            date={dayOf(row.occurred_at)}
            plate={row.plate}
          />
        ) : row.photo_kind === 'DASH' ? (
          <DashCluster km={row.odometer_km} />
        ) : (
          <PaperTtn
            number={row.ttn_number}
            date={dayOf(row.occurred_at)}
            plate={row.plate}
            driverName={row.driver_name}
            from={row.place}
            to={row.place}
            stamped={row.kind === 'UNLOADING'}
          />
        )}
      </span>
    </span>
  );
}

/**
 * `дд.мм · гг:хх`, by SLICING the ISO instant rather than parsing it.
 *
 * The wire carries UTC, and this renders UTC. That is a deliberate omission
 * rather than a bug: converting to Europe/Kyiv is the product's job and it is
 * one line of Intl, but a mock that quietly shifted every timestamp by two or
 * three hours would be asserting a DST rule nobody has checked in front of a
 * client who knows what time he left the silo. Slicing also keeps `new Date()`
 * — and therefore a machine's timezone — out of a screen whose output is
 * compared against a seeded fixture.
 */
function stamp(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} · ${iso.slice(11, 16)}`;
}

/** The date PRINTED ON THE DOCUMENT, which carries no time — a ТТН is dated, not
 *  timestamped, and putting `06:10` in that field is the kind of detail this
 *  client's own logistician spots in a second. */
function dayOf(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[520px] space-y-4 px-4 pt-6 pb-10">{children}</div>
    </main>
  );
}
