/**
 * The smallest thing a POST can land in. Five verbs, in-memory, NOT persisted.
 *
 * WHY IT EXISTS. `templates/mock/src/domain/calc.ts` called `buildSeed()` on
 * every request, so nothing a POST did survived into the next GET — a clickable
 * CRM demo could not show a record being created. Measured in the two real
 * mocks: 4 of logistic's 8 demo screens and both of yagoda's uncuttable steps
 * are the client watching a record be created, changed or refused.
 *
 * WHY IT IS NOT PERSISTENCE. SPEC 7 rejects persisting domain rows and the
 * `origin: 'seed' | 'user'` partition. Every hazard it names — the
 * `migrate: () => undefined` wipe, the quota ceiling, dangling user->seed ids,
 * FIFO composition — is a property of PERSISTENCE, not of mutability. This
 * store dies with the page, so "reset demo data" is still a reload.
 *
 * WHY IT IS A FACTORY, not a module-scope singleton. The lab's stores were
 * module-scope and its suite was green in declaration order only. Measured
 * BEFORE the lab was deleted — that directory no longer exists, so this command
 * is a record, not a step to run:
 *   vitest run packages/mock/src/lab --sequence.shuffle.tests --sequence.seed=99
 *   -> 2 failed | 36 passed
 * A suite whose result depends on the order its tests happen to run in has not
 * established what it claims. Callers mint one store per test, and a mock mints
 * one per page load.
 *
 * WHY IT STAYS AT FIVE VERBS. SPEC 17's day-14 kill trigger is "a handler needs
 * logic a Nest controller would not contain". A store that grows domain commands
 * is that trigger wearing a helpful face: yagoda's 456-line `ports.ts` over a
 * 1,488-line store is what the failure looks like. `store.test.ts` asserts the
 * verb count, so a sixth verb is a red test rather than a judgement call.
 *
 * It does NOT validate. A refusal is the handler's job, because the refusal is
 * what carries a `code` and what moves into the Nest service at conversion.
 */
import { createSeq, type Paginated } from './types';
import { clampPage, type PageQuery } from './query';

export type Store<Row extends { id: string }> = {
  list(q: PageQuery): Paginated<Row>;
  get(id: string): Row | undefined;
  create(input: Omit<Row, 'id'>): Row;
  update(id: string, patch: Partial<Omit<Row, 'id'>>): Row | undefined;
  remove(id: string): boolean;
};

export function createStore<Row extends { id: string }>(
  prefix: string,
  seed: readonly Omit<Row, 'id'>[],
): Store<Row> {
  /**
   * ONE allocator per store, minted HERE and never inside a seed function.
   * `buildSeed()` minted a new `createSeq('party')` on every call, so two calls
   * both emitted 'party-000001' and a created row collided with a seeded one.
   */
  const nextId = createSeq(prefix);

  /**
   * A Map, not an array: insertion order IS creation order because ids are
   * sequential, `set` on an existing key keeps its position (so `update` cannot
   * reorder the list), and `get` is by key rather than by a scan whose
   * comparator the ordering rules would have opinions about.
   */
  const rows = new Map<string, Row>();

  const add = (input: Omit<Row, 'id'>): Row => {
    const row = { ...input, id: nextId() } as Row;
    rows.set(row.id, row);
    return row;
  };

  for (const row of seed) add(row);

  return {
    list(q) {
      // Clamped HERE as well as in pageQuery, through the same function, so a
      // caller that built a PageQuery by hand cannot make the envelope lie.
      const { page, limit } = clampPage(q.page, q.limit);
      const all = [...rows.values()];
      // oxlint-disable-next-line agency/no-float-arithmetic -- an integer row OFFSET from two already-clamped integers, never money.
      const start = (page - 1) * limit;
      return { data: all.slice(start, start + limit), total: all.length, page, limit };
    },

    get(id) {
      return rows.get(id);
    },

    create(input) {
      return add(input);
    },

    update(id, patch) {
      const row = rows.get(id);
      if (!row) return undefined;
      // id LAST, so a patch carrying one cannot forge it.
      const next = { ...row, ...patch, id: row.id };
      rows.set(id, next);
      return next;
    },

    remove(id) {
      return rows.delete(id);
    },
  };
}
