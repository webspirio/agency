import { asDecimal2, asInstant, type Instant } from '@agency/mock';
import { createStream, type Locale } from '@agency/synth';
import { flagsFor } from './rules';
import type { Driver, DriverEvent, EventKind, OdometerSource, PhotoKind, Truck } from './types';

/** One number pins the whole demo. Change it and every driver name below
 *  changes together, reproducibly, on every machine. */
export const SEED = 20260916;

/** Set by `agency new --locale`. Drives the synth corpus and <html lang>. */
export const LOCALE = 'uk' as Locale;

/**
 * THE FLEET. Scania, because KTL's own «Про компанію» page says the fleet is
 * «на 97% складається з автомобілів марки Scania» — which is also the single
 * best fact about this client's OCR prospects, since a Scania Euro 5/6 cluster
 * is a backlit digital LCD and not a grimy analogue drum.
 *
 * Plates are Cyrillic АР — the Запорізька область series — written with the
 * letters a Ukrainian plate may actually carry.
 *
 * `has_can` is what decides whether the odometer screen renders AT ALL, and it
 * is false on THREE of the four deliberately. Ruptela covers the international
 * share — roughly 30% of the business — while «Регіс», which covers the ~70%
 * domestic fleet, could not be identified as a company in any Ukrainian-language
 * search, so no CAN odometer can be assumed for it. One truck in four matches
 * that ratio. A demo that assumed telematics everywhere would be demoing a
 * product that does not exist.
 *
 * `norm_l_100km` is the CLIENT'S OWN approved figure, per truck. There is no
 * state norm to fall back on: наказ Мінтрансу №43 was repealed by наказ
 * Мінінфраструктури №1011 від 02.11.2023, leaving only ДержавтотрансНДІпроект's
 * advisory Базові норми, which each enterprise adopts by internal наказ.
 */
const FLEET: readonly Omit<Truck, 'id'>[] = [
  /**
   * THE BOUND DRIVER'S TRUCK, and its `has_can: false` is a demo decision worth
   * recording rather than a fact about a vehicle.
   *
   * `bound()` in routes.ts returns the first driver, who drives this truck, so
   * whatever this flag says is what the client watches on the call. With `true`
   * the odometer screen does not render at all and the flow is three taps —
   * which is the better product and the worse demonstration, because the
   * odometer is the client's stated goal #2 and the three-tier screen is the
   * centre of the design he would never see.
   *
   * `false` is also the HONEST majority. Ruptela covers the international share,
   * roughly 30% of the business; the domestic ~70% runs on «Регіс», which could
   * not be identified as a company in any Ukrainian-language search, so no CAN
   * odometer can be assumed for it. One truck in four here carries CAN, which is
   * about the real ratio, and the three-tap path is a sentence on the call
   * rather than a promise the integration has not earned.
   */
  {
    plate: 'АР 1234 ВС',
    model: 'Scania R450 · кормовоз',
    has_can: false,
    odometer_km: 412355,
    norm_l_100km: asDecimal2('32.00'),
  },
  {
    plate: 'АР 5678 СЕ',
    model: 'Scania G410 · зерновоз',
    has_can: false,
    odometer_km: 188160,
    norm_l_100km: asDecimal2('30.00'),
  },
  {
    plate: 'АР 9012 МК',
    model: 'Scania R500 · тент',
    has_can: true,
    odometer_km: 241480,
    norm_l_100km: asDecimal2('29.50'),
  },
  {
    plate: 'АР 3344 НТ',
    model: 'Scania P360 · борошновоз',
    has_can: false,
    odometer_km: 96820,
    norm_l_100km: asDecimal2('31.00'),
  },
];

/** Real loading and unloading points in and around Запорізька область — the
 *  names Ruptela's geofences would carry, so the driver never picks one from a
 *  list. A list is reading, and reading is the thing that does not happen. */
const ROUTES = [
  { from: 'Комбікормовий завод, Вільнянськ', to: 'ТОВ «Агро-Схід», Мелітополь' },
  { from: 'Елеватор, Комишуваха', to: 'Птахофабрика, Оріхів' },
  { from: 'Свинокомплекс, Гуляйполе', to: 'Термінал, Одеса' },
  { from: 'Млин, Токмак', to: 'Ферма, Пологи' },
] as const;

