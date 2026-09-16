import { div, gt, isZero, mul, sum } from '@agency/dec';
import { asDecimal2, asInstant, byCodepoint } from '@agency/mock';
import type { DriverEvent, Leg, Overview, Truck, WaybillExport, WaybillRow } from './types';

/**
 * WHERE THE РЕЙС COMES FROM.
 *
 * Derivations live here, never in a component and never in a handler. The
 * handler in `src/api/routes.ts` calls this; at conversion the Nest service
 * calls the same function with the same signature and rows from TypeORM.
 *
 * `now` is a parameter rather than a `new Date()` inside, so a test can pin it
 * and the demo is not clock-dependent. Rows are arguments rather than a
 * `buildSeed()` call, so nothing a POST does is lost by the next GET.
 *
 * ALL MONEY AND ALL FUEL GO THROUGH `@agency/dec`. Litres and hryvnia are
 * decimal strings and l/100km is a division — the one operation a float is
 * guaranteed to get wrong in a way nobody notices until an accountant does.
 * Kilometres are whole-number counts and stay `number`.
 */

/** Chronological, explicitly. The store's insertion order happens to agree
 *  today; relying on that would make a reordering of the seed a silent change
 *  in what a leg means. `byCodepoint`, never `localeCompare`: ICU collation is a
 *  property of the machine node was built on. */
const chronological = (events: readonly DriverEvent[]): DriverEvent[] =>
  [...events].sort((a, b) => byCodepoint(a.occurred_at, b.occurred_at));

/** An open leg, while the walk is still looking for its unloading. */
type Open = {
  loading: DriverEvent;
  litres: string[];
};

/**
 * EACH LOADING PAIRED WITH THE NEXT UNLOADING ON THE SAME TRUCK, with every
 * REFUEL that falls between them attached.
 *
 * Per truck rather than per driver, because the truck is what carries the
 * spidometr and two drivers may share one over a shift change. An UNLOADING
 * with no LOADING before it forms no leg at all — the event is real, it is kept,
 * and the office sees an unpaired row rather than a leg with an invented origin.
 *
 * A leg with no unloading stays OPEN: `ended_at`, `km` and `l_100km` are null
 * and nothing guesses a distance. That null is the honest cost of refusing to
 * put a trip object on the driver's phone, and it is the red chip in the office.
 */
export function legsOf(events: readonly DriverEvent[], trucks: readonly Truck[]): Leg[] {
  const norms = new Map(trucks.map((truck) => [truck.id, truck.norm_l_100km]));
  const open = new Map<string, Open>();
  const legs: Leg[] = [];

  for (const event of chronological(events)) {
    const pending = open.get(event.truck_id);

    if (event.kind === 'LOADING') {
      /* A second loading before the first was unloaded closes nothing and
         starts nothing new for the old one: the earlier leg is abandoned as
         open. Overwriting is right — the paper moved on, so the data should. */
      if (pending) legs.push(close(pending, null, norms));
      open.set(event.truck_id, { loading: event, litres: [] });
      continue;
    }

    if (event.kind === 'REFUEL') {
      // A refuel outside any leg is still a real event; it simply belongs to no
      // leg's consumption and is counted only in the overview total.
      if (pending && event.litres !== null) pending.litres.push(event.litres);
      continue;
    }

    if (pending) {
      legs.push(close(pending, event, norms));
      open.delete(event.truck_id);
    }
  }

  for (const pending of open.values()) legs.push(close(pending, null, norms));

  return legs.sort((a, b) => byCodepoint(a.started_at, b.started_at));
}

function close(
  pending: Open,
  unloading: DriverEvent | null,
  norms: ReadonlyMap<string, string>,
): Leg {
  const { loading } = pending;
  const norm = norms.get(loading.truck_id) ?? '0.00';
  const litres = sum(pending.litres);
  const km = unloading === null ? null : unloading.odometer_km - loading.odometer_km;
  /**
   * TWO GUARDS, and the second one is the one that matters.
   *
   * `div` throws on a zero divisor by design, so a zero-distance leg — a load
   * cancelled at the gate — is excluded here rather than in a try/catch there.
   *
   * The second guard is a correctness claim, not a crash guard: a leg with a
   * real distance and NO refuel reported has an UNKNOWN consumption rate, not a
   * rate of zero. The truck ran on fuel bought before the leg started. Emitting
   * `0.00 l/100km` would put a number in the office's fuel column that reads as
   * a measurement and is a fabrication — and it would drag every fleet average
   * computed over it downwards. Null says "nobody refuelled on this leg", which
   * is the truth and is also actionable.
   */
  const measurable = km !== null && Math.sign(km) === 1 && !isZero(litres);
  const rate = measurable ? div(mul(litres, '100.00'), km) : null;

  return {
    id: `leg-of-${loading.id}`,
    plate: loading.plate,
    driver_name: loading.driver_name,
    from_place: loading.place,
    to_place: unloading?.place ?? '—',
    started_at: loading.occurred_at,
    ended_at: unloading?.occurred_at ?? null,
    odometer_out_km: loading.odometer_km,
    odometer_in_km: unloading?.odometer_km ?? null,
    km,
    litres: asDecimal2(litres),
    l_100km: rate === null ? null : asDecimal2(rate),
    norm_l_100km: asDecimal2(norm),
    over_norm: rate !== null && gt(rate, norm),
    ttn_number: loading.ttn_number,
  };
}

