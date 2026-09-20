// mocks/driver-report/src/pages/driver/DayPage.tsx
/**
 * «Мій день» (§3.3 D-15, §8.2 D-15/16, beat 10) — the driver's own record of one day, and his proof.
 *
 * HIS FACTS FIRST, AND THEY ARE FINAL. Every row leads with what HE recorded — when he arrived, how long he stood,
 * the number he confirmed — and what the office read off the paper is a line UNDER it, never a correction of it
 * (§8.2 D-15/16 #2). That ordering is `myDayView`'s (I-12), not this page's: `MyDayRow.title`, `lines` and
 * `accepted_line` arrive already worded, so the screen cannot reorder or re-phrase a fact, and the one thing it
 * decides is which day to ask for.
 *
 * THE DATE SWITCHER ONLY LOOKS BACKWARDS. «вт 22.09 ›» is rendered and disabled rather than hidden, because a day
 * that is simply absent reads as an app that lost it; a disabled tomorrow reads as tomorrow. «Today» is the server's
 * clock, never a literal (§8.6 #3).
 *
 * «Ще в телефоні: 1 запис» counts the OUTBOX, not the server: the one line on this page that is about the phone. It
 * is a hold line, never a failure — the record is safe, it simply has not left yet (§3.3 D-02, §8.6 #1).
 */
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CheckCheck, ChevronRight, CloudOff, FileCheck, Pencil } from 'lucide-react';
import { asBusinessDate } from '@agency/mock';
import { useMyDay, useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { DEVICE_ID } from '../../app/device';
import { fmtDay, fmtKm, fmtTime, fmtWhen, pluralN } from '../../app/format';
import { enqueue, useOutbox } from '../../app/outbox';
import { buildRecord } from '../../app/records';
import { DriverSkeleton, HoldCard, LightPage, QuietButton, StatusLine } from '../../components/driver';
import { DC } from '../../copy/driver';
import { addDays, businessDate, daysBetween } from '../../domain/clock';
import type { CorrectionView, DriverToday, MyDayRow } from '../../domain/dto';
import { gt, toInt } from '../../domain/num';
import type { BusinessDate } from '../../domain/types';
import { useDriverGuard } from './DriverShell';

const TITLE = DC.links.myDay;
const PREV = '‹';
const NEXT = '›';
const EMPTY = 'Цього дня змін не було';
const IN_PHONE = 'Ще в телефоні';
const PAPER = 'Папір';
const CONFIRMED = 'День прийнято офісом';
const PRINTED = 'Лист за день надруковано — підпишіть, коли здаватимете документи';
const FOOTER = 'На зміні — за записами застосунку. Робочий час — за тахографом.';
const FIXED = 'Офіс виправив';
const FIXED_ANSWER = 'Виправлення';
const AGREE = 'Згоден';
const DISAGREE = 'Не згоден — подзвоніть';
const FIELD: Readonly<Record<CorrectionView['field'], string>> = { odometer: 'одометр', occurred_at: 'час' };

const DIGITS = /^\d{1,9}$/u;
/** A correction's `old`/`new` as the driver reads them: a grouped odometer, or a time. */
function valueOf(field: CorrectionView['field'], raw: string): string {
  if (field === 'odometer') return DIGITS.test(raw) ? fmtKm(toInt(raw)) : raw;
  return /^\d{4}-/u.test(raw) ? fmtTime(raw) : raw;
}
const correctionLine = (c: CorrectionView, today: BusinessDate): string =>
  `${FIXED}: ${FIELD[c.field]} ${valueOf(c.field, c.old)} → ${valueOf(c.field, c.new)} · ${c.driver_wording} · ${c.by} ${fmtWhen(c.at, today)}`;

/** One row of the day: his own facts, then the office's line under them (§3.3 D-15). */
function DayRow({ row, onOpen }: { row: MyDayRow; onOpen?: () => void }): JSX.Element {
  const body = (
    <span className="flex min-h-[4rem] w-full flex-col justify-center gap-[2px] py-3 pl-4 text-left">
      <span className="tnum text-[1.125rem] leading-[1.5rem] font-semibold">{row.title}</span>
      {row.lines.map((line) => (
        <span key={line} className="tnum text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{line}</span>
      ))}
      {row.accepted_line === null ? null : (
        <span className="flex items-center gap-2">
          <CheckCheck aria-hidden="true" className="size-[1.125rem] shrink-0" />
          <span className="tnum text-[1rem] leading-[1.375rem] font-medium">{row.accepted_line}</span>
        </span>
      )}
      {row.late_line === null ? null : (
        <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--hold)' }}>{row.late_line}</span>
      )}
    </span>
  );
  if (onOpen === undefined) return <div className="card-ring w-full pr-4">{body}</div>;
  return (
    <button type="button" onClick={onOpen} className="card-ring flex w-full items-center pr-2">
      {body}
      <ChevronRight aria-hidden="true" className="ml-auto size-[1.25rem] shrink-0" style={{ color: 'var(--text-2)' }} />
    </button>
  );
}

/** A pasted `#/day/<anything>` lands on today rather than throwing: `asBusinessDate` is the validation, and its
 *  refusal is a fallback here, never an error in front of the driver (§2.2). */