const STATIONS = ['ОККО, М-18, Василівка', 'WOG, Північне шосе, Запоріжжя'] as const;

export function buildFleet(): readonly Omit<Truck, 'id'>[] {
  return FLEET;
}

/**
 * One driver per truck. Names from `@agency/synth`'s Ukrainian corpus, so they
 * are plausible and identical on every machine rather than four names somebody
 * typed once.
 */
export function buildCrew(trucks: readonly Truck[]): readonly Omit<Driver, 'id'>[] {
  const stream = createStream(SEED);
  return trucks.map((truck, index) => ({
    name: stream.person(LOCALE),
    phone: PHONES[index] ?? '+380 50 000 00 00',
    truck_id: truck.id,
  }));
}

/** Literals, not a computed offset: a phone number built from an index is
 *  arithmetic, and the lint rules reject it on sight. */
const PHONES = ['+380 50 451 35 53', '+380 66 912 60 89', '+380 50 318 44 07', '+380 67 220 91 16'];

/**
 * A row of the seed event table, BEFORE the store assigns its id and before
 * `flagsFor` is applied. Written as literals rather than generated: a demo's
 * events should look like a day somebody actually drove.
 */
type Planned = {
  truck: number;
  kind: EventKind;
  at: string;
  odometer: number;
  place: string;
  ttn: string | null;
  litres: string | null;
  uah: string | null;
  source: OdometerSource;
  confirmed: string | null;
};

/**
 * TWO DAYS OF A FOUR-TRUCK FLEET, arranged so every state the office screens
 * have to render is present in the seed rather than reachable only by clicking:
 *
 *   · a closed leg with a refuel inside it, confirmed — the happy row;
 *   · a closed leg with NO refuel — the one whose l/100km is null rather than
 *     0.00, which is the distinction `calc.ts` exists to get right;
 *   · two OPEN legs — loaded this morning, not yet unloaded — which is what
 *     most of a working fleet looks like at any moment;
 *   · four events still awaiting a dispatcher, which is the work queue the
 *     whole design relocates typing INTO, and therefore the number the client
 *     should see first;
 *   · one dropped digit on truck 3 (24 148 where 241 480 belongs), which is the
 *     single most common real input error and the reason `flagsFor` warns
 *     instead of refusing. The driver was already 300 km away when it surfaced.
 */
