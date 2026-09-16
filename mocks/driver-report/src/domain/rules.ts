/**
 * The domain's refusals — and, separately, its FLAGS. The distinction is the
 * single most important design decision in this product.
 *
 * A REFUSAL has a declared code, stops the write and shows the driver a
 * sentence. A FLAG is computed, stored, shown to the office and to nobody else,
 * and blocks nothing at all. The industry answer to a wrong-place or wrong-order
 * report is warn-record-never-block: Detrack pops a geofence warning the driver
 * may ignore, Samsara logs an out-of-sequence arrival to an audit trail and lets
 * him through. Blocking a man at a silo gate at 21:00 gets you a telephone call
 * and a return to paper, which is how this client's two previous attempts died.
 *
 * So a malformed odometer is refused — there is no number to store. An odometer
 * that went BACKWARDS is flagged — there is a number, it is probably a dropped
 * digit, and the office can see both it and the photograph.
 *
 * Everything here is a PURE FUNCTION over row snapshots: nothing touches a
 * store, a request or a Nest context. That is what makes a handler body a move
 * rather than a rewrite at conversion — the same function called from a Nest
 * service with rows from TypeORM instead of rows from the in-memory store.
 *
 * A rule RETURNS its refusal rather than throwing one. Throwing would mean
 * importing `fail()` from `src/api/`, and the domain must not depend on the
 * transport. The returned `code` is checked against the operation's declared set
 * at the call site, so a rule inventing a code is a compile error there.
 */
import type { EventFlag, EventKind, PhotoKind } from './types';

export type Refusal<Code extends string> = {
  code: Code;
  message: string;
  /** Spread into the error envelope beside `code`, as the product's filter does. */
  ctx: Record<string, unknown>;
};

/** The snapshots the rules need — never the whole row. */
export type TruckRow = { id: string; plate: string };
export type TtnRow = { id: string; ttn_number: string | null };
export type ConfirmedRow = { confirmed_at: string | null };

/**
 * `a > b` for INTEGER kilometres, without the relational operator the money
 * rules ban in `src/domain`.
 *
 * `agency/no-decimal-comparison` exists because `'9.00' > '10.00'` is true —
 * relational operators on decimal strings are lexicographic. That hazard cannot
 * arise here: an odometer is a count of whole kilometres held as a `number`, and
 * `invalidOdometer` has already refused anything but `/^\d{1,7}$/`. Writing the
 * comparison through `Math.sign` says so at the call site rather than asking a
 * reader to trust a disable directive, and it keeps the rule switched ON for
 * every other line in this file.
 */
const exceeds = (a: number, b: number): boolean => Math.sign(a - b) === 1;

/**
 * An odometer reading is digits and nothing else — no decimal point, no space,
 * no sign, and at most seven of them.
 *
 * Seven is not arbitrary: it is what a truck's cluster can display, and it is
 * also the ceiling that keeps every reading exactly representable, so the one
 * coercion in `src/api/routes.ts` is lossless by construction rather than by
 * hope. `'412 348'` is refused deliberately — a driver typing the separator he
 * sees printed on the cluster is the commonest input error, and a rule that
 * silently stripped it would be guessing at what he meant.
 */
const ODOMETER = /^\d{1,7}$/;

export function invalidOdometer(raw: string): Refusal<'ODOMETER_INVALID'> | undefined {
  if (ODOMETER.test(raw)) return undefined;
  return {
    code: 'ODOMETER_INVALID',
    message: `Показник спідометра — це цілі кілометри, від 1 до 7 цифр. Прийшло ${JSON.stringify(raw)}`,
    ctx: { field: 'odometer_km' },
  };
}

/**
 * The artefact must match the event.
 *
 * п.11.3–11.5 Правил №363 issues the ТТН in THREE copies and the driver signs
 * all three. The one photographed at unloading is примірник 3 — certified by the
 * consignee's signature and stamp — and it is the copy that proves delivery and
 * unlocks payment. Without this rule the flow would happily collect two pictures
 * of the same unsigned sheet and nobody would notice until an invoice was
 * queried.
 *
 * DASH is absent from the map on purpose: a dashboard photo is the odometer
 * step's artefact, never the event's.
 */
const EXPECTED: Readonly<Record<EventKind, PhotoKind>> = {
  LOADING: 'TTN',
  UNLOADING: 'TTN_SIGNED',
  REFUEL: 'FUEL_RECEIPT',
};

