import { useQuery } from '@tanstack/react-query';
import { Button } from '@agency/kit/button';
import { Card } from '@agency/kit/card';
import { EmptyState } from '@agency/kit/empty-state';
import { Skeleton } from '@agency/kit/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@agency/kit/table';
import { httpClient } from '../api/client';
import { call } from '../api/contract';
import { DispatchShell } from './DispatchQueuePage';
import type { WaybillRow } from '../domain/types';

/**
 * В БАС — the end of «проблеми нуль», and the screen the whole product is for.
 *
 * WHY THIS SHAPE AND NOT A CSV. BAS's own «Подорожній лист» already carries
 * водій, автомобіль, «показники спідометра на момент виїзду та повернення», and
 * computes fuel from норми × пробіг. The columns below are that document's
 * columns, in that order, which is why the integration target is the DOCUMENT
 * rather than an export somebody maps by hand once and re-maps after every BAS
 * update.
 *
 * WHY СПІДОМЕТР AND NOT ОДОМЕТР. BAS's document says «показники спідометра», and
 * so does every driver. The accounting system's word and the driver's word are
 * the same word, and it is not the technically correct one — using the correct
 * one here would mean the office reading a column heading nobody in the building
 * says out loud.
 *
 * WHAT THIS DOCUMENT LEGALLY IS. Подорожній лист was abolished as a STATE form
 * in 2013 (наказ Мінінфраструктури та МВС №1005/1454 від 10.12.2013) and is
 * absent from ст.48 ЗУ «Про автомобільний транспорт», which lists what a driver
 * must carry. It survives at KTL as internal habit, and that is a perfectly good
 * reason to keep it — but what this screen emits is therefore an INTERNAL
 * primary document that the enterprise approves for itself, and its sufficiency
 * comes from carrying the six ст.9 ЗУ №996-XIV requisites (назва документа,
 * дата, назва підприємства, зміст і обсяг операції, одиниця виміру, посади та
 * підписи відповідальних). Not from a form number, because there is no longer a
 * form number to cite.
 *
 * THE TRANSPORT IS THE PROJECT RISK, and it is on screen rather than in a
 * footnote. BAS speaks HTTP through an HTTP-сервіс or an OData (REST) endpoint,
 * and BOTH require the infobase to be published on a web server — Apache or IIS,
 * with the publication done from the configurator. Nobody at KTL has confirmed
 * that their infobase is published, or that it can be. Until somebody does, this
 * is an unconfirmed precondition sitting under the entire integration, and a
 * demo that implied otherwise would be selling the risk instead of naming it.
 */

/* Grouping is display only, and only ever on a whole-kilometre COUNT. Every
   litre figure below is a `Decimal2` printed verbatim — put one through a
   formatter and the totals row stops matching the lines above it, which on this
   particular screen is the exact failure the client is paying to end. */
const km = (value: number): string => value.toLocaleString('uk-UA');

const EN_DASH = '—';

/** BAS's own column order, written once. Numbers are right-aligned so a column
 *  of figures can be read down; the four text columns are not. */
const HEADINGS = [
  { label: 'Дата', numeric: false },
  { label: 'Водій', numeric: false },
  { label: 'Автомобіль', numeric: false },
  { label: 'Спідометр виїзд', numeric: true },
  { label: 'Спідометр повернення', numeric: true },
  { label: 'Пробіг, км', numeric: true },
  { label: 'Пальне за чеками, л', numeric: true },
  { label: 'Пальне за нормою, л', numeric: true },
  { label: '№ ТТН', numeric: false },
] as const;

