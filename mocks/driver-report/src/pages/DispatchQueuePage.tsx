import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@agency/kit/button';
import { EmptyState } from '@agency/kit/empty-state';
import { Field } from '@agency/kit/field';
import { Segmented } from '@agency/kit/segmented';
import { Skeleton } from '@agency/kit/skeleton';
import { StatGrid } from '@agency/kit/stat-grid';
import { StatTile } from '@agency/kit/stat-tile';
import { TextInput } from '@agency/kit/text-input';
import { cn } from '@agency/kit/lib/cn';
import type { CodeOf } from '@agency/mock';
import { httpClient } from '../api/client';
import { call, codeOf, type Api } from '../api/contract';
import { DashCluster, FuelReceipt, PaperTtn } from '../components/Artifacts';
import type { DriverEvent, EventFlag, EventKind, PhotoKind } from '../domain/types';

/**
 * «ПРОБЛЕМА НУЛЬ», DYING ON SCREEN.
 *
 * The client's own description of the problem: a driver fills a paper путовий
 * лист, the scan reaches the office days later, and somebody re-types every
 * field into the accounting база by hand. The driver screens are the input; this
 * one is the payoff, and it is the screen the director watches on the call.
 *
 * WHAT THIS SCREEN DOES NOT CLAIM. It does not remove re-keying — it MOVES it.
 * See the comment above the ТТН input: that single field is the honest centre of
 * the whole design, and hiding it would make the demo a lie the first week of
 * use would expose.
 */

/**
 * A sentence per declared code, read from `code` and never from `message`
 * (HARD RULE 5).
 *
 * `CodeOf` DISTRIBUTES over the union, so this table is closed against both
 * operations at once: a declared code with no sentence here is a compile error
 * naming the code, and a sentence for a code neither operation declares is a
 * compile error naming the key. Both happen to declare EVENT_NOT_FOUND and one
 * sentence serves both — a detail query and a confirm hit the same missing row.
 */
const SAYS = {
  EVENT_NOT_FOUND: 'Цієї події вже немає. Онови чергу.',
  EVENT_ALREADY_CONFIRMED: 'Цю подію вже підтвердили — у черзі вона більше не висить.',
  TTN_BLANK: 'Номер порожній. Він у шапці документа, праворуч від слова «№».',
  TTN_DUPLICATE: 'Цей номер уже записаний на іншу подію. Звір цифри з фото — ймовірно, одна не та.',
} satisfies Record<CodeOf<Api, 'confirmEvent' | 'getEvent'>, string>;

/**
 * `undefined` is not a mystery: it is what the product's `AllExceptionsFilter`
 * sends for every transport failure and every `ValidationPipe` 400, so there is
 * nothing to branch on and the generic sentence is rendered. Rendering the
 * generic sentence is not branching, so HARD RULE 5 holds.
 */
const says = (error: unknown, code: keyof typeof SAYS | undefined): string =>
  error ? (code === undefined ? 'Щось пішло не так. Спробуй ще раз.' : SAYS[code]) : '';

/**
 * THE FLAGS, IN THE OFFICE'S WORDS. Computed by `flagsFor` in
 * `src/domain/rules.ts`, stored on the row, and shown HERE AND NOWHERE ELSE —
 * the driver never sees one.
 *
 * Every one of these is a WARNING and blocks precisely nothing: the event was
 * accepted, stored and is on this screen. That is why they are `text-amber` and
 * never `text-destructive` — red on this screen means "the server refused it",
 * and a flag is the opposite of a refusal. Blocking a man at a silo gate at
 * 21:00 is how this client's two previous attempts died.
 */
const FLAG_SAYS: Readonly<Record<EventFlag, string>> = {
  ODOMETER_BACKWARDS: 'Спідометр менший за попередній — схоже, загубили цифру',
  ODOMETER_JUMP: 'Стрибок понад 1500 км',
  NO_TTN_NUMBER: 'Номер документа ще не внесений',
};

