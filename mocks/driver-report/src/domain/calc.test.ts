import { describe, expect, it } from 'vitest';
import { asDecimal2, asInstant } from '@agency/mock';
import { legsOf, overview, waybillOf } from './calc';
import type { DriverEvent, EventKind, Truck } from './types';

/**
 * A РЕЙС IS A QUERY, NOT A ROW THE DRIVER MAINTAINS. This file is where that
 * claim is either true or false.
 *
 * The alternative — a trip object the phone carries — buys the office an
 * illusion of completeness, because the way a driver "completes" a trip object
 * is by tapping through screens he is not reading. What it definitely buys is a
 * list to pick from, a state to be in, and a wrong state to be stuck in. So the
 * driver emits three kinds of flat, independent, immutable event and the office
 * pairs them: each LOADING with the next UNLOADING on the same truck, with every
 * REFUEL that falls between them attached.
 *
 * The cost is real and is tested here rather than hidden: a leg whose unloading
 * was never reported stays OPEN, with a null `ended_at` and a null `km`. Nothing
 * invents a distance for it.
 */

const NOW = '2026-09-16T18:00:00.000Z';

const TRUCKS: Truck[] = [
  {
    id: 'truck-000001',
    plate: 'AP 1234 BC',
    model: 'Scania R450',
    has_can: true,
    odometer_km: 412100,
    norm_l_100km: asDecimal2('32.00'),
  },
  {
    id: 'truck-000002',
    plate: 'AP 5678 CE',
    model: 'Scania G410',
    has_can: false,
    odometer_km: 188000,
    norm_l_100km: asDecimal2('30.00'),
  },
];

let nth = 0;

/** Ids come from a counter, never from array position — HARD RULE 4 applies to
 *  a fixture exactly as it applies to the store. */
function ev(
  kind: EventKind,
  truck: string,
  at: string,
  odometer: number,
  extra: Partial<DriverEvent> = {},
): DriverEvent {
  nth += 1;
  return {
    id: `event-${String(nth).padStart(6, '0')}`,
    kind,
    driver_id: 'driver-000001',
    driver_name: 'Петренко Іван',
    truck_id: truck,
    plate: truck === 'truck-000001' ? 'AP 1234 BC' : 'AP 5678 CE',
    occurred_at: asInstant(at),
    place: 'Вільнянськ',
    odometer_km: odometer,
    odometer_source: 'DRIVER_CONFIRMED',
    photo_kind: kind === 'REFUEL' ? 'FUEL_RECEIPT' : kind === 'LOADING' ? 'TTN' : 'TTN_SIGNED',
    ttn_number: null,
    ttn_source: null,
    litres: null,
    amount_uah: null,
    confirmed_at: null,
    flags: [],
    sync: 'SENT',
    ...extra,
  };
}

describe('legsOf pairs a loading with the next unloading on the SAME truck', () => {
  it('closes a leg and reports the distance from the two spidometr readings', () => {
    const legs = legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100, {
          place: 'Комбікормовий завод, Вільнянськ',
          ttn_number: '0034512',
        }),
        ev('UNLOADING', 'truck-000001', '2026-09-15T13:30:00.000Z', 412350, {
          place: 'ТОВ «Агро-Схід», Мелітополь',
        }),
      ],
      TRUCKS,
    );

    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({
      from_place: 'Комбікормовий завод, Вільнянськ',
      to_place: 'ТОВ «Агро-Схід», Мелітополь',
      odometer_out_km: 412100,
      odometer_in_km: 412350,
      km: 250,
      ttn_number: '0034512',
    });
  });

  it('leaves a leg OPEN when the unloading was never reported, and invents nothing', () => {
    const legs = legsOf(
      [ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100)],
      TRUCKS,
    );
    expect(legs[0]?.ended_at).toBeNull();
    expect(legs[0]?.km).toBeNull();
    expect(legs[0]?.l_100km).toBeNull();
  });

  it('does NOT close a leg with an unloading from a different truck', () => {
    /* Two trucks interleaved in one event stream is the normal case, not the
       exotic one — the office reads every driver's events in one list. */
    const legs = legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100),
        ev('UNLOADING', 'truck-000002', '2026-09-15T09:00:00.000Z', 188200),
        ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350),
      ],
      TRUCKS,
    );
    const first = legs.find((leg) => leg.odometer_out_km === 412100);
    expect(first?.km).toBe(250);
  });

  it('handles two loads on one day, which is ordinary for a domestic feed run', () => {
    const legs = legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T05:00:00.000Z', 412100),
        ev('UNLOADING', 'truck-000001', '2026-09-15T09:00:00.000Z', 412200),
        ev('LOADING', 'truck-000001', '2026-09-15T11:00:00.000Z', 412210),
        ev('UNLOADING', 'truck-000001', '2026-09-15T16:00:00.000Z', 412330),
      ],
      TRUCKS,
    );
    expect(legs.map((leg) => leg.km)).toEqual([100, 120]);
  });

  it('ignores an unloading with no loading before it rather than crashing', () => {
    /* The driver forgot to report the loading. The event is real and is kept;
       it simply forms no leg, and the office sees an unpaired row. */
    expect(legsOf([ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350)], TRUCKS))
      .toEqual([]);
  });

  it('reads the stream in chronological order regardless of the order given', () => {
    const later = ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350);
    const earlier = ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100);
    expect(legsOf([later, earlier], TRUCKS)[0]?.km).toBe(250);
  });
});

