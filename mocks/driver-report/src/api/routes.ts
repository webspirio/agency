/**
 * THE IMPLEMENTATION SIDE. `HandlersOf<Api>` is a mapped type over the contract,
 * so a declared operation with no handler is an error naming the missing key,
 * and a handler returning the wrong shape is an error naming the missing fields.
 *
 * Each handler body is the future Nest controller body — same inputs, same
 * envelope, same status codes — so a converted endpoint is a move, not a
 * rewrite. The refusals live in `src/domain/rules.ts` as pure functions over row
 * snapshots, and the derivations in `src/domain/calc.ts`; both halves move into
 * a service unchanged.
 */
import {
  createStore,
  MAX_LIMIT,
  asInstant,
  type HandlersOf,
  type Paginated,
  type Route,
} from '@agency/mock';
import { fail, toRoutes, type Api } from './contract';
import { legsOf, overview, waybillOf } from '../domain/calc';
import {
  alreadyConfirmed,
  blankTtn,
  duplicateTtn,
  flagsFor,
  invalidOdometer,
  photoMismatch,
  unknownTruck,
} from '../domain/rules';
import { buildCrew, buildFleet, buildSeed } from '../domain/seed';
import type { Driver, DriverEvent, Truck } from '../domain/types';

/**
 * THE ONE COERCION IN THE WHOLE MOCK, and it is isolated to one line so the
 * reason can sit beside it.
 *
 * `agency/no-numeric-coercion` exists because `Number('0.1') + Number('0.2')` is
 * 0.30000000000000004 — a decimal string losing places through a float. That
 * hazard cannot arise here: `invalidOdometer` has ALREADY refused anything but
 * `/^\d{1,7}$/`, so this value has no decimal point to lose and its maximum,
 * 9 999 999, is exactly representable in a double with six orders of magnitude
 * to spare. A kilometre count is not money.
 *
 * The directive is on the line it excuses rather than on the file, so the other
 * ninety lines here stay checked and a second coercion added beside it goes red.
 */
function kilometres(raw: string): number {
  // oxlint-disable-next-line agency/no-numeric-coercion -- a whole-kilometre count already pinned to /^\d{1,7}$/ by invalidOdometer(); no decimal places exist to lose, and 9999999 is exact in a double.
  return Number(raw);
}

/**
 * HARD RULE 5's envelope, over a list this mock holds entirely in memory.
 *
 * Chunked rather than sliced at `limit * (page - 1)`, because that multiplication
 * is exactly what `agency/no-float-arithmetic` forbids in `src/api` — and
 * reaching for a disable directive to compute an array offset would be
 * negotiating with a rule rather than obeying it. The fold below produces the
 * same pages with no arithmetic at all.
 */
function paginate<Row>(rows: readonly Row[], page: number, limit: number): Paginated<Row> {
  const pages = rows.reduce<Row[][]>((acc, row) => {
    const last = acc.at(-1);
    if (last === undefined || last.length === limit) acc.push([row]);
    else last.push(row);
    return acc;
  }, []);
  return { data: pages[page - 1] ?? [], total: rows.length, page, limit };
}

/** `?page=` / `?limit=`, defaulted and capped. A caller asking for 10 000 rows
 *  gets MAX_LIMIT, silently, exactly as the store's own `list` does. */
function pageOf(query: Record<string, string | string[]>): { page: number; limit: number } {
  const one = (key: string): string | undefined => {
    const raw = query[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const asCount = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || !/^\d{1,4}$/.test(raw)) return fallback;
    // oxlint-disable-next-line agency/no-numeric-coercion -- a page index pinned to /^\d{1,4}$/; there is no decimal point in it and 9999 is exact.
    const value = Number(raw);
    return value === 0 ? fallback : value;
  };
  return {
    page: asCount(one('page'), 1),
    limit: Math.min(asCount(one('limit'), 20), MAX_LIMIT),
  };
}