/** The three things that ever happen, in the words on the driver's own buttons.
 *  One vocabulary across both products or the office and the cab are discussing
 *  two different events. */
const KIND_SAYS: Readonly<Record<EventKind, string>> = {
  LOADING: 'Завантаження',
  UNLOADING: 'Вивантаження',
  REFUEL: 'Заправка',
};

/**
 * WHAT THE DISPATCHER IS ACTUALLY READING A NUMBER OFF, and it is not always a
 * ТТН. FOUND BY LOOKING AT THE SCREEN on 2026-09-16: a REFUEL event rendered a
 * fuel receipt beside a field labelled «Номер ТТН з фото», and a fuel receipt
 * has no ТТН on it — the office would have been asked for a number that does
 * not exist on the document in front of them.
 *
 * The wire field stays `ttn_number` because that is the client's own word for
 * the case that matters and renaming it would move `Leg.ttn_number` and
 * `WaybillRow.ttn_number`, neither of which a refuel ever reaches. But it
 * carries the number of WHICHEVER document was photographed, and the label has
 * to say which. NAMING DEBT, recorded rather than hidden: before this becomes a
 * product the field wants to be `doc_number` with the ТТН as one kind of
 * document, which is also the shape є-ТТН will need in 2027.
 */
const DOC_LABEL: Readonly<Record<EventKind, string>> = {
  LOADING: 'Номер ТТН',
  UNLOADING: 'Номер ТТН',
  REFUEL: 'Номер чека',
};

/** Where the number in the спідометр field came from. Shown because it decides
 *  how much the office should trust it: a CAN reading is the truck's own ECU, a
 *  typed one is a man at a gate with one hand free. */
const SOURCE_SAYS: Readonly<Record<DriverEvent['odometer_source'], string>> = {
  CAN_AUTO: 'з телематики',
  DRIVER_CONFIRMED: 'водій підтвердив',
  DASH_PHOTO: 'з фото щитка',
  DRIVER_TYPED: 'водій набрав',
};

/* Sliced, never parsed. `new Date(iso).toLocaleDateString()` would apply the
   presenter's timezone to a wire value, so a 06:10 loading becomes 09:10 on a
   laptop somebody set up in another country the morning of the call. */
const dmy = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const hhmm = (iso: string): string => iso.slice(11, 16);

/* Grouping is DISPLAY ONLY and it is applied to a whole-kilometre COUNT, never
   to a decimal string: a `Decimal2` is rendered verbatim everywhere on these
   three screens, because the moment one passes through a formatter the printed
   total stops matching the printed lines. */
const km = (value: number): string => value.toLocaleString('uk-UA');

/**
 * THE ONE PIECE OF NAVIGATION IN THE PRODUCT, and it exists on this side only.
 *
 * The driver's three screens have no nav at all — the named failure mode in the
 * adoption literature is DEPTH, and he is standing at a gate. The director is at
 * a desk or on a phone between meetings, reads the three office screens in any
 * order, and needs to get back. Three links, no hierarchy, no dropdown.
 *
 * `current` is a PROP rather than a `useLocation()` read, so this component
 * mounts in a test without a router and the page that owns it cannot disagree
 * with the router about which one it is.
 */