describe('fuel is measured against the CLIENT’S OWN norm, because there is no state one', () => {
  /* Наказ Мінтрансу №43 was repealed by наказ Мінінфраструктури №1011 від
     02.11.2023. Only ДержавтотрансНДІпроект's advisory Базові норми remain and
     each enterprise approves its own by internal наказ. The норм lives on the
     TRUCK row, and that is a configuration surface rather than a constant. */
  const withRefuel = () =>
    legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100),
        ev('REFUEL', 'truck-000001', '2026-09-15T09:00:00.000Z', 412200, {
          litres: asDecimal2('80.00'),
          amount_uah: asDecimal2('4160.00'),
        }),
        ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350),
      ],
      TRUCKS,
    );

  it('attaches a refuel that falls inside the leg', () => {
    expect(withRefuel()[0]?.litres).toBe('80.00');
  });

  it('computes l/100km as a decimal string, never through a float', () => {
    // 80 L over 250 km = 32.00 l/100km — exactly the truck's norm.
    expect(withRefuel()[0]?.l_100km).toBe('32.00');
  });

  it('does not call the norm exceeded when consumption EQUALS it', () => {
    expect(withRefuel()[0]?.over_norm).toBe(false);
  });

  it('flags over-norm consumption, which is the number that costs money', () => {
    /* Over-norm fuel triggers a compensating VAT liability under пп.«г»
       п.198.5 ПКУ, so this boolean is a tax exposure rather than tidiness. */
    const legs = legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100),
        ev('REFUEL', 'truck-000001', '2026-09-15T09:00:00.000Z', 412200, {
          litres: asDecimal2('95.00'),
          amount_uah: asDecimal2('4940.00'),
        }),
        ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350),
      ],
      TRUCKS,
    );
    expect(legs[0]?.l_100km).toBe('38.00');
    expect(legs[0]?.over_norm).toBe(true);
  });

  it('reports no consumption rate on a leg that carries no refuel', () => {
    const legs = legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100),
        ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350),
      ],
      TRUCKS,
    );
    expect(legs[0]?.litres).toBe('0.00');
    expect(legs[0]?.l_100km).toBeNull();
    expect(legs[0]?.over_norm).toBe(false);
  });

  it('reports no consumption rate on a zero-distance leg rather than dividing by zero', () => {
    const legs = legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100),
        ev('REFUEL', 'truck-000001', '2026-09-15T07:00:00.000Z', 412100, {
          litres: asDecimal2('80.00'),
          amount_uah: asDecimal2('4160.00'),
        }),
        ev('UNLOADING', 'truck-000001', '2026-09-15T08:00:00.000Z', 412100),
      ],
      TRUCKS,
    );
    expect(legs[0]?.km).toBe(0);
    expect(legs[0]?.l_100km).toBeNull();
  });
});