const SAYS_PHOTO: Readonly<Record<EventKind, string>> = {
  LOADING: 'На завантаженні фотографують ТТН',
  UNLOADING: 'На вивантаженні фотографують ТТН з підписом і печаткою вантажоодержувача',
  REFUEL: 'На заправці фотографують чек',
};

export function photoMismatch(
  kind: EventKind,
  photo: PhotoKind,
): Refusal<'PHOTO_WRONG_KIND'> | undefined {
  if (EXPECTED[kind] === photo) return undefined;
  return {
    code: 'PHOTO_WRONG_KIND',
    message: SAYS_PHOTO[kind],
    ctx: { field: 'photo_kind', expected: EXPECTED[kind] },
  };
}

export function unknownTruck(
  snapshot: readonly TruckRow[],
  truckId: string,
): Refusal<'TRUCK_NOT_FOUND'> | undefined {
  if (snapshot.some((row) => row.id === truckId)) return undefined;
  return {
    code: 'TRUCK_NOT_FOUND',
    message: 'Такої машини немає в автопарку',
    ctx: { truck_id: truckId },
  };
}

/**
 * A ТТН number a human typed. Trimmed emptiness is the case a required-field
 * check misses, because `'   '` is a non-empty string.
 */
export function blankTtn(raw: string): Refusal<'TTN_BLANK'> | undefined {
  if (raw.trim() !== '') return undefined;
  return { code: 'TTN_BLANK', message: 'Номер ТТН порожній', ctx: { field: 'ttn_number' } };
}

/**
 * One ТТН number belongs to one event.
 *
 * `exceptId` is what makes this reusable for a correction: re-confirming a row
 * must not collide with ITSELF. Leaving it out is the classic version of this
 * bug — the first confirmation succeeds and every later save of the same row is
 * refused. A `null` number is not a collision: it is every event's state at
 * capture, because the driver is never asked for the number.
 */
export function duplicateTtn(
  snapshot: readonly TtnRow[],
  ttn: string,
  exceptId?: string,
): Refusal<'TTN_DUPLICATE'> | undefined {
  const taken = snapshot.some((row) => row.ttn_number === ttn && row.id !== exceptId);
  if (!taken) return undefined;
  return {
    code: 'TTN_DUPLICATE',
    message: `ТТН №${ttn} вже записана на іншу подію`,
    ctx: { field: 'ttn_number' },
  };
}

export function alreadyConfirmed(
  row: ConfirmedRow,
): Refusal<'EVENT_ALREADY_CONFIRMED'> | undefined {
  if (row.confirmed_at === null) return undefined;
  return {
    code: 'EVENT_ALREADY_CONFIRMED',
    message: 'Цю подію вже підтвердили',
    ctx: { confirmed_at: row.confirmed_at },
  };
}

/**
 * The largest plausible distance between two consecutive reports on one truck.
 *
 * A round trip Запоріжжя–Вільнянськ and back is under 100 km; a domestic run to
 * Львів and back is about 1 800 km but would carry a refuel report in between.
 * 1 500 is a smoke alarm, not a gate — the boundary is INCLUSIVE, so a leg
 * exactly at the threshold is ordinary and nothing is flagged.
 */
export const MAX_JUMP_KM = 1500;

/**
 * WHAT THE OFFICE SEES AND THE DRIVER NEVER DOES. Returns flags; refuses
 * nothing; cannot fail.
 *
 * `previous === null` is a truck with no history — its first ever event — and
 * that is ordinary rather than suspicious.
 *
 * NO_TTN_NUMBER is on almost every event at capture and that is the product
 * working, not an error: the driver is never asked for the number, and the
 * dispatcher clears the flag by reading one number off a photograph she is
 * already looking at. It is a work queue, spelled as a flag.
 */
export function flagsFor(
  reading: number,
  previous: number | null,
  ttn: string | null,
): readonly EventFlag[] {
  const flags: EventFlag[] = [];

  if (previous !== null) {
    if (exceeds(previous, reading)) flags.push('ODOMETER_BACKWARDS');
    else if (exceeds(reading - previous, MAX_JUMP_KM)) flags.push('ODOMETER_JUMP');
  }

  if (ttn === null) flags.push('NO_TTN_NUMBER');

  return flags;
}