export function DispatchNav({ current }: { current: '#/' | '#/reisy' | '#/bas' }) {
  const tabs = [
    { href: '#/' as const, label: 'Черга' },
    { href: '#/reisy' as const, label: 'Рейси' },
    { href: '#/bas' as const, label: 'В БАС' },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2.5 sm:px-6">
        <p className="truncate text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          ТОВ «Кормо-Транс-Логістик» · диспетчерська
        </p>
        <nav aria-label="Розділи" className="mt-2 flex gap-1.5">
          {tabs.map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={tab.href === current ? 'page' : undefined}
              className={cn(
                /* 44px tall and full-width thirds: this is read on a phone
                   first, and a link a thumb misses is a link that gets pressed
                   twice. */
                'flex h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-bold tracking-wide uppercase',
                'focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
                tab.href === current
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

/** The office shell every dispatch screen wears. Mobile first and it means it:
 *  one column with a 16px gutter at 360 px, widening only where there is room. */
export function DispatchShell({
  current,
  children,
}: {
  current: '#/' | '#/reisy' | '#/bas';
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <DispatchNav current={current} />
      <main className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-16 sm:px-6">{children}</main>
    </div>
  );
}

type Filter = 'pending' | 'all';

export function DispatchQueuePage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ttn, setTtn] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const summary = useQuery({
    queryKey: ['overview'],
    queryFn: () => call(httpClient, 'overview', { params: {}, body: undefined }),
  });

  const list = useQuery({
    queryKey: ['events', filter],
    queryFn: () =>
      call(httpClient, 'listEvents', {
        params: {},
        body: undefined,
        /* The SAME operation for both, filtered server-side. Two endpoints that
           return the same rows are two endpoints that drift. */
        qry: filter === 'pending' ? { pending: '1', limit: '50' } : { limit: '50' },
      }),
  });

  const detail = useQuery({
    queryKey: ['event', selectedId],
    enabled: selectedId !== null,
    queryFn: () => {
      // Guarded rather than asserted: `enabled` keeps this from running with a
      // null id, and a non-null assertion would be a claim the type cannot see.
      if (selectedId === null) throw new Error('DispatchQueuePage: detail ran with no selection');
      return call(httpClient, 'getEvent', { params: { id: selectedId }, body: undefined });
    },
  });

  const confirm = useMutation({
    mutationFn: (id: string) =>
      call(httpClient, 'confirmEvent', { params: { id }, body: { ttn_number: ttn.trim() } }),
    onSuccess: async () => {
      setTtn('');
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['event'] });
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  /* A new selection means a new document on screen, so the caret goes back to
     the one field on it. The dispatcher's hands never leave the keyboard: click
     a row, type, Enter, next row. */
  useEffect(() => {
    if (selectedId !== null) inputRef.current?.focus();
  }, [selectedId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selectedId !== null) confirm.mutate(selectedId);
  };

  const rows = list.data?.data ?? [];
  const selected = detail.data ?? null;

  return (
    <DispatchShell current="#/">
      <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
        Черга на підтвердження
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        Фото з гейта тут за десять секунд. Диспетчер читає з нього один номер — далі все вже
        заповнено з чотирьох натискань водія.
      </p>

      <div className="mt-5">
        {summary.isPending ? (
          <Skeleton className="h-[86px]" />
        ) : summary.error ? (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            Зведення не завантажилось. Черга нижче працює окремо.
          </p>
        ) : (
          <StatGrid columns={4}>
            <StatTile
              label="Чекають"
              value={summary.data.pending}
              tone="amber"
              hint="це і є вся ручна робота"
            />
            <StatTile label="Подій" value={summary.data.events} />
            <StatTile label="Рейсів" value={summary.data.legs} />
            {/* A decimal string, rendered VERBATIM. */}
            <StatTile label="Пального, л" value={summary.data.total_litres} />
          </StatGrid>
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
        <section aria-label="Черга подій" className="min-w-0">
          <div className="mb-3">
            <Segmented<Filter>
              label="Показувати"
              value={filter}
              onChange={setFilter}
              tone="strong"
              options={[
                { value: 'pending', label: 'Чекають' },
                { value: 'all', label: 'Усі' },
              ]}
            />
          </div>

          {list.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : list.error ? (
            <EmptyState title="Черга не завантажилась" hint="Онови сторінку." />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Черга порожня"
              hint="Усе, що водії надіслали, вже підтверджено."
            />
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <QueueRow
                    row={row}
                    selected={row.id === selectedId}
                    onPick={() => {
                      setSelectedId(row.id);
                      setTtn(row.ttn_number ?? '');
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Обрана подія" className="min-w-0">
          {selectedId === null ? (
            <EmptyState
              title="Обери подію з черги"
              hint="Фото відкриється тут у повний розмір, а поля вже будуть заповнені."
            />
          ) : detail.isPending ? (
            <Skeleton className="h-[520px]" />
          ) : detail.error ? (
            <EmptyState
              title="Подія не відкрилась"
              hint={says(detail.error, codeOf('getEvent', detail.error))}
            />
          ) : selected === null ? null : (
            <div className="space-y-4">
              {/**
               * THE PHOTOGRAPH, AT FULL SIZE, AND IT TAKES MOST OF THE SCREEN.
               * Reading one number off it IS the job — every other field on this
               * panel is already filled in, so anything that shrinks the
               * document to make room for chrome is making the only real task
               * here harder.
               */}
              <div className="flex justify-center rounded-2xl bg-muted px-3 py-6 sm:px-6 sm:py-8">
                <Artefact row={selected} />
              </div>

              <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
                <h2 className="text-lg font-semibold">
                  {KIND_SAYS[selected.kind]} · {selected.plate}
                </h2>

                {/* WHAT THE DRIVER'S FOUR TAPS ALREADY SUPPLIED. Read-only, and
                    that is the argument: nobody in this office re-types any of
                    it, because it arrived typed. */}
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                  <Fact label="Водій" value={selected.driver_name} />
                  <Fact label="Авто" value={selected.plate} />
                  <Fact
                    label="Час"
                    value={`${dmy(selected.occurred_at)}, ${hhmm(selected.occurred_at)}`}
                  />
                  <Fact label="Місце" value={selected.place} />
                  <Fact
                    label="Спідометр"
                    value={`${km(selected.odometer_km)} км · ${SOURCE_SAYS[selected.odometer_source]}`}
                    mono
                  />
                  {selected.litres === null ? null : (
                    /* Decimal strings, verbatim. */
                    <Fact label="Літрів" value={selected.litres} mono />
                  )}
                  {selected.amount_uah === null ? null : (
                    <Fact label="Сума, грн" value={selected.amount_uah} mono />
                  )}
                  {selected.ttn_number === null ? null : (
                    <Fact label={DOC_LABEL[selected.kind]} value={selected.ttn_number} mono />
                  )}
                </dl>

                {selected.flags.length === 0 ? null : (
                  <ul className="mt-3 space-y-1.5">
                    {selected.flags.map((flag) => (
                      <li
                        key={flag}
                        className="flex items-start gap-2 rounded-xl bg-amber/10 px-3 py-2 text-sm text-amber"
                      >
                        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-amber" />
                        <span>{FLAG_SAYS[flag]}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/**
                 * THE ONE INPUT IN THE OFFICE, AND THE HONEST CENTRE OF THIS
                 * DESIGN.
                 *
                 * We did not remove re-keying. We moved it — from a scan that
                 * arrives in a week to a photograph that arrives in ten seconds,
                 * and from a man with dirty hands at a loading gate to a desk
                 * with a keyboard, good light and the document on screen.
                 * Roughly 400 confirmations a day at ~15 seconds each is about a
                 * quarter of a post: less than re-typing whole waybills off
                 * scans, but it is not nothing, and the number belongs on the
                 * screen the client is looking at rather than in a footnote.
                 *
                 * Why the driver is not asked instead: it is 8–12 keystrokes
                 * from a man the client describes as «дуже не любить писати»,
                 * standing at a gate, and every one of them is a chance to lose
                 * him back to paper.
                 */}
                {selected.confirmed_at === null ? (
                  <form onSubmit={submit} className="mt-4" aria-label="Підтвердити подію">
                    <Field
                      name="ttn_number"
                      label={`${DOC_LABEL[selected.kind]} з фото`}
                      hint="Єдине, що тут набирають руками. Enter — підтвердити."
                      error={says(confirm.error, codeOf('confirmEvent', confirm.error))}
                    >
                      {(a11y) => (
                        <TextInput
                          {...a11y}
                          ref={inputRef}
                          value={ttn}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="0034512"
                          className="h-14 font-mono text-2xl tracking-wider"
                          onChange={(event) => setTtn(event.target.value)}
                        />
                      )}
                    </Field>
                    <Button
                      type="submit"
                      size="cta"
                      className="mt-3 w-full text-base font-bold tracking-wide uppercase"
                      disabled={confirm.isPending}
                    >
                      Підтвердити
                    </Button>
                  </form>
                ) : (
                  <p className="mt-4 rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
                    Підтверджено {dmy(selected.confirmed_at)} о {hhmm(selected.confirmed_at)}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </DispatchShell>
  );
}

/**
 * ONE ROW OF THE QUEUE — a card, never a table row. This column is ~360 px wide
 * on a phone AND inside the two-column layout on a desktop, so a table here
 * would have been a horizontally scrolling table on every screen size.
 *
 * ODOMETER FLAGS ARE SHOWN HERE, NO_TTN_NUMBER IS NOT. That flag sits on every
 * pending row by construction — it is the definition of the queue — so printing
 * it beside all of them is noise that trains the eye to skip the amber line, and
 * the amber line is exactly what must not be skipped on the two rows that carry
 * a real odometer problem. The full set, including NO_TTN_NUMBER, is on the
 * detail panel where there is room to read it.
 */
function QueueRow({
  row,
  selected,
  onPick,
}: {
  row: DriverEvent;
  selected: boolean;
  onPick: () => void;
}) {
  const warnings = row.flags.filter((flag) => flag !== 'NO_TTN_NUMBER');

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10',
        'focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none',
        selected ? 'ring-2 ring-primary' : 'hover:bg-muted/50',
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate font-semibold">{KIND_SAYS[row.kind]}</span>
        <span className="shrink-0 font-mono text-sm text-muted-foreground">
          {hhmm(row.occurred_at)}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
        {row.plate} · {row.driver_name}
      </span>
      <span className="mt-0.5 block truncate text-sm text-muted-foreground">{row.place}</span>
      {row.confirmed_at === null ? null : (
        <span className="mt-1.5 block text-xs font-medium text-success">
          Підтверджено · ТТН {row.ttn_number ?? '—'}
        </span>
      )}
      {warnings.map((flag) => (
        <span key={flag} className="mt-1.5 flex items-start gap-1.5 text-xs text-amber">
          <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-amber" />
          {FLAG_SAYS[flag]}
        </span>
      ))}
    </button>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words', mono && 'font-mono tabular-nums')}>{value}</dd>
    </>
  );
}

/**
 * THE DRAWN ARTEFACT, chosen by `photo_kind` rather than by `kind`.
 *
 * They are two different facts and only one of them is about the picture: an
 * UNLOADING carries примірник 3 of the ТТН — the copy with the consignee's
 * signature and stamp, which is what proves delivery — and a LOADING carries the
 * unstamped one. `photoMismatch` in `src/domain/rules.ts` is what keeps the two
 * agreeing, so this switch may trust the field it is given.
 *
 * `from`/`to`: an event holds ONE place, the one it happened at, so the other
 * side of the accompanying document is «—». Inventing the missing endpoint from
 * the route table would be the mock asserting something the wire does not carry.
 */
function Artefact({ row }: { row: DriverEvent }) {
  const kind: PhotoKind = row.photo_kind;

  if (kind === 'FUEL_RECEIPT') {
    return (
      <FuelReceipt
        station={row.place}
        litres={row.litres}
        amount={row.amount_uah}
        date={dmy(row.occurred_at)}
        plate={row.plate}
      />
    );
  }

  if (kind === 'DASH') return <DashCluster km={row.odometer_km} />;

  return (
    <PaperTtn
      number={row.ttn_number}
      date={dmy(row.occurred_at)}
      plate={row.plate}
      driverName={row.driver_name}
      from={row.kind === 'LOADING' ? row.place : '—'}
      to={row.kind === 'LOADING' ? '—' : row.place}
      stamped={kind === 'TTN_SIGNED'}
    />
  );
}
