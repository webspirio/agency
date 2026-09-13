/**
 * THE SPINE, at runtime. `drift.controls.ts` proves what the contract refuses at
 * compile time; this file proves that what you get out of it still behaves like
 * a route table, and that the four runtime guarantees actually hold.
 *
 * Every handler here goes through `makeRoutes()`, which mints a fresh store —
 * so this suite passes under `--sequence.shuffle.tests`.
 */
import { describe, it, expect } from 'vitest';
import axios, { AxiosError, type AxiosInstance } from 'axios';
import { mockAdapter } from './adapter';
import { compile } from './router';
import { asDecimal2, type Decimal2, type Paginated } from './types';
import { createStore } from './store';
import { MAX_LIMIT, pageQuery } from './query';
import { makeContract, type Contract, type HandlersOf } from './contract';

type Party = { id: string; name: string; balance: Decimal2 };

const SEED: readonly Omit<Party, 'id'>[] = [
  { name: 'Anna Albrecht', balance: asDecimal2('12480.00') },
  { name: 'Bernd Cordes', balance: asDecimal2('3195.50') },
];

export const api = {
  listParties: { method: 'GET', path: '/parties', status: 200, caps: [], codes: [] },
  getParty: { method: 'GET', path: '/parties/:id', status: 200, caps: [], codes: ['PARTY_NOT_FOUND'] },
  createParty: { method: 'POST', path: '/parties', status: 201, caps: ['crm'], codes: ['PARTY_NAME_TAKEN'] },
  renameParty: { method: 'PATCH', path: '/parties/:id', status: 200, caps: ['crm'], codes: ['PARTY_NOT_FOUND', 'PARTY_NAME_TAKEN'] },
  removeParty: { method: 'DELETE', path: '/parties/:id', status: 204, caps: ['crm'], codes: ['PARTY_NOT_FOUND'] },
} as const;
export type Api = typeof api;

export interface Io {
  listParties: { req: void; res: Paginated<Party>; qry: { page?: string; limit?: string; tag?: string[] } };
  getParty: { req: void; res: Party; qry: Record<string, never> };
  createParty: { req: { name: string; balance: string }; res: Party; qry: Record<string, never> };
  renameParty: { req: { name: string }; res: Party; qry: Record<string, never> };
  removeParty: { req: void; res: void; qry: Record<string, never> };
}

const contract = makeContract<Api, Io>(api);

/**
 * ANNOTATED, not destructured. MEASURED: a never-returning `fail()` narrows only
 * when the callee is a function declaration or a const with an EXPLICIT type —
 * `const { fail } = makeContract(...)` does not narrow, and neither does
 * `contract.fail(...)`. Without the annotation every `if (!row) fail(...)` would
 * leave `row` possibly-undefined and each handler would need a non-null assertion.
 * This is the idiom each mock's src/api/contract.ts writes.
 */
const call: Contract<Api, Io>['call'] = contract.call;
const fail: Contract<Api, Io>['fail'] = contract.fail;
const codeOf: Contract<Api, Io>['codeOf'] = contract.codeOf;
const toRoutes: Contract<Api, Io>['toRoutes'] = contract.toRoutes;

/**
 * A fresh store per call — the whole point. NO return-type annotation, and the
 * literal ends in `satisfies`: an annotation widens the return to the declared
 * type and the exactness check at `toRoutes` has nothing left to compare.
 */
