/**
 * THE REPORT. One route, `#/z/:kind`, and the steps are STATE rather than
 * routes.
 *
 * That is deliberate and it is not a shortcut. A per-step route gives the
 * browser a back button, and a back button in a linear flow is the thing that
 * puts a half-finished report in front of a man at a gate with no way to tell
 * which half is finished. The flow is linear and unskippable: three steps on a
 * truck with no telematics, TWO on a truck with, and the only way out is
 * forward or the hardware back gesture, which lands on the home screen.
 *
 * `#/z/LOADING` is deep-linkable on purpose — that is what a geofence push would
 * open in production, and what a presenter needs on a call.
 *
 * THE DRIVER TYPES NOTHING HERE except in the one escape hatch at the bottom of
 * the odometer step. Not the ТТН number (the dispatcher reads it off the photograph — 8–12
 * keystrokes relocated to a person sitting down, in light, with two clean
 * hands), not the loading point, not the time.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@agency/kit/empty-state';
import { Skeleton } from '@agency/kit/skeleton';
import { useNavigate, useParams } from 'react-router';
import type { CodeOf } from '@agency/mock';
import { BigButton, CameraTile, Keypad, Step } from '../components/DriverChrome';
import { DashCluster, FuelReceipt, PaperTtn } from '../components/Artifacts';
import { httpClient } from '../api/client';
import { call, codeOf, type Api } from '../api/contract';
import { queries } from '../api/queries';
import type { EventKind, Me, OdometerSource, PhotoKind } from '../domain/types';

/**
 * A REFUSAL SENTENCE PER DECLARED CODE, read from `code` and never from
 * `message` (HARD RULE 5). `satisfies Record<CodeOf<Api, 'submitEvent'>, string>`
 * closes the table in both directions: a declared code with no sentence is
 * TS1360 naming the code, and a sentence for a code `submitEvent` cannot emit is
 * TS2353 naming the key.
 *
 * All three are written for a reader the client describes as малоосвічений:
 * short, no jargon, and each one says what to DO rather than what went wrong.
 *
 * PHOTO_WRONG_KIND is UNREACHABLE FROM THIS SCREEN BY CONSTRUCTION — `PHOTO_OF`
 * below derives the photo kind from the event kind, so the two cannot disagree.
 * That is deliberate rather than an oversight: the rule exists for the API,
 * which a future integration will call without this UI in front of it, and the
 * sentence exists because the compiler requires one for every declared code. A
 * code nothing can emit from here is a code the backend can still emit.
 */
const SAYS = {
  ODOMETER_INVALID: 'Спідометр — це тільки цифри, без крапок і пробілів. Спробуй ще раз.',
  PHOTO_WRONG_KIND: 'Фото не те. Почни запис заново.',
  TRUCK_NOT_FOUND: 'Машину не знайшли. Подзвони в офіс.',
} satisfies Record<CodeOf<Api, 'submitEvent'>, string>;

/** `undefined` is what the product's exception filter sends for every transport
 *  failure — there is nothing to branch on, so the generic sentence is rendered.
 *  Rendering is not branching, so HARD RULE 5 holds. */
const says = (error: unknown, code: keyof typeof SAYS | undefined): string =>
  error ? (code === undefined ? 'Не зберіглося. Натисни ще раз.' : SAYS[code]) : '';

/**
 * THE THREE KINDS, AS THREE LITERALS — and this list is what makes a stale link
 * safe. `useParams()` hands back `string | undefined` from the URL bar, so
 * `kind as EventKind` would typecheck and then render a screen with no artefact
 * and a body the API refuses. `#/z/LOADNG` in front of a client must be a
 * sentence, not a white screen.
 */
const KINDS = ['LOADING', 'UNLOADING', 'REFUEL'] as const;

const asKind = (raw: string | undefined): EventKind | undefined =>
  KINDS.find((kind) => kind === raw);

/**
 * The artefact must match the event — `photoMismatch` in `rules.ts` refuses a
 * mismatch. Derived from one map rather than passed per screen, so the refusal
 * is unreachable from this UI by construction.
 */
const PHOTO_OF: Readonly<Record<EventKind, PhotoKind>> = {
  LOADING: 'TTN',
  UNLOADING: 'TTN_SIGNED',
  REFUEL: 'FUEL_RECEIPT',
};