/**
 * THE EXPORT, SHAPED LIKE BAS'S OWN «Подорожній лист».
 *
 * Not a CSV somebody has to map by hand: BAS's standard document already
 * carries водій, автомобіль and «показники спідометра на момент виїзду та
 * повернення», and computes fuel from норми × пробіг. Those are the columns
 * below, which is why the field is `spidometr_out_km` and not `odometer_out_km`
 * — the driver's word and the accounting system's word are the same word, and
 * it is not the technically correct one.
 *
 * Note what this does NOT claim to be. Подорожній лист was abolished as a state
 * form in 2013 (наказ №1005/1454 від 10.12.2013) and is absent from ст.48 ЗУ
 * «Про автомобільний транспорт». It survives at KTL as an internal habit, so
 * this is an internal primary document — which the enterprise approves itself,
 * carrying the ст.9 ЗУ №996-XIV requisites.
 */
export function waybillOf(now: string, legs: readonly Leg[]): WaybillExport {
  const rows = legs.map(rowOf);
  return {
    generated_at: asInstant(now),
    rows,
    /* USABLE ROWS ONLY. A negative пробіг is a dropped digit, not a distance,
       and adding it to a fleet total produces a headline figure that is wrong
       by twice the error. MEASURED on the seeded day: one mistyped reading took
       the whole export's total to −216 497 км. */
    total_km: rows.reduce((acc, row) => acc + (usable(row.km) ? (row.km ?? 0) : 0), 0),
    // Σ round(each line), so the printed total equals the printed lines.
    total_litres: asDecimal2(sum(rows.map((row) => row.litres_by_receipt))),
    suspect: rows.filter((row) => row.km !== null && !usable(row.km)).length,
  };
}

/**
 * A distance anyone may act on. Zero is usable — a load cancelled at the gate is
 * a real leg of no length — and NEGATIVE is not, because a spidometr cannot run
 * backwards and the reading behind it is a typo somebody has to resolve.
 *
 * `Math.sign` rather than `km < 0`: `agency/no-decimal-comparison` is on in
 * `src/domain`, and it is on for a good reason even though the hazard it guards
 * (lexicographic ordering of decimal STRINGS) cannot arise on a kilometre count.
 */
const usable = (km: number | null): boolean => km !== null && Math.sign(km) !== -1;

function rowOf(leg: Leg): WaybillRow {
  /* норма × пробіг ÷ 100 — the calculation BAS performs itself, reproduced here
     so the two columns can be read side by side. Null on an open leg: there is
     no distance, so there is no норма figure, and inventing one would make the
     reconciliation the column exists for meaningless. */
  /* `usable`, not `!== null`: норма × пробіг ÷ 100 over a NEGATIVE distance
     yields a negative quantity of diesel, which is what «Пальне за нормою
     −63 971.34 л» looked like on the export screen before this guard existed.
     Where the distance is impossible the norm figure is unknowable, and the
     column says «—» exactly as l/100km already does. */
  const byNorm = usable(leg.km) ? div(mul(leg.norm_l_100km, String(leg.km)), 100) : null;

  return {
    id: leg.id,
    /* The business DATE, not an instant: BAS's document is per day. Sliced off
       the ISO string rather than built from a Date, which would apply the
       presenter's timezone to a wire value. */
    date: leg.started_at.slice(0, 10),
    driver_name: leg.driver_name,
    plate: leg.plate,
    spidometr_out_km: leg.odometer_out_km,
    spidometr_in_km: leg.odometer_in_km,
    km: leg.km,
    litres_by_receipt: leg.litres,
    litres_by_norm: byNorm === null ? null : asDecimal2(byNorm),
    ttn_number: leg.ttn_number,
  };
}

/**
 * The dispatcher's summary strip.
 *
 * `pending` is the honest cost of this design and is deliberately the first
 * number on the screen: we did not remove re-keying, we moved it from a scan
 * that arrives in a week to a photograph that arrives in ten seconds, and from
 * a man with dirty hands at a loading gate to a desk with a keyboard, good light
 * and the document on screen. Roughly 400 confirmations a day at ~15 seconds is
 * about a quarter of a post — less than re-typing scans today, but not nothing,
 * and the number belongs where the client can see it.
 */
export function overview(
  now: string,
  events: readonly DriverEvent[],
  legs: readonly Leg[],
): Overview {
  const litres = events
    .map((event) => event.litres)
    .filter((value): value is NonNullable<typeof value> => value !== null);

  return {
    headline: 'Звіт водія',
    generated_at: asInstant(now),
    pending: events.filter((event) => event.confirmed_at === null).length,
    events: events.length,
    legs: legs.length,
    total_litres: asDecimal2(sum(litres)),
  };
}