const PLANNED: readonly Planned[] = [
  // ── Truck 1 · a complete, confirmed day: load, refuel, unload ──────────
  { truck: 0, kind: 'LOADING', at: '2026-09-15T06:10:00.000Z', odometer: 412100,
    place: ROUTES[0].from, ttn: '0034512', litres: null, uah: null,
    source: 'DRIVER_CONFIRMED', confirmed: '2026-09-15T18:40:00.000Z' },
  { truck: 0, kind: 'REFUEL', at: '2026-09-15T09:40:00.000Z', odometer: 412198,
    place: STATIONS[0], ttn: null, litres: '80.00', uah: '4160.00',
    source: 'DRIVER_CONFIRMED', confirmed: '2026-09-15T18:42:00.000Z' },
  { truck: 0, kind: 'UNLOADING', at: '2026-09-15T13:25:00.000Z', odometer: 412350,
    place: ROUTES[0].to, ttn: null, litres: null, uah: null,
    source: 'DRIVER_CONFIRMED', confirmed: '2026-09-15T18:44:00.000Z' },

  // ── Truck 2 · a closed leg with NO refuel: l/100km is unknown, not zero ──
  { truck: 1, kind: 'LOADING', at: '2026-09-15T07:00:00.000Z', odometer: 188000,
    place: ROUTES[1].from, ttn: '0034518', litres: null, uah: null,
    source: 'DRIVER_CONFIRMED', confirmed: '2026-09-15T19:05:00.000Z' },
  { truck: 1, kind: 'UNLOADING', at: '2026-09-15T11:20:00.000Z', odometer: 188105,
    place: ROUTES[1].to, ttn: null, litres: null, uah: null,
    source: 'DASH_PHOTO', confirmed: '2026-09-15T19:07:00.000Z' },

  // ── Truck 3 · the dropped digit. 24 148 for 241 480 — flagged, never blocked ──
  { truck: 2, kind: 'LOADING', at: '2026-09-15T05:30:00.000Z', odometer: 241000,
    place: ROUTES[2].from, ttn: '0034520', litres: null, uah: null,
    source: 'CAN_AUTO', confirmed: '2026-09-15T19:30:00.000Z' },
  { truck: 2, kind: 'UNLOADING', at: '2026-09-15T16:45:00.000Z', odometer: 24148,
    place: ROUTES[2].to, ttn: null, litres: null, uah: null,
    source: 'DRIVER_TYPED', confirmed: null },

  // ── This morning · two open legs and an unconfirmed refuel ──────────────
  { truck: 0, kind: 'LOADING', at: '2026-09-16T05:50:00.000Z', odometer: 412355,
    place: ROUTES[1].from, ttn: null, litres: null, uah: null,
    source: 'DRIVER_CONFIRMED', confirmed: null },
  { truck: 1, kind: 'LOADING', at: '2026-09-16T06:30:00.000Z', odometer: 188110,
    place: ROUTES[3].from, ttn: null, litres: null, uah: null,
    source: 'DRIVER_CONFIRMED', confirmed: null },
  { truck: 1, kind: 'REFUEL', at: '2026-09-16T08:15:00.000Z', odometer: 188160,
    place: STATIONS[1], ttn: null, litres: '62.00', uah: '3224.00',
    source: 'DASH_PHOTO', confirmed: null },
];

const PHOTO: Readonly<Record<EventKind, PhotoKind>> = {
  LOADING: 'TTN',
  UNLOADING: 'TTN_SIGNED',
  REFUEL: 'FUEL_RECEIPT',
};

/**
 * THE SEED ROWS, WITHOUT IDS. The store assigns them from one allocator it
 * mints once — HARD RULE 4, and the fix for the measured defect where a second
 * `buildSeed()` call re-minted the sequence and a created row collided with a
 * seeded one.
 *
 * Flags are COMPUTED by `flagsFor`, never written by hand. A hand-written flag
 * is a second copy of the rule that stops agreeing with it the first time
 * somebody edits a number in the table above — and the dropped-digit row exists
 * precisely to show the rule firing, so a literal there would be showing a
 * picture of the rule rather than the rule.
 */
export function buildSeed(
  trucks: readonly Truck[],
  crew: readonly Driver[],
): readonly Omit<DriverEvent, 'id'>[] {
  const last = new Map<string, number>();

  return PLANNED.map((planned) => {
    const truck = trucks[planned.truck];
    if (!truck) throw new Error(`seed: no truck at index ${planned.truck}`);
    const driver = crew.find((member) => member.truck_id === truck.id);
    if (!driver) throw new Error(`seed: no driver bound to ${truck.plate}`);

    const previous = last.get(truck.id) ?? null;
    last.set(truck.id, planned.odometer);

    return {
      kind: planned.kind,
      driver_id: driver.id,
      driver_name: driver.name,
      truck_id: truck.id,
      plate: truck.plate,
      occurred_at: asInstant(planned.at),
      place: planned.place,
      odometer_km: planned.odometer,
      odometer_source: planned.source,
      photo_kind: PHOTO[planned.kind],
      ttn_number: planned.ttn,
      ttn_source: planned.ttn === null ? null : ('OFFICE' as const),
      litres: planned.litres === null ? null : asDecimal2(planned.litres),
      amount_uah: planned.uah === null ? null : asDecimal2(planned.uah),
      confirmed_at: planned.confirmed === null ? null : confirmedAt(planned.confirmed),
      flags: flagsFor(planned.odometer, previous, planned.ttn),
      sync: 'SENT' as const,
    };
  });
}

function confirmedAt(raw: string): Instant {
  return asInstant(raw);
}