function makeHandlers() {
  const parties = createStore<Party>('party', SEED);
  // A SNAPSHOT, capped at the limit the store will actually honour. The lab wrote
  // `list({ page: 1, limit: 9999 })`, which clamps silently — naming MAX_LIMIT is
  // the difference between a cap you chose and one you did not notice.
  const byName = (name: string) =>
    parties.list({ page: 1, limit: MAX_LIMIT }).data.some((p) => p.name === name);

  return {
    listParties: (c) => parties.list(pageQuery(c.query)),
    getParty: (c) => {
      const row = parties.get(c.params.id);
      if (!row) fail('getParty', 404, 'PARTY_NOT_FOUND', 'No such party', { id: c.params.id });
      return row;
    },
    createParty: (c) => {
      if (byName(c.body.name)) fail('createParty', 409, 'PARTY_NAME_TAKEN', 'Taken', { field: 'name' });
      return parties.create({ name: c.body.name, balance: asDecimal2(c.body.balance) });
    },
    renameParty: (c) => {
      if (!parties.get(c.params.id)) fail('renameParty', 404, 'PARTY_NOT_FOUND', 'No such party');
      if (byName(c.body.name)) fail('renameParty', 409, 'PARTY_NAME_TAKEN', 'Taken', { field: 'name' });
      const updated = parties.update(c.params.id, { name: c.body.name });
      if (!updated) fail('renameParty', 404, 'PARTY_NOT_FOUND', 'No such party');
      return updated;
    },
    removeParty: (c) => {
      if (!parties.remove(c.params.id)) fail('removeParty', 404, 'PARTY_NOT_FOUND', 'No such party');
    },
  } satisfies HandlersOf<Api, Io>;
}

const ACTOR = { id: 'demo-user', role: 'owner' };
const NOW = () => '2026-09-12T10:00:00.000Z';

function client(caps: string[] = ['crm']): AxiosInstance {
  return axios.create({
    baseURL: 'http://mock',
    paramsSerializer: { indexes: null },
    adapter: mockAdapter(toRoutes(makeHandlers()), { caps: new Set(caps), actor: ACTOR, now: NOW }),
  });
}

describe('the derived table is a real route table', () => {
  it('survives the real compile() — no route shadows another', () => {
    expect(() => compile(toRoutes(makeHandlers()))).not.toThrow();
  });

  it('CARRIES caps across the derivation — dropping them un-gates every route', () => {
    // A confidentiality property, and silent: SPEC 8 promises a typed URL
    // cannot surface another client's product.
    const routes = toRoutes(makeHandlers());
    expect(routes.find((r) => r.method === 'POST')?.caps).toEqual(['crm']);
    expect(routes.find((r) => r.method === 'DELETE')?.caps).toEqual(['crm']);
    expect(routes.find((r) => r.method === 'GET' && r.path === '/parties')?.caps).toEqual([]);
  });

  it('carries the declared success status, including 201 and 204', () => {
    const routes = toRoutes(makeHandlers());
    expect(routes.find((r) => r.method === 'POST')?.status).toBe(201);
    expect(routes.find((r) => r.method === 'DELETE')?.status).toBe(204);
  });

  it('declares one route per operation, in registry key order', () => {
    expect(toRoutes(makeHandlers()).map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /parties', 'GET /parties/:id', 'POST /parties', 'PATCH /parties/:id', 'DELETE /parties/:id',
    ]);
  });
});

describe('call() builds the request from the registry, never from a second copy', () => {
  it('reads a list through the declared path', async () => {
    const page = await call(client(), 'listParties', { params: {}, body: undefined, qry: { limit: '1' } });
    expect(page).toMatchObject({ total: 2, page: 1, limit: 1 });
    expect(page.data).toHaveLength(1);
  });

  it('substitutes a path param', async () => {
    expect((await call(client(), 'getParty', { params: { id: 'party-000002' }, body: undefined })).name)
      .toBe('Bernd Cordes');
  });

  it('serialises a repeated query key as repeated bare keys, as express@5 expects', async () => {
    const page = await call(client(), 'listParties', {
      params: {}, body: undefined, qry: { tag: ['a', 'b'] },
    });
    expect(page.total).toBe(2);
  });

  it('THROWS on an empty path substitution rather than calling the LIST route', async () => {
    // MEASURED against the lab client: params {id:''} builds '/parties/', the
    // adapter absorbs the one trailing slash, the LIST route answers 200, and
    // the Paginated envelope is cast to Party. A detail call must never be
    // answered by a list.
    await expect(
      call(client(), 'getParty', { params: { id: '' }, body: undefined }),
    ).rejects.toThrow(/param/i);
  });

  it('THROWS on a whitespace-only substitution too', async () => {
    await expect(
      call(client(), 'getParty', { params: { id: '   ' }, body: undefined }),
    ).rejects.toThrow(/param/i);
  });

  it('encodes a param that would otherwise change the path shape', async () => {
    const err = await call(client(), 'getParty', { params: { id: 'a/b' }, body: undefined })
      .catch((e: unknown) => e);
    expect((err as AxiosError).response?.status).toBe(404);
  });
});

