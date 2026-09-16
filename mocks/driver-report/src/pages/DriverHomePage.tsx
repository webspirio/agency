/**
 * THE FIRST SCREEN, AND FOR MOST DRIVERS THE ONLY ONE THEY EVER LOOK AT.
 *
 * Three targets, a plate, one line of state. There is no menu, no tab bar, no
 * settings, no logout and no back arrow anywhere in this product — the failure
 * shape the adoption literature names is navigation DEPTH («three layers of
 * navigation to get to the signature capture»), not length. The client's two
 * previous attempts — a custom app and a Telegram bot — both died, and the brief
 * is «максимум простоти».
 *
 * EVERY DECISION A DRIVER MAKES HERE IS «what am I doing right now», which is a
 * question he can answer without reading. Nothing else is asked of him on this
 * screen and nothing is asked of him anywhere in the product that he would have
 * to type.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@agency/kit/empty-state';
import { Skeleton } from '@agency/kit/skeleton';
import { BigButton, StatusStrip } from '../components/DriverChrome';
import { queries } from '../api/queries';

/**
 * `me` declares NO codes, so `CodeOf<Api, 'me'>` is `never` and a SAYS table
 * here would be `satisfies Record<never, string>` — which is `satisfies {}`, and
 * asserts nothing in EITHER direction. Writing one would look like the checked
 * pattern the write screens use while being decoration; the one honest sentence
 * is the generic one. The moment `me` declares a code, the compiler is what will
 * ask for the table.
 */
const GENERIC = 'Зв’язку немає. Спробуй за хвилину.';

export function DriverHomePage() {
  const navigate = useNavigate();

  /* Through `queries` rather than a hand-written `queryKey: ['me']`: the cache
     key starts with the OPERATION NAME, so it cannot drift from the registry and
     the report screen invalidates it with `queries.keyOf('me')` instead of a
     second string that has to agree with this one. */
  const me = useQuery(queries.query('me', { params: {}, body: undefined }));

  if (me.isPending) {
    return (
      <Shell>
        <Skeleton className="h-[86px] w-[240px] rounded-lg" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[116px] rounded-2xl" />
        <Skeleton className="h-[116px] rounded-2xl" />
        <Skeleton className="h-[116px] rounded-2xl" />
      </Shell>
    );
  }

  if (me.error) {
    return (
      <Shell>
        <EmptyState title="Не відкрилося" hint={GENERIC} />
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="space-y-2">
        {/* THE PLATE IS THE HEADING. On a phone handed between two drivers at a
            gate, it is the one element that answers «це моя машина?» without
            reading a sentence — so it is rendered AS THE OBJECT at ~40px, not as
            text inside one.

            Tapping it does nothing, deliberately. There is no truck picker in
            this build: whether KTL's drivers are permanently paired to a truck
            or float across the fleet is an open question for the call, and a
            picker built on the wrong answer is a list — and a list is reading.
            Deferred until the client says which it is. */}
        <p className="inline-flex items-stretch overflow-hidden rounded-lg border-4 border-black bg-white shadow-sm">
          <span className="flex flex-col items-center justify-center bg-primary px-2 py-1.5 text-primary-foreground">
            <span aria-hidden className="text-[10px] leading-none">
              ★
            </span>
            <span className="mt-0.5 text-[11px] leading-none font-bold tracking-widest">UA</span>
          </span>
          <span className="px-3 py-1 font-mono text-[40px] leading-[1.15] font-bold tracking-[0.06em] text-black tabular-nums">
            {me.data.plate}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">{me.data.model}</p>
        <p className="text-lg font-semibold">{me.data.driver_name}</p>
      </header>

      <StatusStrip today={me.data.today} queued={me.data.queued} />

      <div className="space-y-3">
        <BigButton tone="primary" sub="фото ТТН + спідометр" onClick={() => navigate('/z/LOADING')}>
          Завантаження
        </BigButton>
        <BigButton
          tone="primary"
          sub="фото ТТН з печаткою + спідометр"
          onClick={() => navigate('/z/UNLOADING')}
        >
          Вивантаження
        </BigButton>
        {/* ЗАПРАВКА IS ON THE HOME SCREEN AND NOT INSIDE A TRIP, and that is the
            single most consequential placement on this screen. Fuel logging is
            the one feature every adoption source names as the one drivers skip,
            because it happens at the pump with a nozzle in one hand — anything
            that costs a navigation step to reach is not reached. The client said
            the same thing in his own words: «маленькими окремими модулями це
            йдуть заправки». */}
        <BigButton tone="accent" sub="фото чека + спідометр" onClick={() => navigate('/z/REFUEL')}>
          Заправка
        </BigButton>
      </div>

      {/* The one screen that gives the driver something back rather than taking
          something from him — quiet, at the bottom, and never a tab. An app that
          only increases oversight is uninstalled; nothing in the client's brief
          gave the driver a single reason to open this one. */}
      <a
        href="#/moi"
        className="block py-2 text-center text-base text-primary underline underline-offset-4"
      >
        Мої звіти за тиждень
      </a>

      {/* FREE, AND IT BUYS THE WHOLE PRODUCT. Surveillance fear is the top named
          barrier to driver-app adoption, and it is answered by stating the scope
          of collection in one sentence a driver can read in two seconds —
          permanently, on the screen he opens, rather than in a policy nobody
          opens. It is also TRUE of this design: there is no background tracking
          here, because Ruptela already holds where the truck was every 30
          seconds and a second tracker would be paying twice for one fact. */}
      <p className="text-center text-sm text-muted-foreground">
        Місце зберігаємо тільки в момент запису.
      </p>
    </Shell>
  );
}

/**
 * 520px, centred, 16px gutters. Designed at 360 and allowed to grow: the phone
 * in a cab is the target and everything wider is the same column with more
 * paper around it.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[520px] space-y-5 px-4 pt-6 pb-10">{children}</div>
    </main>
  );
}
