/**
 * The five-verb store, as a FACTORY.
 *
 * The lab's stores were module-scope, so a POST in one test was visible to every
 * later test in the file. Measured with the lab still on disk; it has since been
 * deleted, so the command below is a record rather than a step to run:
 *   vitest run packages/mock/src/lab --sequence.shuffle.tests --sequence.seed=99
 *   -> 2 failed | 36 passed   (`total` was 5 where the test expected 4)
 * A suite whose result depends on declaration order is a suite that cannot be
 * trusted to have tested what it claims. Every test here mints its own store.
 */
import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { asDecimal2, type Decimal2 } from './types';
import { MAX_LIMIT } from './query';

type Row = { id: string; name: string; balance: Decimal2 };

const SEED: readonly Omit<Row, 'id'>[] = [
  { name: 'Anna Albrecht', balance: asDecimal2('12480.00') },
  { name: 'Bernd Cordes', balance: asDecimal2('3195.50') },
  { name: 'Claudia Dreher', balance: asDecimal2('840.25') },
  { name: 'Dieter Engel', balance: asDecimal2('27310.75') },
];

const seeded = () => createStore<Row>('party', SEED);

describe('a store is per-caller, so no test can observe another one writes', () => {
  it('gives two stores independent rows AND independent allocators', () => {
    const a = seeded();
    const b = seeded();
    a.create({ name: 'Elke Fischer', balance: asDecimal2('96.20') });
    expect(a.list({ page: 1, limit: 99 }).total).toBe(5);
    expect(b.list({ page: 1, limit: 99 }).total).toBe(4);
    expect(b.create({ name: 'Frank Gerber', balance: asDecimal2('1.00') }).id).toBe('party-000005');
  });
});

describe('ids are store-assigned and totally ordered (HARD RULE 4)', () => {
  it('assigns zero-padded sequential ids so lexicographic order is creation order', () => {
    expect(seeded().list({ page: 1, limit: 10 }).data.map((r) => r.id)).toEqual([
      'party-000001', 'party-000002', 'party-000003', 'party-000004',
    ]);
  });

  it('never collides a created id with a seeded one', () => {
    const store = seeded();
    expect(store.create({ name: 'Elke Fischer', balance: asDecimal2('96.20') }).id).toBe('party-000005');
    const ids = store.list({ page: 1, limit: 99 }).data.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('list returns the canonical envelope (HARD RULE 5), with CLAMPED values', () => {
  it('is { data, total, page, limit } — never { items, total }', () => {
    expect(Object.keys(seeded().list({ page: 1, limit: 2 })).sort((a, b) => a.localeCompare(b)))
      .toEqual(['data', 'limit', 'page', 'total']);
  });

  it('pages without losing the total', () => {
    const page2 = seeded().list({ page: 2, limit: 3 });
    expect(page2.data.map((r) => r.name)).toEqual(['Dieter Engel']);
    expect(page2).toMatchObject({ total: 4, page: 2, limit: 3 });
  });

  it('returns an empty page rather than throwing past the end', () => {
    expect(seeded().list({ page: 9, limit: 3 })).toMatchObject({ data: [], total: 4 });
  });

  it('ECHOES THE CLAMPED page and limit, never the numbers it was handed', () => {
    // The defect this pins: a client renders `limit` from the envelope, so an
    // echo the store did not use is a wrong number on screen.
    expect(seeded().list({ page: -3, limit: -1 })).toMatchObject({ page: 1, limit: 1, total: 4 });
    expect(seeded().list({ page: 0, limit: 99999 }).limit).toBe(MAX_LIMIT);
  });

  it('reads in store-assigned id order, never insertion-hash order', () => {
    const store = seeded();
    store.create({ name: 'Zora Winkler', balance: asDecimal2('1.00') });
    expect(store.list({ page: 1, limit: 99 }).data.at(-1)?.name).toBe('Zora Winkler');
  });
});

describe('the other four verbs — update and remove now have call sites', () => {
  it('get returns the row, and undefined for an unknown id', () => {
    const store = seeded();
    expect(store.get('party-000002')?.name).toBe('Bernd Cordes');
    expect(store.get('party-999999')).toBeUndefined();
  });

  it('update patches in place, keeps the id and keeps the position', () => {
    const store = seeded();
    const updated = store.update('party-000001', { name: 'Anna Albrecht-Neumann' });
    expect(updated?.id).toBe('party-000001');
    expect(updated?.balance).toBe('12480.00');
    expect(store.list({ page: 1, limit: 99 }).data[0]?.id).toBe('party-000001');
  });

  it('refuses to let a patch forge an id', () => {
    const store = seeded();
    const forged = { id: 'party-999999', name: 'X' } as Partial<Omit<Row, 'id'>>;
    expect(store.update('party-000001', forged)?.id).toBe('party-000001');
    expect(store.get('party-999999')).toBeUndefined();
  });

  it('update returns undefined for an unknown id rather than creating one', () => {
    const store = seeded();
    expect(store.update('party-999999', { name: 'Ghost' })).toBeUndefined();
    expect(store.list({ page: 1, limit: 99 }).total).toBe(4);
  });

  it('remove deletes and reports whether anything was there', () => {
    const store = seeded();
    expect(store.remove('party-000002')).toBe(true);
    expect(store.remove('party-000002')).toBe(false);
    expect(store.list({ page: 1, limit: 99 }).total).toBe(3);
  });
});

describe('the store holds rows and nothing else', () => {
  it('has exactly five verbs — a sixth is SPEC 17 day-14 kill-trigger territory', () => {
    expect(Object.keys(seeded()).sort((a, b) => a.localeCompare(b)))
      .toEqual(['create', 'get', 'list', 'remove', 'update']);
  });

  it('does not validate, so a refusal stays the handler job and can carry a code', () => {
    expect(seeded().create({ name: 'Anna Albrecht', balance: asDecimal2('1.00') }).id).toBe('party-000005');
  });
});