function dayOf(raw: string | undefined, fallback: BusinessDate): BusinessDate {
  if (raw === undefined) return fallback;
  try {
    return asBusinessDate(raw);
  } catch {
    return fallback;
  }
}

/** `today` decides which day «today» is and whether the next one may be opened, so it is read before the day is. */
export function DayPage(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const data = today.data;
  if (data === undefined) {
    return <LightPage title={TITLE} onBack={() => { navigate('/'); }}><DriverSkeleton /></LightPage>;
  }
  const date = dayOf(params.date, businessDate(data.server_time));
  return <DayView key={date} date={date} today={data} />;
}

function DayView({ date, today }: { date: BusinessDate; today: DriverToday }): JSX.Element {
  const navigate = useNavigate();
  const entries = useOutbox(DEVICE_ID);
  const day = useMyDay(date);
  const guard = useDriverGuard();

  const current = businessDate(today.server_time);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const ahead = gt(daysBetween(current, next), 0);
  const unsent = entries.filter((e) => e.acked_at === null && !e.undone).length;
  const view = day.data;

  const ack = (c: CorrectionView, agree: boolean): void => {
    const seq = server.mintSeq(DEVICE_ID);
    const at = server.clock.nowIso();
    enqueue(DEVICE_ID, {
      record: buildRecord({ deviceId: DEVICE_ID, seq, occurredAt: at, committedAt: at }, 'CORRECTION_ACK',
        { correction_id: c.id, agree }),
      pages: [],
      receipt: { title: `${FIXED_ANSWER}: ${agree ? AGREE : DISAGREE}`, next: null },
    });
  };

  return (
    <LightPage title={TITLE} onBack={() => { navigate('/'); }}>
      <div className="flex min-h-[3.5rem] w-full items-center gap-2">
        <button type="button" onClick={guard(() => { navigate(`/day/${prev}`); })}
          className="tap-ring flex min-h-tap flex-1 items-center justify-center rounded-[12px] px-2 text-[1rem] leading-[1.375rem]">
          {`${PREV} ${fmtDay(prev)}`}
        </button>
        <span className="tnum flex-1 text-center text-[1rem] leading-[1.375rem] font-semibold">{fmtDay(date)}</span>
        <button type="button" disabled={ahead} onClick={guard(() => { navigate(`/day/${next}`); })}
          className="tap-ring flex min-h-tap flex-1 items-center justify-center rounded-[12px] px-2 text-[1rem] leading-[1.375rem]"
          style={ahead ? { color: 'var(--text-2)', opacity: 0.5 } : undefined}>
          {`${fmtDay(next)} ${NEXT}`}
        </button>
      </div>

      {view === undefined ? <DriverSkeleton /> : view.empty ? (
        <p className="py-6 text-[1.125rem] leading-[1.625rem]" style={{ color: 'var(--text-2)' }}>{EMPTY}</p>
      ) : (
        <>
          <section className="card-ring flex flex-col gap-1 p-3">
            {[view.span_line, view.on_site_line, view.km_line].map((line) => (line === null ? null : (
              <p key={line} className="tnum text-[1.125rem] leading-[1.625rem]">{line}</p>
            )))}
          </section>

          {unsent === 0 ? null : (
            <StatusLine tone="hold" icon={CloudOff} text={`${IN_PHONE}: ${pluralN(unsent, DC.plurals.record)}`} />
          )}

          {view.rows.map((row) => {
            const stopId = row.stop_id;
            return (
              <DayRow
                key={`${row.kind}:${stopId ?? row.title}`}
                row={row}
                onOpen={stopId === null ? undefined : guard(() => { navigate(`/day/${date}/stop/${stopId}`); })}
              />
            );
          })}

          {view.paper.length === 0 ? null : (
            <section className="flex w-full flex-col gap-1 pt-2">
              <h2 className="text-[1.125rem] leading-[1.5rem] font-semibold">{PAPER}</h2>
              {view.paper.map((line) => (
                <div key={line} className="flex items-start gap-2">
                  <FileCheck aria-hidden="true" className="mt-[2px] size-[1.25rem] shrink-0" style={{ color: 'var(--text-2)' }} />
                  <p className="tnum text-[1rem] leading-[1.375rem]">{line}</p>
                </div>
              ))}
            </section>
          )}

          {view.corrections.map((c) => (
            <HoldCard key={c.id} icon={Pencil} title={correctionLine(c, current)}>
              {!c.needs_ack || c.ack !== null ? null : (
                <span className="flex gap-2 pt-2">
                  <QuietButton half label={AGREE} onPress={guard(() => { ack(c, true); })} />
                  <QuietButton half tone="hold" label={DISAGREE} onPress={guard(() => { ack(c, false); })} />
                </span>
              )}
            </HoldCard>
          ))}

          {view.day_confirmed_at === null ? null : (
            <p className="tnum text-[1rem] leading-[1.375rem]">{`${CONFIRMED} ${fmtTime(view.day_confirmed_at)}`}</p>
          )}
          {view.printed_at === null ? null : (
            <p className="text-[1rem] leading-[1.375rem]">{PRINTED}</p>
          )}
          {view.late_notes.map((note) => (
            <p key={note} className="tnum text-[1rem] leading-[1.375rem]" style={{ color: 'var(--hold)' }}>{note}</p>
          ))}

          <p className="pt-2 text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>{FOOTER}</p>
        </>
      )}
    </LightPage>
  );
}