/**
 * WHERE IT HAPPENED, and the driver never picks it from a list.
 *
 * In production this is the name of the Ruptela geofence the truck is standing
 * in — KTL already has them drawn, and five independent vendors derive arrival
 * and departure from geofences with zero driver interaction. A picker here would
 * be a list, a list is reading, and reading is the thing that does not happen.
 * The mock stands one plausible Запорізька-область point in per kind, taken from
 * the same corpus the seed uses.
 */
const PLACE_OF: Readonly<Record<EventKind, string>> = {
  LOADING: 'Комбікормовий завод, Вільнянськ',
  UNLOADING: 'ТОВ «Агро-Схід», Мелітополь',
  REFUEL: 'ОККО, М-18, Василівка',
};

const ASKS: Readonly<Record<EventKind, string>> = {
  LOADING: 'Сфотографуй ТТН',
  UNLOADING: 'Фото ТТН з печаткою',
  REFUEL: 'Сфотографуй чек',
};

/**
 * ONE SENTENCE OF WHY, and only where the reason is not obvious.
 *
 * Without it the second ТТН photo reads as «сфотографуй ще раз» and gets skipped
 * or faked with a picture of the unsigned copy. п.11.3–11.5 Правил №363 issues
 * the ТТН in three copies; примірник 3 — the one the consignee signed and
 * stamped — is what proves delivery and unlocks payment. A driver who knows that
 * takes the right photograph.
 */
const WHY: Readonly<Partial<Record<EventKind, string>>> = {
  UNLOADING: 'Це примірник 3 — з підписом і печаткою одержувача. Саме він підтверджує доставку і за ним платять.',
};

/**
 * The date printed on the drawn artefact. A LITERAL, exactly as `TODAY` in
 * `routes.ts` is a literal and for the same reason: a demo whose paperwork
 * changes date overnight is a demo that has to be rehearsed twice.
 */
const DEMO_DATE = '16.09.2026';

/** Where the number came from, carried from the odometer step into the last one. */
type Reading = { km: string; source: OdometerSource };

/**
 * Thousands grouping for a reading that is still a STRING, because that is what
 * the wire carries and what a keypad produces. Grouping it as text rather than
 * through `toLocaleString` keeps the value off the float path entirely — there
 * is no `Number()` anywhere in this flow, which is the point of the odometer
 * being pinned to `/^\d{1,7}$/` one layer down.
 *
 * A NON-BREAKING space, so «412 355» can never wrap across two lines on a 360px
 * screen and be read as two numbers.
 */
const grouped = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

/**
 * THE STEPS ARE NAMED, NOT NUMBERED, and that is a fix rather than a style.
 *
 * MEASURED: with the step held as `1 | 2 | 3` and the last one derived as
 * `me.data.has_can ? 2 : 3`, a background refetch of `me` that changed
 * `has_can` moved the FINISH LINE underneath the driver — the number he was
 * standing on became the done step, the submit effect ran with no reading to
 * send, and the screen said «Збережено» for an event that had never been
 * written. A query result is live data; a position in a linear flow is not, and
 * deriving the second from the first is what let one move the other.
 *
 * `has_can` still decides whether the odometer step is ever entered. It just
 * cannot relabel the step the driver is already on.
 */
type Where = 'photo' | 'odometer' | 'done';