describe('fail() is keyed to the registry, and the code reaches the screen closed', () => {
  it('refuses an unknown id with the declared code', async () => {
    const err = await call(client(), 'getParty', { params: { id: 'party-999999' }, body: undefined })
      .catch((e: unknown) => e);
    expect((err as AxiosError).response?.status).toBe(404);
    expect(codeOf('getParty', err)).toBe('PARTY_NOT_FOUND');
  });

  it('refuses a duplicate name with the declared code and its context', async () => {
    const err = await call(client(), 'createParty', {
      params: {}, body: { name: 'Anna Albrecht', balance: '1.00' },
    }).catch((e: unknown) => e);
    expect((err as AxiosError).response?.status).toBe(409);
    expect(codeOf('createParty', err)).toBe('PARTY_NAME_TAKEN');
    expect((err as AxiosError).response?.data).toMatchObject({ field: 'name' });
  });

  it('codeOf returns undefined for something that is not an api error at all', () => {
    expect(codeOf('getParty', new Error('boom'))).toBeUndefined();
    expect(codeOf('getParty', undefined)).toBeUndefined();
  });
});

describe('the write verbs, which the lab never exercised', () => {
  it('creates, and the next GET sees it', async () => {
    const c = client();
    const created = await call(c, 'createParty', { params: {}, body: { name: 'Elke Fischer', balance: '96.20' } });
    expect(created.id).toBe('party-000003');
    const after = await call(c, 'listParties', { params: {}, body: undefined, qry: { limit: '99' } });
    expect(after.total).toBe(3);
  });

  it('PATCHes a row and the change survives into the next read', async () => {
    const c = client();
    const renamed = await call(c, 'renameParty', { params: { id: 'party-000001' }, body: { name: 'Anna Neumann' } });
    expect(renamed.name).toBe('Anna Neumann');
    expect((await call(c, 'getParty', { params: { id: 'party-000001' }, body: undefined })).name)
      .toBe('Anna Neumann');
  });

  it('DELETEs with a 204 that carries NO body — a null there is a wire divergence', async () => {
    // Measured: a handler returning null puts literal JSON `null` on a 204,
    // which no Nest 204 ever carries. Returning nothing yields '' , which is
    // what axios gives against the real backend.
    const c = client();
    const res = await c.request({ method: 'DELETE', url: '/parties/party-000001' });
    expect(res.status).toBe(204);
    expect(res.data).toBe('');
    const after = await call(c, 'listParties', { params: {}, body: undefined, qry: { limit: '99' } });
    expect(after.total).toBe(1);
  });

  it('404s a DELETE of something that is not there', async () => {
    const err = await call(client(), 'removeParty', { params: { id: 'party-999999' }, body: undefined })
      .catch((e: unknown) => e);
    expect(codeOf('removeParty', err)).toBe('PARTY_NOT_FOUND');
  });
});

describe('capabilities gate the route, not merely the menu', () => {
  it('404s a create for a profile without the capability', async () => {
    const err = await call(client([]), 'createParty', {
      params: {}, body: { name: 'X', balance: '1.00' },
    }).catch((e: unknown) => e);
    expect((err as AxiosError).response?.status).toBe(404);
  });

  it('still serves the ungated list to that profile', async () => {
    expect((await call(client([]), 'listParties', { params: {}, body: undefined })).total).toBe(2);
  });
});