describe('waybillOf emits BAS’s own «Подорожній лист» columns', () => {
  /* BAS's standard document already carries водій, автомобіль and «показники
     спідометра на момент виїзду та повернення», and computes fuel from
     норми × пробіг. The export is that document, not a CSV somebody has to map
     by hand — which is why the field is called spidometr and not odometer. */
  const legs = () =>
    legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100, { ttn_number: '0034512' }),
        ev('REFUEL', 'truck-000001', '2026-09-15T09:00:00.000Z', 412200, {
          litres: asDecimal2('80.00'),
          amount_uah: asDecimal2('4160.00'),
        }),
        ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350),
      ],
      TRUCKS,
    );

  it('carries one row per leg, dated by the day it started', () => {
    const out = waybillOf(NOW, legs());
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      date: '2026-09-15',
      driver_name: 'Петренко Іван',
      plate: 'AP 1234 BC',
      spidometr_out_km: 412100,
      spidometr_in_km: 412350,
      km: 250,
      litres_by_receipt: '80.00',
      ttn_number: '0034512',
    });
  });

  it('computes litres BY NORM as well as by receipt, which is the pair BAS reconciles', () => {
    // 32.00 l/100km over 250 km = 80.00 L by norm.
    expect(waybillOf(NOW, legs()).rows[0]?.litres_by_norm).toBe('80.00');
  });

  it('totals the columns so the printed rows add up to the printed total', () => {
    const out = waybillOf(NOW, legs());
    expect(out.total_km).toBe(250);
    expect(out.total_litres).toBe('80.00');
  });

  it('leaves litres-by-norm null on an open leg rather than guessing a distance', () => {
    const open = legsOf([ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100)], TRUCKS);
    const out = waybillOf(NOW, open);
    expect(out.rows[0]?.litres_by_norm).toBeNull();
    expect(out.total_km).toBe(0);
  });

  /* ── A DROPPED DIGIT MUST NOT REACH THE ACCOUNTING BASE ─────────────────
   *
   * FOUND 2026-09-16 by looking at the export screen: the seeded leg where a
   * driver typed 24 148 for 241 480 produced пробіг −216 852 км, and норма ×
   * пробіг ÷ 100 turned that into «Пальне за нормою −63 971.34 л» — a negative
   * quantity of diesel, in the column an operator is about to push into BAS
   * through an HTTP-сервіс. The totals row then read −216 497 км for the whole
   * fleet's day.
   *
   * Arithmetic on an impossible distance is not arithmetic. This is the same
   * rule the l/100km column already follows and for the same reason: where the
   * answer is unknowable the column says so, and «—» is the only honest value.
   */
  const droppedDigit = () =>
    legsOf(
      [
        ev('LOADING', 'truck-000001', '2026-09-15T05:30:00.000Z', 241000),
        ev('UNLOADING', 'truck-000001', '2026-09-15T16:45:00.000Z', 24148),
      ],
      TRUCKS,
    );

  it('refuses to compute litres-by-norm from a NEGATIVE distance', () => {
    const out = waybillOf(NOW, droppedDigit());
    expect(out.rows[0]?.km).toBe(-216852);
    expect(out.rows[0]?.litres_by_norm).toBeNull();
  });

  it('keeps an impossible leg OUT of the totals, and counts it instead', () => {
    /* Not dropped silently: `suspect` is how the screen knows to warn, and how
       an operator knows the export is not yet safe to send. */
    const legs = [...droppedDigit(), ...legsSample()];
    const out = waybillOf(NOW, legs);
    expect(out.total_km).toBe(250);
    expect(out.suspect).toBe(1);
  });

  it('counts nothing as suspect on a clean day', () => {
    expect(waybillOf(NOW, legsSample()).suspect).toBe(0);
  });

  function legsSample() {
    return legsOf(
      [
        ev('LOADING', 'truck-000002', '2026-09-15T06:00:00.000Z', 188000),
        ev('UNLOADING', 'truck-000002', '2026-09-15T13:00:00.000Z', 188250),
      ],
      TRUCKS,
    );
  }
});

describe('overview', () => {
  const events = [
    ev('LOADING', 'truck-000001', '2026-09-15T06:00:00.000Z', 412100, { ttn_number: '0034512' }),
    ev('REFUEL', 'truck-000001', '2026-09-15T09:00:00.000Z', 412200, {
      litres: asDecimal2('80.00'),
      amount_uah: asDecimal2('4160.00'),
    }),
    ev('UNLOADING', 'truck-000001', '2026-09-15T13:00:00.000Z', 412350),
  ];

  it('counts the events a dispatcher still has to read a number off', () => {
    /* `pending` is the work queue, and it is the honest cost of this design:
       we did not remove re-keying, we moved it to a desk with a keyboard, good
       light and the photograph on screen. */
    expect(overview(NOW, events, legsOf(events, TRUCKS))).toMatchObject({
      pending: 3,
      events: 3,
      legs: 1,
      total_litres: '80.00',
    });
  });

  it('does not count an already-confirmed event as pending', () => {
    const confirmed = [
      ...events,
      ev('LOADING', 'truck-000002', '2026-09-15T07:00:00.000Z', 188000, {
        confirmed_at: asInstant('2026-09-15T20:00:00.000Z'),
        ttn_number: '0034999',
      }),
    ];
    expect(overview(NOW, confirmed, legsOf(confirmed, TRUCKS)).pending).toBe(3);
  });

  it('pins its own clock from the argument, so the demo is not clock-dependent', () => {
    expect(overview(NOW, events, []).generated_at).toBe(NOW);
  });
});
