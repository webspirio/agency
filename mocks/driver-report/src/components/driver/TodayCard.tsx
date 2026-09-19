// mocks/driver-report/src/components/driver/TodayCard.tsx
/** Home mode A (§3.3 D-02, §8.2 D-02 #3): the shift has not started. The card is the answer to «на чому я сьогодні
 *  їду і куди» — the рейс in one line, the two plates as objects rather than strings, what the truck and the trailer
 *  are, and the reading the odometer step will open with.
 *
 *  THE REFERENCE LINE IS ONE TEXT NODE, and that is a decision with a cost. §3.3 D-02 asks for the NUMBER in mono
 *  inside a sans sentence — «Одометр 412 355 км · вчора 17:48 · база». A mono `<span>` around the number splits the
 *  sentence into three nodes, and Testing Library's `getNodeText` reads only an element's DIRECT text children, so
 *  the line could then never be asserted as the one string §8.2 D-02 #3 names (and a screen reader would announce
 *  three fragments). The line is therefore sans with `tnum` — tabular, slashed-zero figures from `index.css` — and
 *  the mono of §6.1 is spent on «На місці 06:10» and the hero timers, which ARE values standing alone.
 *
 *  WHAT «вчора» MEANS HERE is a business date, not 24 hours: the reference is compared to `now`'s Kyiv date through
 *  `daysBetween`, so a shift that ended at 23:40 reads «вчора 23:40» at 05:14 the next morning, and a reading from
 *  the same morning reads just «07:22». Nothing in this file calls `new Date()` (§8.6 #3).
 *
 *  The `CARD_IN` row is the R+C opening of §5.7 beat 2: the tachograph card went in before the driver touched the
 *  phone, so the phone says so and offers the shift rather than asking him to type what the truck already knows. */
import type { JSX } from 'react';
import { CreditCard } from 'lucide-react';
import { fmtDateTime, fmtDayMonth, fmtKm, fmtTime } from '../../app/format';
import { businessDate, daysBetween } from '../../domain/clock';
import type { DriverToday, OdometerRefView } from '../../domain/dto';
import type { Instant } from '../../domain/types';
import { Plate, SimChip } from '../shared';

const NO_PLAN = 'Рейсів на сьогодні немає';
const NO_PLAN_HINT = "Диспетчер призначить рейс — він з'явиться тут";

/** «07:22» today · «вчора 17:48» · «18.09 17:48» older — Kyiv business dates, never a 24-hour window. */
function whenLine(at: Instant, now: Instant): string {
  const days = daysBetween(businessDate(at), businessDate(now));
  if (days === 0) return fmtTime(at);
  return days === 1 ? `вчора ${fmtTime(at)}` : fmtDateTime(at);
}

/** The last trusted reading and what makes it trustworthy (I-5 `OdometerRefView`). The mechanic's reading leads with
 *  the PLATE because it is the only variant that can be about a truck the driver has not driven yet (§3.3 D-02). */
function referenceLine(ref: OdometerRefView, plate: string | null, now: Instant): { text: string; simulated: boolean } | null {
  const { value, at } = ref;
  if (value === null || at === null) return null;
  const km = `${fmtKm(value)} км`;
  switch (ref.kind) {
    case 'MECHANIC':
      return { text: `${plate === null ? '' : `${plate} · `}одометр ${km} · ${fmtDayMonth(at)} · механік`, simulated: false };
    case 'SHIFT_END_AT_BASE':
      return { text: `Одометр ${km} · ${whenLine(at, now)} · база`, simulated: false };
    case 'CAN':
      return { text: `Одометр ${km} · CAN`, simulated: true };
    case 'POINT':
      return { text: ref.place_short === null ? `Одометр ${km} · ${whenLine(at, now)}`
        : `Одометр ${km} · ${whenLine(at, now)} · ${ref.place_short}`, simulated: false };
    case 'NONE':
      return null;
  }
}

export function TodayCard({ today, now }: { today: DriverToday; now: Instant }): JSX.Element {
  const { plan, truck, trailer } = today;
  const cardIn = today.auto_events.filter((e) => e.kind === 'CARD_IN').at(-1) ?? null;
  const reference = referenceLine(today.odometer_ref, truck?.plate ?? null, now);
  const kit = [truck?.model ?? '', trailer?.body_label ?? ''].filter((p) => p !== '').join(' · ');

  return (
    <section className="card-ring flex flex-col gap-3 p-3">
      {cardIn === null ? null : (
        <span className="flex items-center gap-2 text-[1rem] leading-[1.375rem]">
          <CreditCard aria-hidden="true" className="size-[1.25rem] shrink-0" />
          <span className="min-w-0">{`Картку вставлено ${fmtTime(cardIn.at)}. Почати зміну?`}</span>
          <SimChip />
        </span>
      )}
      {plan === null ? (
        <div className="empty-slot flex flex-col gap-1 px-3 py-4">
          <span className="text-[1.125rem] leading-[1.5rem] font-semibold">{NO_PLAN}</span>
          <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{NO_PLAN_HINT}</span>
        </div>
      ) : (
        <h2 className="text-[1.125rem] leading-[1.5rem] font-semibold">{`Ваш рейс сьогодні: ${plan.caption}`}</h2>
      )}
      {truck === null ? null : (
        <span className="flex flex-wrap items-center gap-2">
          <Plate plate={truck.plate} size="md" />
          {trailer === null ? null : (
            <>
              <span className="text-[0.875rem] leading-[1.25rem] font-medium" style={{ color: 'var(--text-2)' }}>причіп</span>
              <Plate plate={trailer.plate} size="md" />
            </>
          )}
        </span>
      )}
      {kit === '' ? null : (
        <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{kit}</span>
      )}
      {reference === null ? null : (
        <span className="flex flex-wrap items-center gap-2">
          <span className="tnum text-[1rem] leading-[1.375rem]">{reference.text}</span>
          {reference.simulated ? <SimChip /> : null}
        </span>
      )}
    </section>
  );
}