export function DriverReportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams();
  const kind = asKind(params['kind']);

  const me = useQuery(queries.query('me', { params: {}, body: undefined }));

  const [step, setStep] = useState<Where>('photo');
  const [reading, setReading] = useState<Reading | null>(null);
  /** The odometer step's three tiers as one piece of state: the pre-filled
   *  question, the dashboard photograph, or the keypad. Never a route, never a
   *  dialog. */
  const [escape, setEscape] = useState<'ask' | 'photo' | 'keypad'>('ask');

  const submit = useMutation({
    mutationFn: (body: {
      kind: EventKind;
      truck_id: string;
      odometer_km: string;
      odometer_source: OdometerSource;
      photo_kind: PhotoKind;
      place: string;
    }) => call(httpClient, 'submitEvent', { params: {}, body }),
    onSuccess: async () => {
      /* Both keys come from the registry, so neither can drift from the
         operation name the way a hand-written `['events']` did. */
      await queryClient.invalidateQueries({ queryKey: queries.keyOf('me') });
      await queryClient.invalidateQueries({ queryKey: queries.keyOf('listEvents') });
    },
  });

  /**
   * THE TRUCK IS FROZEN FOR THE WHOLE FLOW, latched the first time `me` answers
   * and never read live again.
   *
   * MEASURED, and it is the defect this screen is most likely to have shipped
   * with: `has_can` is read in THREE places — whether the odometer step is
   * entered, whether it renders, and what the step counter says — and a
   * background refetch of `me` that changed it between the photograph and the
   * odometer question dropped the driver straight onto the done screen with no
   * reading collected. The submit effect declined to fire (no reading), the
   * navigate timer did fire, and the man was returned to the home screen having
   * been told «Збережено» about an event that does not exist. Rule 3 of this
   * product is warn-record-never-block, and a silent non-record is worse than
   * either.
   *
   * Freezing is also the right PRODUCT answer independently of the bug: the
   * odometer pre-fill is «what the office last knew», and it must not change
   * underneath a man who is looking at it because another truck's report landed.
   * One report is one snapshot.
   *
   * A ref rather than state: the latch is idempotent, assigning it during render
   * is safe for exactly that reason, and a `useState` + `useEffect` pair would
   * add a render between the data arriving and the first step being drawable.
   */
  const frozen = useRef<Me | null>(null);
  if (frozen.current === null && me.data !== undefined) frozen.current = me.data;
  const truck = frozen.current;

  /**
   * A TRUCK WITH CAN HAS NO ODOMETER STEP AT ALL, so the done screen is step 2
   * rather than step 3 and the counter says «Крок 2 з 2». The whole point of the
   * three-tier design is that on a Ruptela truck the event costs THREE taps, and
   * a step counter that still said «з 3» would be advertising work the driver
   * never does.
   */
  const total = truck?.has_can === true ? 2 : 3;

  /**
   * THE SUBMIT, FIRED ONCE. A ref rather than a piece of state: a double submit
   * is the one failure this flow must not have, and it writes a second event
   * that nobody can delete from the phone. The ref is never reset, so React
   * StrictMode's deliberate double-invoke in development cannot fire it twice
   * either — measured as the reason a `useState` guard is not enough.
   */
  const fired = useRef(false);

  /* `mutate` rather than `submit`: TanStack keeps the function identity stable
     across renders, while the result object does not — depending on the object
     would re-run this effect on every render and leave the guard as the only
     thing standing between the client and a duplicate event. */
  const send = submit.mutate;

  useEffect(() => {
    if (step !== 'done' || fired.current) return;
    /* Off the FROZEN snapshot, through the ref, so the body posted is the truck
       the driver photographed rather than whatever `me` answered most recently.
       A ref is not a reactive dependency and does not belong in the array: by
       the time the step is 'done' it has been latched for at least one render. */
    const driver = frozen.current;
    /* `reading === null` is unreachable: both entries to 'done' set it in the
       same handler that moves the step. It is guarded rather than asserted
       because the alternative is a non-null assertion, which would be a claim
       the type cannot see — and because the state it would cover is precisely
       the one that produced a false «Збережено». */
    if (kind === undefined || reading === null || driver === null) return;
    fired.current = true;
    send({
      kind,
      truck_id: driver.truck_id,
      odometer_km: reading.km,
      odometer_source: reading.source,
      photo_kind: PHOTO_OF[kind],
      place: PLACE_OF[kind],
    });
  }, [step, kind, reading, send]);

  /**
   * HOME AFTER ~2.5 s, and the timer is cleared on unmount. The driver is
   * holding a phone at a gate: the screen he is left on must be the one he
   * starts the next report from, and it must get there without a tap.
   *
   * It does NOT run while the write is refused — that is the one place in the
   * whole product where a driver is asked to act on an error, and navigating
   * away from it would hide the only thing he can do about it.
   */
  useEffect(() => {
    if (step !== 'done' || submit.isError) return undefined;
    const timer = setTimeout(() => navigate('/'), 2500);
    return () => clearTimeout(timer);
  }, [step, submit.isError, navigate]);

  if (kind === undefined) {
    return (
      <Shell>
        <EmptyState
          title="Такої дії немає"
          hint="Посилання застаріло. Повернись на головну і почни заново."
          action={
            <a href="#/" className="text-base text-primary underline underline-offset-4">
              На головну
            </a>
          }
        />
      </Shell>
    );
  }

  /* `truck === null` and not `me.isPending`: once the snapshot is latched the
     flow keeps running, so a background refetch that goes pending — or that
     fails outright — can no longer replace the screen a driver is standing on
     with a skeleton or an error. He has already taken the photograph. */
  if (truck === null) {
    if (me.error) {
      return (
        <Shell>
          <EmptyState title="Не відкрилося" hint="Зв’язку немає. Спробуй за хвилину." />
        </Shell>
      );
    }
    return (
      <Shell>
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-[260px] rounded-2xl" />
      </Shell>
    );
  }

  /* ── the photograph, always first ─────────────────────────────────────── */
  if (step === 'photo') {
    return (
      <Step step={1} of={total} question={ASKS[kind]} why={WHY[kind]}>
        <CameraTile
          title={ASKS[kind]}
          hint="Натисни — відкриється камера"
          face={<Face kind={kind} plate={truck.plate} driverName={truck.driver_name} />}
          /* ADVANCES WHETHER A FILE ARRIVED OR NOT. On a phone this is a
             photograph; on the demo laptop `capture` is ignored, the file dialog
             is dismissed, `cancel` fires with null, and the flow continues with
             the drawn artefact standing in for the shot. Same code path, same
             tap count, no separate demo mode — and no dead end in front of a
             client who pressed Escape. */
          onCaptured={() => {
            if (truck.has_can) {
              /* TIER 1. Ruptela reads this truck's CAN bus, so there is no
                 question to ask: the reading is already in `me` and the
                 odometer screen does not render at all. Three taps, and the
                 client's «максимум простоти» costs nothing to honour here. */
              setReading({ km: String(truck.odometer_km), source: 'CAN_AUTO' });
              setStep('done');
              return;
            }
            setStep('odometer');
          }}
        />
      </Step>
    );
  }

  /* ── the odometer step, on a truck without CAN ─────────────────────────── */
  /* No `&& !truck.has_can` guard any more: the snapshot is frozen, and this step
     is entered from exactly one branch that has already checked it. That guard
     was compensating for a truck that could change mid-flow — and when it did,
     this `if` fell through to the done screen with nothing collected. */
  if (step === 'odometer') {
    return (
      <Step step={2} of={total} question="Спідометр">
        {escape === 'ask' ? (
          <div className="space-y-4">
            {/* TIER 2. The number the office already holds, shown at 64px so it
                is legible at arm's length in direct sun, and ONE green button.
                This is the tap that replaces typing six digits. */}
            <output className="block rounded-2xl border-2 border-line2 bg-card px-4 py-6 text-center font-mono text-[64px] leading-none font-bold tabular-nums">
              {truck.odometer_km.toLocaleString('uk-UA')}
            </output>
            <p className="text-center text-base text-muted-foreground">Стільки було минулого разу</p>

            <BigButton
              tone="go"
              onClick={() => {
                setReading({ km: String(truck.odometer_km), source: 'DRIVER_CONFIRMED' });
                setStep('done');
              }}
            >
              Так
            </BigButton>

            {/* The two escapes are SMALLER AND QUIETER than ТАК on purpose. They
                are correct answers, not errors — but the common case is that the
                number is right, and a screen that offers three equal choices
                makes a man read three things. */}
            <div className="grid gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEscape('photo')}
                className="rounded-xl border-2 border-line2 bg-card px-4 py-4 text-lg font-semibold focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none"
              >
                Сфотографувати щиток
              </button>
              <button
                type="button"
                onClick={() => setEscape('keypad')}
                className="rounded-xl px-4 py-3 text-base text-muted-foreground underline underline-offset-4"
              >
                Ввести вручну
              </button>
            </div>
          </div>
        ) : escape === 'photo' ? (
          <CameraTile
            title="Сфотографуй щиток"
            hint="Видно має бути верхній рядок — TOTAL"
            face={<DashCluster km={truck.odometer_km} />}
            onCaptured={() => {
              /* TIER 3. The value stored is the PRE-FILL, not a number read off
                 the image: this mock runs no optical reader and must not claim
                 one. `DASH_PHOTO` is what tells the office that the photograph
                 is the authority here and the number beside it is a placeholder
                 to be corrected — which is exactly the queue `confirmEvent`
                 exists to work. Motive and Transflo both ship OCR on this
                 surface and it is the right roadmap item; asserting it on a
                 crumpled Scania cluster nobody has measured is not. */
              setReading({ km: String(truck.odometer_km), source: 'DASH_PHOTO' });
              setStep('done');
            }}
          />
        ) : (
          /* TIER 4 — the last resort, and the only screen in the whole product
             where a man the client describes as «дуже не любить писати» writes.
             Its guard WARNS and never blocks. */
          <Keypad
            previous={truck.odometer_km}
            onDone={(value) => {
              setReading({ km: value, source: 'DRIVER_TYPED' });
              setStep('done');
            }}
          />
        )}
      </Step>
    );
  }

  /* ── the last step · ЗАПИСАНО ─────────────────────────────────────────── */
  return (
    <Step step={total} of={total} question={submit.isError ? 'Не зберіглося' : 'Записано'}>
      {submit.isError ? (
        <div className="space-y-4">
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-4 text-lg text-destructive">
            {says(submit.error, codeOf('submitEvent', submit.error))}
          </p>
          <BigButton
            tone="primary"
            onClick={() => {
              if (reading === null) return;
              send({
                kind,
                truck_id: truck.truck_id,
                odometer_km: reading.km,
                odometer_source: reading.source,
                photo_kind: PHOTO_OF[kind],
                place: PLACE_OF[kind],
              });
            }}
          >
            Спробувати ще раз
          </BigButton>
        </div>
      ) : (
        /* «ЗБЕРЕЖЕНО» BEFORE THE NETWORK, ALWAYS. No spinner, and the word
           «помилка» appears nowhere: the row exists the moment he pressed the
           button, and whether it has reached the office yet is not his problem
           and not something he can act on. A driver who is made to wait on a bar
           at a silo gate re-takes the photograph, doubts the product, and goes
           back to paper. */
        <div className="space-y-4 text-center">
          <p aria-hidden className="text-[84px] leading-none text-success">
            ✓
          </p>
          <p className="text-2xl font-bold">Збережено.</p>
          <p className="text-lg text-muted-foreground">Надішлемо, коли буде зв’язок.</p>
          <p className="inline-block rounded-lg border-4 border-black bg-white px-3 py-1 font-mono text-2xl font-bold tracking-[0.06em] text-black tabular-nums">
            {truck.plate}
          </p>
          <p className="font-mono text-xl tabular-nums">
            {/* Grouped, like the step before it. Seen side by side on 2026-09-16:
                the odometer question showed «412 355» and this screen «412355»,
                which reads as a different number to anyone glancing at it —
                and the whole promise of this screen is that what was captured is
                what he just confirmed. */}
            {reading === null ? '—' : grouped(reading.km)} км
            {reading?.source === 'CAN_AUTO' ? (
              /* On a CAN truck the driver was never asked, so the number has to
                 be shown SOMEWHERE — a figure that reaches the office without
                 the driver ever seeing it is the fastest way to lose his trust
                 in the whole thing. */
              <span className="ml-2 text-base text-muted-foreground">з бортового комп’ютера</span>
            ) : null}
          </p>
        </div>
      )}
    </Step>
  );
}

/** The drawn artefact this kind photographs — the tile's face. Never a camera
 *  glyph: the low-literacy HCI finding is that stylised icons are semantically
 *  opaque to this reader and concrete imagery is not. */
function Face({
  kind,
  plate,
  driverName,
}: {
  kind: EventKind;
  plate: string;
  driverName: string;
}) {
  if (kind === 'REFUEL') {
    return (
      /* NULL litres and NULL amount, and the receipt renders «—» for both. That
         is the domain, not a gap: the driver is never asked for either, because
         a third input on the refuel tile is what kills the module. They arrive
         from the office, off this photograph. */
      <FuelReceipt
        station={PLACE_OF.REFUEL}
        litres={null}
        amount={null}
        date={DEMO_DATE}
        plate={plate}
      />
    );
  }
  return (
    <PaperTtn
      number={null}
      date={DEMO_DATE}
      plate={plate}
      driverName={driverName}
      from={PLACE_OF.LOADING}
      to={PLACE_OF.UNLOADING}
      stamped={kind === 'UNLOADING'}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[520px] space-y-4 px-4 pt-6 pb-10">{children}</div>
    </main>
  );
}
