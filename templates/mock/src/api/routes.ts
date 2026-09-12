/**
 * THE IMPLEMENTATION SIDE. `HandlersOf<Api, Io>` is a mapped type over the
 * contract, so a declared operation with no handler is an error naming the
 * missing key, and a handler returning the wrong shape is an error naming the
 * missing fields.
 *
 * Each handler body is the future Nest controller body — same inputs, same
 * envelope, same status codes — so a converted endpoint is a move, not a
 * rewrite. The refusals it performs live in `src/domain/rules.ts` as pure
 * functions over row snapshots, which is the half that moves into a service.
 */
import {
  createStore,
  pageQuery,
  wire,
  MAX_LIMIT,
  asDecimal2,
  asInstant,
  type HandlersOf,
  type Route,
} from '@agency/mock';
import { fail, toRoutes, type Api, type Io } from './contract';
import { overview } from '../domain/calc';
import { blankName, duplicateName, invalidBalance, type PartyNameRow } from '../domain/rules';
import { buildSeed } from '../domain/seed';
import type { Party } from '../domain/types';

/**
 * A FACTORY, not a module-scope store. One store per call means the wire-golden
 * test and any future test can each have their own, so no test can observe
 * another one's writes — the defect that made the contract lab's suite green in
 * declaration order only (`--sequence.shuffle.tests` turned it red).
 *
 * In the app there is exactly one call, below, so a mock still has one store per
 * page load. Nothing is persisted: "reset demo data" is a reload (SPEC 7).
 */
export function makeHandlers(): HandlersOf<Api, Io> {
  const parties = createStore<Party>('party', buildSeed());

  /**
   * The snapshot the domain rules take. Capped at the limit the store will
   * actually honour — the lab wrote `list({ page: 1, limit: 9999 })`, which
   * clamps silently, and naming the cap is the difference between a limit you
   * chose and one you did not notice. A demo book is a few dozen rows; a mock
   * that outgrows MAX_LIMIT needs a real query, not a bigger number here.
   */
  const book = (): PartyNameRow[] =>
    parties.list({ page: 1, limit: MAX_LIMIT }).data.map((p) => ({ id: p.id, name: p.name }));

  return {
    overview: (c) => wire(overview(c.now, parties.list({ page: 1, limit: MAX_LIMIT }).data)),

    listParties: (c) => wire(parties.list(pageQuery(c.query))),

    getParty: (c) => {
      const row = parties.get(c.params.id);
      if (!row) fail('getParty', 404, 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
      return wire(row);
    },

    createParty: (c) => {
      const blank = blankName(c.body.name);
      if (blank) fail('createParty', 400, blank.code, blank.message, blank.ctx);

      const bad = invalidBalance(c.body.balance);
      if (bad) fail('createParty', 400, bad.code, bad.message, bad.ctx);

      const taken = duplicateName(book(), c.body.name);
      if (taken) fail('createParty', 409, taken.code, taken.message, taken.ctx);

      // The handler brands the money, not the store: `balance` arrives off the
      // wire as a plain string and `asDecimal2` ASSERTS rather than coerces.
      // `created_at` is server-derived from the request instant, never accepted
      // from the body — a timestamp a client can name is one it can forge.
      return wire(
        parties.create({
          name: c.body.name,
          company: c.body.company,
          address: c.body.address,
          balance: asDecimal2(c.body.balance),
          created_at: asInstant(c.now),
        }),
      );
    },

    renameParty: (c) => {
      if (!parties.get(c.params.id)) {
        fail('renameParty', 404, 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
      }

      const blank = blankName(c.body.name);
      if (blank) fail('renameParty', 400, blank.code, blank.message, blank.ctx);

      // `exceptId` is what lets a row keep its own name. Without it the first
      // rename succeeds and every later save of the same row is refused.
      const taken = duplicateName(book(), c.body.name, c.params.id);
      if (taken) fail('renameParty', 409, taken.code, taken.message, taken.ctx);

      const updated = parties.update(c.params.id, { name: c.body.name });
      if (!updated) fail('renameParty', 404, 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
      return wire(updated);
    },

    /** 204, and therefore NOTHING returned. A `null` here would put the literal
     *  JSON `null` on a 204, which no Nest 204 ever carries. */
    removeParty: (c) => {
      if (!parties.remove(c.params.id)) {
        fail('removeParty', 404, 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
      }
    },
  };
}

/** One table, derived from the same literal the call sites are typed against. */
export const routes: Route[] = toRoutes(makeHandlers());
