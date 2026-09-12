import { asDecimal2, asInstant, type Instant } from '@agency/mock';
import { createStream, type Locale } from '@agency/synth';
import type { Party } from './types';

/** One number pins the whole demo. Change it and every name, company and
 *  address below changes together, reproducibly, on every machine. */
export const SEED = 20260909;

/** Set by `agency new --locale`. Drives the corpus and <html lang>. */
export const LOCALE = '{{locale}}' as Locale;

/**
 * Balances are literal decimal strings picked from a table, never computed from
 * an index. Two reasons: a demo balance should look like a balance a bookkeeper
 * typed, and `(i + 1) * 100` is a float multiplication the workspace lint rules
 * reject on sight.
 */
const BALANCES = [
  '12480.00', '3195.50', '840.25', '27310.75', '96.20', '5402.00',
  '18.40', '7734.60', '2260.00', '431.15', '15890.30', '673.05',
];

/**
 * Creation timestamps, as LITERALS for the same reason the balances are: an
 * offset computed from an index is arithmetic, and a date computed from the
 * clock makes the demo clock-dependent. One per balance, ascending, so
 * `created_at` order matches store-assigned id order and a client sorting by
 * either sees the same list.
 */
const CREATED_AT = [
  '2025-11-03T09:12:00.000Z', '2025-11-14T13:40:00.000Z', '2025-12-02T08:05:00.000Z',
  '2025-12-19T15:22:00.000Z', '2026-01-08T10:33:00.000Z', '2026-01-27T11:47:00.000Z',
  '2026-02-11T14:09:00.000Z', '2026-03-04T09:58:00.000Z', '2026-03-23T16:15:00.000Z',
  '2026-04-09T08:41:00.000Z', '2026-05-06T12:26:00.000Z', '2026-06-01T10:02:00.000Z',
];

/**
 * The seed rows WITHOUT ids. The store assigns them, from one allocator it mints
 * once — which is the fix for the measured defect where `buildSeed()` minted a
 * new `createSeq('party')` on every call, so two calls both emitted
 * 'party-000001' and a created row collided with a seeded one.
 */
export function buildSeed(): readonly Omit<Party, 'id'>[] {
  const stream = createStream(SEED);

  return BALANCES.map((balance, index) => ({
    name: stream.person(LOCALE),
    company: stream.company(LOCALE),
    address: stream.address(LOCALE),
    balance: asDecimal2(balance),
    created_at: createdAt(index),
  }));
}

/** Reads the table, and refuses to run off the end of it rather than emitting
 *  an `undefined` that `asInstant` would reject much later. */
function createdAt(index: number): Instant {
  const raw = CREATED_AT[index];
  if (raw === undefined) {
    throw new Error(`seed: no created_at for row ${index} — CREATED_AT is shorter than BALANCES`);
  }
  return asInstant(raw);
}
