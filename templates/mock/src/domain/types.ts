import type { Decimal2, Instant } from '@agency/mock';

/**
 * The per-client part of a mock is these four files — types, seed, rules, calc —
 * and `src/api/contract.ts`. Everything else in the scaffold is the same in
 * every mock the agency ships. Replace this file first.
 *
 * WIRE CASING IS snake_case, because that is what the Nest backend emits and a
 * mock that renames fields is a mock whose components have to be edited at
 * conversion. `created_at` is deliberately MULTI-WORD: a casing convention that
 * only ever meets single-word fields is a convention nothing can exercise, and
 * the wire golden fingerprints the key names, so a drift to `createdAt` is red.
 */
export type Party = {
  id: string;
  name: string;
  company: string;
  address: string;
  /** A canonical decimal string. Never a number: numeric(12,2) does not
   *  round-trip through a float, and the demo is about the numbers. */
  balance: Decimal2;
  /** ISO-8601 Z, server-derived. Never accepted in a request body. */
  created_at: Instant;
};

/**
 * What a create request may carry. `id` and `created_at` are absent BY TYPE,
 * not by convention: ids are store-assigned (HARD RULE 4) and a server-derived
 * timestamp a client could name is a timestamp a client could forge.
 */
export type CreateParty = {
  name: string;
  company: string;
  address: string;
  balance: string;
};

/** A PATCH carries only what may change. */
export type RenameParty = { name: string };

export type Overview = {
  headline: string;
  /** ISO-8601 Z, server-derived. */
  generated_at: Instant;
  total: Decimal2;
  rows: number;
};