/**
 * A FACTORY, not a module-scope store. One store per call means the wire-golden
 * test and any future test can each have their own, so no test can observe
 * another one's writes. In the app there is exactly one call, at the bottom of
 * this file, so a mock has one store per page load and "reset demo data" is a
 * reload.
 *
 * THREE STORES, AND THEIR ORDER IS FORCED. Ids are store-assigned (HARD RULE 4),
 * so the fleet must exist before a driver can name a `truck_id` and both must
 * exist before an event can name either. Reading the assigned ids back out is
 * the same discipline the wire golden uses for exactly the same reason: a
 * literal `truck-000001` here would be this allocator's output baked into a
 * seed, and the product assigns UUIDs.
 */
export function makeHandlers() {
  const trucks = createStore<Truck>('truck', buildFleet());
  const fleet = trucks.list({ page: 1, limit: MAX_LIMIT }).data;

  const drivers = createStore<Driver>('driver', buildCrew(fleet));
  const crew = drivers.list({ page: 1, limit: MAX_LIMIT }).data;

  const events = createStore<DriverEvent>('event', buildSeed(fleet, crew));

  const all = (): DriverEvent[] => events.list({ page: 1, limit: MAX_LIMIT }).data;
  const allTrucks = (): Truck[] => trucks.list({ page: 1, limit: MAX_LIMIT }).data;

  /**
   * THE BOUND DRIVER. In production this comes from the opaque token the office
   * SMS'd once, exchanged for a device credential that never expires — there is
   * no login screen, no password field and no logout button anywhere in the
   * product, because a driver shown a password field stops using the app that
   * day. In the mock it is simply the first of the crew, which is the same
   * claim with the authentication removed.
   */
  const bound = (): Driver => {
    const driver = crew[0];
    if (!driver) throw new Error('routes: the seed must carry at least one driver');
    return driver;
  };

  const truckOf = (id: string): Truck | undefined => trucks.get(id);

  /** The last reading this truck reported, or the office's own figure if it has
   *  never reported one. This is what makes the odometer screen ONE TAP. */
  const lastReading = (truckId: string): number | null => {
    const mine = all().filter((event) => event.truck_id === truckId);
    return mine.at(-1)?.odometer_km ?? truckOf(truckId)?.odometer_km ?? null;
  };

  return {
    me: () => {
      const driver = bound();
      const truck = truckOf(driver.truck_id);
      if (!truck) throw new Error('routes: the bound driver has no truck');
      const mine = all().filter((event) => event.driver_id === driver.id);
      return {
        driver_name: driver.name,
        plate: truck.plate,
        truck_id: truck.id,
        model: truck.model,
        has_can: truck.has_can,
        odometer_km: lastReading(truck.id) ?? truck.odometer_km,
        today: mine.filter((event) => event.occurred_at.startsWith(TODAY)).length,
        /* The status strip's second number. In the real product this counts rows
           sitting in IndexedDB with no server ACK; here nothing is ever offline,
           so it counts what the office has not yet read — which is the same
           reassurance from the other end of the wire. */
        queued: mine.filter((event) => event.confirmed_at === null).length,
      };
    },

    overview: (c) => overview(c.now, all(), legsOf(all(), allTrucks())),

    listEvents: (c) => {
      const { page, limit } = pageOf(c.query);
      const pending = c.query['pending'] === '1';
      const rows = all().filter((event) => !pending || event.confirmed_at === null);
      /* Newest first: a dispatcher works the top of the queue and a driver looks
         at what he just sent. `reverse` on a copy, never a comparator — the rows
         are already in creation order and re-sorting them would be asserting an
         ordering the store already guarantees. */
      return paginate([...rows].reverse(), page, limit);
    },

    submitEvent: (c) => {
      const bad = invalidOdometer(c.body.odometer_km);
      if (bad) fail('submitEvent', bad.code, bad.message, bad.ctx);

      const wrongPhoto = photoMismatch(c.body.kind, c.body.photo_kind);
      if (wrongPhoto) fail('submitEvent', wrongPhoto.code, wrongPhoto.message, wrongPhoto.ctx);

      const missing = unknownTruck(allTrucks(), c.body.truck_id);
      if (missing) fail('submitEvent', missing.code, missing.message, missing.ctx);

      const truck = truckOf(c.body.truck_id);
      if (!truck) fail('submitEvent', 'TRUCK_NOT_FOUND', 'Такої машини немає', {});

      const driver = bound();
      const reading = kilometres(c.body.odometer_km);
      const previous = lastReading(truck.id);

      const row = events.create({
        kind: c.body.kind,
        driver_id: driver.id,
        driver_name: driver.name,
        truck_id: truck.id,
        plate: truck.plate,
        /* Server-derived, never accepted from the body: a timestamp a client can
           name is a timestamp a client can forge. */
        occurred_at: asInstant(c.now),
        place: c.body.place,
        odometer_km: reading,
        odometer_source: c.body.odometer_source,
        photo_kind: c.body.photo_kind,
        /* NULL, always, and this is the product rather than an omission. The
           driver is never asked for the number — it is 8–12 keystrokes from a
           man holding the document with one hand. The dispatcher supplies it
           through `confirmEvent`, reading it off the photograph. */
        ttn_number: null,
        ttn_source: null,
        litres: null,
        amount_uah: null,
        confirmed_at: null,
        flags: flagsFor(reading, previous, null),
        sync: 'SENT',
      });

      /* The truck's own figure only ever moves FORWARD. A dropped digit is
         stored on the event and flagged for the office, but it must not become
         the pre-fill the next screen offers — that would turn one typo into
         every subsequent reading being wrong, and the flag would stop firing
         because the new baseline agrees with it. */
      if (previous === null || Math.sign(reading - previous) === 1) {
        trucks.update(truck.id, { odometer_km: reading });
      }

      return row;
    },

    getEvent: (c) => {
      const row = events.get(c.params.id);
      if (!row) fail('getEvent', 'EVENT_NOT_FOUND', 'Такої події немає', { id: c.params.id });
      return row;
    },

    confirmEvent: (c) => {
      const row = events.get(c.params.id);
      if (!row) fail('confirmEvent', 'EVENT_NOT_FOUND', 'Такої події немає', { id: c.params.id });

      const done = alreadyConfirmed(row);
      if (done) fail('confirmEvent', done.code, done.message, done.ctx);

      const blank = blankTtn(c.body.ttn_number);
      if (blank) fail('confirmEvent', blank.code, blank.message, blank.ctx);

      const taken = duplicateTtn(all(), c.body.ttn_number, row.id);
      if (taken) fail('confirmEvent', taken.code, taken.message, taken.ctx);

      const updated = events.update(row.id, {
        ttn_number: c.body.ttn_number,
        /* OFFICE, not OCR. The mock does not run an optical reader and must not
           claim one: Motive and Transflo ship exactly this and it is the right
           roadmap item, but a fingerprint that said OCR here would be the demo
           asserting a capability nobody has measured on a crumpled carbon copy
           from a feed mill. */
        ttn_source: 'OFFICE',
        confirmed_at: asInstant(c.now),
        flags: flagsFor(row.odometer_km, null, c.body.ttn_number).concat(
          row.flags.filter((flag) => flag !== 'NO_TTN_NUMBER'),
        ),
      });
      if (!updated) fail('confirmEvent', 'EVENT_NOT_FOUND', 'Такої події немає', { id: row.id });
      return updated;
    },

    listLegs: (c) => {
      const { page, limit } = pageOf(c.query);
      return paginate([...legsOf(all(), allTrucks())].reverse(), page, limit);
    },

    exportWaybill: (c) => waybillOf(c.now, legsOf(all(), allTrucks())),
  } satisfies HandlersOf<Api>;
}

/**
 * The demo's "today". A literal rather than a clock read, so the seeded counters
 * on the driver's home screen say the same thing on the day of the call as they
 * did while this was written — a demo whose numbers change overnight is a demo
 * that has to be rehearsed twice.
 */
const TODAY = '2026-09-16';

/**
 * THE CHECK SITE. One table, derived from the same literal the call sites are
 * typed against — and the single place exactness is checked. A handler returning
 * MORE than its operation declares is a compile error HERE, and the diagnostic
 * names the operation. Scaffolder-written; never edited.
 */
export const routes: Route[] = toRoutes(makeHandlers());
