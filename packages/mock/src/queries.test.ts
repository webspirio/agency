import { describe, expect, it } from 'vitest';
import axios from 'axios';
import { makeContract, op, transport } from './contract';
import { makeQueries } from './queries';
import type { Paginated } from './types';

type Party = { id: string; name: string };

const api = {
  listParties: op<void, Paginated<Party>, { page?: string; limit?: string }>()({
    method: 'GET', path: '/parties', status: 200, caps: [], codes: {},
  }),
  getParty: op<void, Party>()({
    method: 'GET', path: '/parties/:id', status: 200, caps: [], codes: { PARTY_NOT_FOUND: 404 },
  }),
  createParty: op<{ name: string }, Party>()({
    method: 'POST', path: '/parties', status: 201, caps: [], codes: { PARTY_NAME_TAKEN: 409 },
  }),
};
type Api = typeof api;

const q = makeQueries(makeContract<Api>(api), transport(axios.create()));

/**
 * The screens hand-wrote `queryKey: ['parties', page]` for an operation named
 * `listParties`, and `invalidateQueries({ queryKey: ['parties'] })` beside it. Two
 * declarations that have to agree, which is the exact shape the contract removes one
 * layer down — and a rename of the operation would not have moved either string.
 */
describe('makeQueries derives the cache key from the operation, never from a string', () => {
  it('puts the operation NAME first, so two operations cannot collide', () => {
    expect(q.keyOf('getParty', { params: { id: 'p1' }, body: undefined })[0]).toBe('getParty');
    expect(q.keyOf('listParties', { params: {}, body: undefined })[0]).toBe('listParties');
  });

  it('includes the params and the query, so two pages are two entries', () => {
    const a = q.keyOf('listParties', { params: {}, body: undefined, qry: { page: '1' } });
    const b = q.keyOf('listParties', { params: {}, body: undefined, qry: { page: '2' } });
    expect(a).not.toEqual(b);
  });

  it('does NOT include the body, so a mutation does not fragment its own cache', () => {
    const a = q.keyOf('createParty', { params: {}, body: { name: 'A' } });
    const b = q.keyOf('createParty', { params: {}, body: { name: 'B' } });
    expect(a).toEqual(b);
  });

  it('is stable across key ORDER in qry, so two equal queries are one entry', () => {
    const a = q.keyOf('listParties', { params: {}, body: undefined, qry: { page: '1', limit: '8' } });
    const b = q.keyOf('listParties', { params: {}, body: undefined, qry: { limit: '8', page: '1' } });
    expect(a).toEqual(b);
  });

  it('prefixes with the operation alone, so invalidating one operation is one call', () => {
    // `queryClient.invalidateQueries({ queryKey: q.keyOf('listParties') })` must match
    // every page of that operation — TanStack matches by PREFIX.
    const all = q.keyOf('listParties');
    const one = q.keyOf('listParties', { params: {}, body: undefined, qry: { page: '2' } });
    expect(one.slice(0, all.length)).toEqual(all);
  });
});

describe('query and mutation return OPTIONS, never hook results', () => {
  it('gives useQuery a key and a fn, so @agency/mock needs no React dependency', () => {
    const options = q.query('getParty', { params: { id: 'p1' }, body: undefined });
    expect(options.queryKey[0]).toBe('getParty');
    expect(typeof options.queryFn).toBe('function');
  });

  it('gives useMutation a fn taking the body, and the key to invalidate', () => {
    const options = q.mutation('createParty');
    expect(typeof options.mutationFn).toBe('function');
    expect(options.invalidates).toEqual(['createParty']);
  });
});
