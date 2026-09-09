import { asDecimal2, createSeq } from '@agency/mock';
import { createStream, type Locale } from '@agency/synth';
import type { Party } from './types';

/** One number pins the whole demo. Change it and every name, company and
 *  balance below changes together, reproducibly, on every machine. */
export const SEED = 20260909;

/** Set by `agency new --locale`. Drives the corpus and <html lang>. */
export const LOCALE = '{{locale}}' as Locale;

/**
 * Balances are literal decimal strings picked from a table, never computed
 * from an index. Two reasons: a demo balance should look like a balance a
 * bookkeeper typed, and `(i + 1) * 100` is a float multiplication that the
 * workspace lint rules reject on sight.
 */
const BALANCES = [
  '12480.00', '3195.50', '840.25', '27310.75', '96.20', '5402.00',
  '18.40', '7734.60', '2260.00', '431.15', '15890.30', '673.05',
];

export function buildSeed(): { parties: Party[] } {
  const stream = createStream(SEED);
  // Store-assigned, zero-padded, monotonic: lexicographic order equals creation
  // order, which a SQL `ORDER BY id` reproduces and Math.random() does not.
  const nextId = createSeq('party');

  const parties: Party[] = BALANCES.map((balance) => ({
    id: nextId(),
    name: stream.person(LOCALE),
    company: stream.company(LOCALE),
    address: stream.address(LOCALE),
    balance: asDecimal2(balance),
  }));

  return { parties };
}