const dmy = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export function DispatchExportPage() {
  const waybill = useQuery({
    queryKey: ['waybill'],
    queryFn: () => call(httpClient, 'exportWaybill', { params: {}, body: undefined }),
  });

  const rows = waybill.data?.rows ?? [];

  return (
    <DispatchShell current="#/bas">
      <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
        Подорожній лист · вивантаження в БАС
      </h1>

      {/* Three lines, and each one is something the client has to know before he
          agrees to anything. The detail is in the module comment above. */}
      <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
        <li>
          · Колонки — це колонки документа, який у БАС уже є. Інтегруємось у документ, а не в
          CSV, що його хтось руками розкладає.
        </li>
        <li>
          · Передача — через HTTP-сервіс або OData БАС. Це вимагає{' '}
          <strong className="font-semibold text-amber">публікації бази на вебсервері</strong> —
          поки не підтверджено, це ризик проєкту, а не дрібниця.
        </li>
        <li>
          · Подорожній лист з 2013 року не є державною формою. У КТЛ він лишився як внутрішня
          практика, тож це внутрішній первинний документ підприємства з реквізитами ст.9 ЗУ
          №996-XIV.
        </li>
      </ul>

      {waybill.isPending ? (
        <Skeleton className="mt-5 h-72" />
      ) : waybill.error ? (
        <div className="mt-5">
          <EmptyState title="Документ не сформувався" hint="Онови сторінку." />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {/**
             * DISABLED, AND VISIBLY SO. A mock must never pretend to have an
             * integration it does not have: a button that looked live here would
             * be the one thing on the call the client remembers, and the first
             * week of the real project would be spent explaining it away.
             */}
            <Button size="cta" disabled className="font-bold tracking-wide uppercase">
              Відправити в БАС
            </Button>
            <span className="text-sm text-muted-foreground">у макеті не надсилає</span>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Сформовано {dmy(waybill.data.generated_at)} · рядків: {rows.length}
          </p>

          {/**
           * THE ROWS THAT MUST NOT BE SENT, named before anybody presses send.
           *
           * A negative пробіг is a dropped digit — the commonest real input error
           * there is — and the export is the last screen before these figures
           * enter an accounting base through an HTTP-сервіс. `waybillOf` already
           * refuses to compute норма for such a row and keeps it out of the
           * total; this line is the other half, because a number quietly missing
           * from a sum is worse than a wrong one. The row stays visible so the
           * dispatcher can fix the reading at source.
           *
           * Amber rather than red, consistently with every other warning in this
           * product: nothing was refused, and the driver is not in trouble.
           */}
          {waybill.data.suspect === 0 ? null : (
            <p className="mt-3 rounded-xl bg-amber/10 px-4 py-3 text-sm text-amber">
              {waybill.data.suspect === 1
                ? 'Один рядок із відʼємним пробігом — спідометр на вивантаженні менший, ніж на завантаженні.'
                : `Рядків із відʼємним пробігом: ${waybill.data.suspect}.`}{' '}
              Норму для них не рахували і в підсумок не включали. Виправте показник, перш ніж
              вивантажувати в БАС.
            </p>
          )}

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Немає що вивантажувати"
                hint="Рядок з’являється, коли рейс закритий."
              />
            </div>
          ) : (
            <>
              {/* The phone gets cards. The document's shape is the argument, but
                  a nine-column table that scrolls sideways on a director's phone
                  makes that argument to nobody. */}
              <ul className="mt-4 space-y-2 md:hidden">
                {rows.map((row) => (
                  <li key={row.id}>
                    <WaybillCard row={row} />
                  </li>
                ))}
                <li>
                  <article className="rounded-xl bg-secondary px-4 py-3 ring-1 ring-foreground/10">
                    <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                      Разом
                    </p>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-semibold">
                      <dt>Пробіг, км</dt>
                      <dd className="text-right font-mono tabular-nums">
                        {km(waybill.data.total_km)}
                      </dd>
                      <dt>Пальне за чеками, л</dt>
                      {/* Verbatim. */}
                      <dd className="text-right font-mono tabular-nums">
                        {waybill.data.total_litres}
                      </dd>
                    </dl>
                  </article>
                </li>
              </ul>

              <Card className="mt-4 hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {HEADINGS.map((heading) => (
                        <TableHead
                          key={heading.label}
                          className={heading.numeric ? 'text-right' : undefined}
                        >
                          {heading.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{dmy(row.date)}</TableCell>
                        <TableCell>{row.driver_name}</TableCell>
                        <TableCell>{row.plate}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {km(row.spidometr_out_km)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.spidometr_in_km === null ? (
                            <Open />
                          ) : (
                            km(row.spidometr_in_km)
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.km === null ? <Open /> : km(row.km)}
                        </TableCell>
                        {/* Decimal strings, verbatim, both columns. */}
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.litres_by_receipt}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.litres_by_norm === null ? <Open /> : row.litres_by_norm}
                        </TableCell>
                        <TableCell className="font-mono">{row.ttn_number ?? EN_DASH}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-semibold">
                        Разом
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {km(waybill.data.total_km)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {waybill.data.total_litres}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </Card>
            </>
          )}
        </>
      )}
    </DispatchShell>
  );
}

/**
 * An OPEN рейс has no повернення, no пробіг and therefore no норма figure. «—»,
 * not 0 — a zero in the пробіг column of a waybill is a claim that a truck went
 * nowhere, and it would be carried into BAS as one.
 */
function Open() {
  return <span className="font-sans text-muted-foreground">{EN_DASH}</span>;
}

function WaybillCard({ row }: { row: WaybillRow }) {
  return (
    <article className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{dmy(row.date)}</span>
        <span className="font-mono text-sm text-muted-foreground">{row.ttn_number ?? EN_DASH}</span>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {row.driver_name} · {row.plate}
      </p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Спідометр виїзд</dt>
        <dd className="text-right font-mono tabular-nums">{km(row.spidometr_out_km)}</dd>

        <dt className="text-muted-foreground">Спідометр повернення</dt>
        <dd className="text-right font-mono tabular-nums">
          {row.spidometr_in_km === null ? <Open /> : km(row.spidometr_in_km)}
        </dd>

        <dt className="text-muted-foreground">Пробіг, км</dt>
        <dd className="text-right font-mono tabular-nums">
          {row.km === null ? <Open /> : km(row.km)}
        </dd>

        <dt className="text-muted-foreground">Пальне за чеками, л</dt>
        <dd className="text-right font-mono tabular-nums">{row.litres_by_receipt}</dd>

        <dt className="text-muted-foreground">Пальне за нормою, л</dt>
        <dd className="text-right font-mono tabular-nums">
          {row.litres_by_norm === null ? <Open /> : row.litres_by_norm}
        </dd>
      </dl>
    </article>
  );
}
