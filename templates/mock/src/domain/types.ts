import type { Decimal2, Instant } from '@agency/mock';

/**
 * The per-client part of a mock is these three files — types, seed, calc — and
 * `src/api/routes.ts`. Everything else in the scaffold is the same in every
 * mock the agency ships. Replace this file first.
 *
 * Wire casing is snake_case, because that is what the Nest backend emits and a
 * mock that renames fields is a mock whose components have to be edited at
 * conversion.
 */
export type Party = {
  id: string;
  name: string;
  company: string;
  address: string;
  /** A canonical decimal string. Never a number: numeric(12,2) does not
   *  round-trip through a float, and the demo is about the numbers. */
  balance: Decimal2;
};

export type Overview = {
  headline: string;
  /** ISO-8601 Z, server-derived. */
  generated_at: Instant;
  total: Decimal2;
  rows: number;
  parties: Party[];
};
