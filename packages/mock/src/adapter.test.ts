import { describe, it, expect, vi } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { mockAdapter, type Route } from './index';
import { DomainError, type ErrorEnvelope } from './errors';

const ACTOR = { id: 'u1', role: 'owner' };
const NOW = () => '2026-09-09T10:00:00.000Z';

let seenQuery: unknown;
const QUERY_ROUTE: Route = {
  method: 'GET', path: '/suppliers',
  handler: (ctx) => { seenQuery = ctx.query; return {}; },
};

function client(routes: Route[], caps: string[] = []) {
  return axios.create({
    baseURL: 'http://mock',
    paramsSerializer: { indexes: null },
    adapter: mockAdapter(routes, { caps: new Set(caps), actor: ACTOR, now: NOW }),
  });
}

describe('happy path', () => {
  it('resolves a 200 with the handler body', async () => {
    const c = client([{ method: 'GET', path: '/suppliers', handler: () => ({ data: [], total: 0, page: 1, limit: 20 }) }]);
    const res = await c.get('/suppliers');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('honours an explicit status — POST /intakes/:id/void returns 201 on the real backend', async () => {
    const c = client([{ method: 'POST', path: '/intakes/:id/void', status: 201, handler: () => ({ ok: true }) }]);
    expect((await c.post('/intakes/i1/void')).status).toBe(201);
  });

  it('extracts path params and query', async () => {
    const seen: unknown[] = [];
    const c = client([{ method: 'GET', path: '/suppliers/:id', handler: (ctx) => { seen.push(ctx.params, ctx.query); return {}; } }]);
    await c.get('/suppliers/s-42', { params: { page: '2' } });
    expect(seen[0]).toEqual({ id: 's-42' });
    expect(seen[1]).toEqual({ page: '2' });
  });

  it('gives the handler an actor from the session, never from the body', async () => {
    let actor: unknown;
    const c = client([{ method: 'POST', path: '/intakes', handler: (ctx) => { actor = ctx.actor; return {}; } }]);
    await c.post('/intakes', { actor: { id: 'FORGED', role: 'owner' } });
    expect(actor).toEqual(ACTOR);
  });
});

describe('THE TRAP: a non-2xx must THROW, because dispatchRequest never calls settle()', () => {
  it('rejects with an AxiosError carrying the real envelope', async () => {
    const c = client([{
      method: 'POST', path: '/shifts/:id/close',
      handler: () => { throw new DomainError(409, 'SHIFT_CLOSED', 'Shift is closed'); },
    }]);
    const err = await c.post('/shifts/s1/close').then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect((err as AxiosError).response?.status).toBe(409);
    expect((err as AxiosError).response?.data).toMatchObject({
      statusCode: 409, error: 'Conflict', code: 'SHIFT_CLOSED',
    });
  });

  it('does NOT resolve a 4xx — the regression this whole test file exists for', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => { throw new DomainError(404, 'NOT_FOUND', 'no'); } }]);
    await expect(c.get('/x')).rejects.toBeTruthy();
  });

  it('turns an unexpected throw into a 500 without leaking the message', async () => {
    const c = client([{ method: 'GET', path: '/boom', handler: () => { throw new Error('secret internals'); } }]);
    const err = await c.get('/boom').then(() => null, (e: AxiosError) => e);
    expect(err?.response?.status).toBe(500);
    expect(JSON.stringify(err?.response?.data)).not.toContain('secret internals');
  });
});

describe('the JSON round trip is the divergence killer', () => {
  it('drops undefined so the mock cannot return a shape no server could', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => ({ a: 1, b: undefined, c: null }) }]);
    const { data } = await c.get('/x');
    expect(Object.keys(data)).toEqual(['a', 'c']);
    expect(data.c).toBeNull();
  });

  it('serialises a Date to an ISO string, as JSON over the wire would', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => ({ at: new Date('2026-01-02T03:04:05.000Z') }) }]);
    expect((await c.get('/x')).data.at).toBe('2026-01-02T03:04:05.000Z');
  });

  it('breaks object identity, so a handler cannot hand out a live store reference', async () => {
    const row = { id: 'a' };
    const c = client([{ method: 'GET', path: '/x', handler: () => row }]);
    expect((await c.get('/x')).data).not.toBe(row);
  });
});

describe('capabilities gate the ROUTE, not just the menu', () => {
  it('404s an off-profile route so a typed URL cannot reach the other product', async () => {
    const c = client([{ method: 'GET', path: '/fleet/pnl', caps: ['fleet'], handler: () => ({ secret: 1 }) }], []);
    const err = await c.get('/fleet/pnl').then(() => null, (e: AxiosError) => e);
    expect(err?.response?.status).toBe(404);
    expect(err?.response?.data).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('serves the route when the capability is present', async () => {
    const c = client([{ method: 'GET', path: '/fleet/pnl', caps: ['fleet'], handler: () => ({ ok: 1 }) }], ['fleet']);
    expect((await c.get('/fleet/pnl')).status).toBe(200);
  });
});

describe('unmatched routes', () => {
  it('404s an unknown path rather than hanging', async () => {
    const c = client([]);
    const err = await c.get('/nope').then(() => null, (e: AxiosError) => e);
    expect(err?.response?.status).toBe(404);
  });

  it('does not match a different method on the same path', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => ({}) }]);
    await expect(c.post('/x')).rejects.toBeTruthy();
  });
});

describe('the request body is what a POST handler actually reads', () => {
  it('hands the handler parsed JSON, not the string axios serialised', async () => {
    let body: unknown;
    const c = client([{ method: 'POST', path: '/intakes', handler: (ctx) => { body = ctx.body; return {}; } }]);
    await c.post('/intakes', { supplier_id: 's-1', gross_kg: '12.50' });
    expect(body).toEqual({ supplier_id: 's-1', gross_kg: '12.50' });
  });

  it('gives a bodyless GET null, so a handler can branch on it without an undefined check', async () => {
    let body: unknown = 'unset';
    const c = client([{ method: 'GET', path: '/x', handler: (ctx) => { body = ctx.body; return {}; } }]);
    await c.get('/x');
    expect(body).toBeNull();
  });
});

describe('route matching is exact, not approximate', () => {
  it('treats a dot in a route path as a literal, never a regex wildcard', async () => {
    const c = client([{ method: 'GET', path: '/reports/q1.2026', handler: () => ({ ok: 1 }) }]);
    expect((await c.get('/reports/q1.2026')).status).toBe(200);
    await expect(c.get('/reports/q1X2026')).rejects.toBeTruthy();
  });

  it('percent-decodes a path param, as a real server would', async () => {
    let params: unknown;
    const c = client([{ method: 'GET', path: '/suppliers/:id', handler: (ctx) => { params = ctx.params; return {}; } }]);
    await c.get(`/suppliers/${encodeURIComponent('ТОВ Ягода')}`);
    expect(params).toEqual({ id: 'ТОВ Ягода' });
  });
});

describe('async handlers — the adapter must await, or a rejected mutation arrives as a success', () => {
  it('awaits an async handler and returns its resolved body, not {}', async () => {
    const c = client([{
      method: 'GET', path: '/intakes',
      handler: async () => ({ data: [{ id: 'i1' }], total: 1, page: 1, limit: 20 }),
    }]);
    const res = await c.get('/intakes');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ data: [{ id: 'i1' }], total: 1, page: 1, limit: 20 });
  });

  it('rejects when an async handler throws, instead of resolving 200 with an unhandled rejection', async () => {
    const c = client([{
      method: 'POST', path: '/shifts/:id/close',
      handler: async () => { throw new DomainError(409, 'SHIFT_CLOSED', 'Shift is closed'); },
    }]);
    const err = await c.post('/shifts/s1/close').then(() => null, (e: AxiosError) => e);
    expect(err?.response?.status).toBe(409);
    expect(err?.response?.data).toMatchObject({ statusCode: 409, code: 'SHIFT_CLOSED' });
  });
});

describe('serialisation happens inside the guard, so it can never escape as a raw throw', () => {
  it('gives a void handler an empty body — what a Nest void handler puts on the wire', async () => {
    const c = client([{ method: 'DELETE', path: '/intakes/:id', handler: () => { /* store.delete */ } }]);
    const res = await c.delete('/intakes/i1');
    expect(res.status).toBe(200);
    expect(res.data).toBe('');
  });

  it('turns an unserialisable payload (BigInt) into a 500 envelope, not a TypeError', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => ({ units: 10n }) }]);
    const err = await c.get('/x').then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect((err as AxiosError).response?.status).toBe(500);
    expect((err as AxiosError).response?.data).toMatchObject({ statusCode: 500, code: 'INTERNAL' });
  });

  it('turns a circular payload into a 500 envelope', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => { const o: Record<string, unknown> = {}; o.self = o; return o; } }]);
    const err = await c.get('/x').then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect((err as AxiosError).response?.status).toBe(500);
  });

  it('re-serialises the envelope separately when a DomainError ctx is circular', async () => {
    const ctx: Record<string, unknown> = { field: 'login' };
    ctx.self = ctx;
    const c = client([{ method: 'GET', path: '/x', handler: () => { throw new DomainError(409, 'LOGIN_TAKEN', 'taken', ctx); } }]);
    const err = await c.get('/x').then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect((err as AxiosError).response?.status).toBe(500);
    expect((err as AxiosError).response?.data).toMatchObject({ statusCode: 500, code: 'INTERNAL' });
  });
});

describe('the clock is a seam, not a global', () => {
  it('hands the handler the pinned instant, so a demo is not clock-dependent', async () => {
    let seen: unknown;
    const c = client([{ method: 'GET', path: '/x', handler: (ctx) => { seen = ctx.now; return {}; } }]);
    await c.get('/x');
    expect(seen).toBe('2026-09-09T10:00:00.000Z');
  });

  it('gives every handler in ONE request the same instant even when the clock moves', async () => {
    let n = 0;
    const seen: string[] = [];
    const moving = axios.create({
      baseURL: 'http://mock',
      adapter: mockAdapter(
        [{ method: 'GET', path: '/x', handler: (ctx) => { seen.push(ctx.now, ctx.now); return {}; } }],
        { caps: new Set<string>(), actor: ACTOR, now: () => `2026-09-09T10:00:0${n++}.000Z` },
      ),
    });
    await moving.get('/x');
    await moving.get('/x');
    expect(seen).toEqual([
      '2026-09-09T10:00:00.000Z', '2026-09-09T10:00:00.000Z',
      '2026-09-09T10:00:01.000Z', '2026-09-09T10:00:01.000Z',
    ]);
  });
});

describe('requestId — the envelope field the real filter always sets', () => {
  it('stamps a store-assigned, monotonic id per request — never Math.random', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => { throw new DomainError(409, 'X', 'x'); } }]);
    const a = await c.get('/x').then(() => null, (e: AxiosError) => e);
    const b = await c.get('/x').then(() => null, (e: AxiosError) => e);
    expect((a?.response?.data as ErrorEnvelope | undefined)?.requestId).toBe('req-000001');
    expect((b?.response?.data as ErrorEnvelope | undefined)?.requestId).toBe('req-000002');
  });

  it('stamps the 404 envelope too', async () => {
    const c = client([]);
    const err = await c.get('/nope').then(() => null, (e: AxiosError) => e);
    expect((err?.response?.data as ErrorEnvelope | undefined)?.requestId).toBe('req-000001');
  });
});

describe('validateStatus is the caller\'s, exactly as settle() reads it', () => {
  it('resolves a 404 when the caller passed validateStatus: () => true', async () => {
    const c = client([]);
    const res = await c.get('/nope', { validateStatus: () => true });
    expect(res.status).toBe(404);
    expect(res.data).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a 3xx under the default validateStatus, as every built-in adapter does', async () => {
    const c = client([{ method: 'GET', path: '/old', status: 302, handler: () => ({ ok: 1 }) }]);
    await expect(c.get('/old')).rejects.toBeTruthy();
  });

  /**
   * The narrowing this file's headline promise underwent, recorded on purpose.
   * settle() resolves whenever validateStatus is FALSY — `!response.status ||
   * !validateStatus || validateStatus(status)` — so an adapter driven directly
   * with a hand-built config resolves a 409 instead of throwing. The invariant
   * is therefore 'the CALLER's validateStatus decides, exactly as settle()
   * reads it', not 'a non-2xx always throws'.
   *
   * Nothing on the product path can hit it: `axios.create` always merges the
   * default validateStatus in, and a mock's client.ts is one `axios.create`.
   * Both halves are asserted here so the edge is a decision, not an accident.
   */
  it('resolves a 409 when the config carries no validateStatus at all, as settle() does', async () => {
    const routes: Route[] = [{
      method: 'GET', path: '/y',
      handler: () => { throw new DomainError(409, 'SHIFT_CLOSED', 'Shift is closed'); },
    }];
    const bare = mockAdapter(routes, { caps: new Set<string>(), actor: ACTOR, now: NOW });
    const res = await bare({ method: 'get', url: '/y' } as InternalAxiosRequestConfig);
    expect(res.status).toBe(409);
    expect(res.data).toMatchObject({ statusCode: 409, code: 'SHIFT_CLOSED' });

    // …and the same table through axios.create — the only way a mock is ever
    // wired — throws, because create() merged the default validateStatus in.
    await expect(client(routes).get('/y')).rejects.toBeInstanceOf(AxiosError);
  });
});

describe('the request path is resolved the way buildFullPath resolves it', () => {
  it('matches a trailing slash to the same route, as express with strict routing off', async () => {
    const c = client([{ method: 'GET', path: '/suppliers', handler: () => ({ ok: 1 }) }]);
    expect((await c.get('/suppliers/')).status).toBe(200);
  });

  it('still 404s /suppliers/ against /suppliers/:id — an empty segment is not a param', async () => {
    const c = client([{ method: 'GET', path: '/suppliers/:id', handler: () => ({ ok: 1 }) }]);
    await expect(c.get('/suppliers/')).rejects.toBeTruthy();
  });

  it('resolves a url written without a leading slash', async () => {
    const c = client([{ method: 'GET', path: '/suppliers', handler: () => ({ ok: 1 }) }]);
    expect((await c.get('suppliers')).status).toBe(200);
  });

  it('resolves a fully-qualified url against the same route table', async () => {
    const c = client([{ method: 'GET', path: '/suppliers', handler: () => ({ ok: 1 }) }]);
    expect((await c.get('http://mock/suppliers')).status).toBe(200);
  });

  it('strips a path baseURL, so route paths stay server-relative', async () => {
    const c = axios.create({
      baseURL: '/api',
      adapter: mockAdapter([{ method: 'GET', path: '/overview', handler: () => ({ ok: 1 }) }], {
        caps: new Set<string>(), actor: ACTOR, now: NOW,
      }),
    });
    expect((await c.get('overview')).status).toBe(200);
    expect((await c.get('/overview')).status).toBe(200);
    // buildFullPath COMBINES: a caller who repeats the prefix asks for
    // /api/api/overview, which 404s against the product too.
    await expect(c.get('/api/overview')).rejects.toBeTruthy();
  });
});

describe('an unexpected throw is sanitised on the wire and preserved for the developer', () => {
  it('logs it and keeps the original reachable as the AxiosError cause', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new TypeError("Cannot read properties of undefined (reading 'map')");
    const c = client([{ method: 'GET', path: '/boom', handler: () => { throw boom; } }]);
    const err = await c.get('/boom').then(() => null, (e: AxiosError) => e);
    expect(err?.response?.status).toBe(500);
    expect(JSON.stringify(err?.response?.data)).not.toContain('reading');
    expect(err?.cause).toBe(boom);
    expect(spy).toHaveBeenCalledWith('[mock] unhandled handler error', boom);
    spy.mockRestore();
  });
});

describe('query params reach the handler in the shape the wire produces', () => {
  async function queryOf(url: string, config?: Record<string, unknown>, instance = client([QUERY_ROUTE])) {
    seenQuery = undefined;
    await instance.get(url, config);
    return seenQuery;
  }

  it('keeps an array param an array — paramsSerializer { indexes: null } puts repeated keys on the wire', async () => {
    expect(await queryOf('/suppliers', { params: { tagIds: ['a', 'b'] } })).toEqual({ tagIds: ['a', 'b'] });
  });

  it('follows the caller\'s serializer rather than inventing one: the default form brackets the key', async () => {
    const bracketed = axios.create({
      baseURL: 'http://mock',
      adapter: mockAdapter([QUERY_ROUTE], { caps: new Set<string>(), actor: ACTOR, now: NOW }),
    });
    expect(await queryOf('/suppliers', { params: { tagIds: ['a', 'b'] } }, bracketed))
      .toEqual({ 'tagIds[]': ['a', 'b'] });
  });

  it('serialises a Date to an ISO instant, as toFormData does on the wire', async () => {
    expect(await queryOf('/suppliers', { params: { from: new Date('2026-01-02T00:00:00Z') } }))
      .toEqual({ from: '2026-01-02T00:00:00.000Z' });
  });

  it('collects repeated keys already present in the url', async () => {
    expect(await queryOf('/suppliers?tag=a&tag=b')).toEqual({ tag: ['a', 'b'] });
  });

  it('merges url query with params instead of letting one clobber the other', async () => {
    expect(await queryOf('/suppliers?tag=a&page=1', { params: { tag: 'b' } }))
      .toEqual({ tag: ['a', 'b'], page: '1' });
  });

  it('accepts a URLSearchParams instance as params', async () => {
    expect(await queryOf('/suppliers', { params: new URLSearchParams([['a', '1'], ['a', '2']]) }))
      .toEqual({ a: ['1', '2'] });
  });

  it('honours a custom paramsSerializer function', async () => {
    expect(await queryOf('/suppliers', {
      params: { a: 1, b: 2 },
      paramsSerializer: (p: Record<string, unknown>) => Object.entries(p).map(([k, v]) => `${k}=X${String(v)}`).join('&'),
    })).toEqual({ a: 'X1', b: 'X2' });
  });

  it('leaves a single-valued param a plain string', async () => {
    expect(await queryOf('/suppliers', { params: { page: '2' } })).toEqual({ page: '2' });
  });

  /**
   * A fragment is never sent: the browser strips everything from '#' on before
   * the request leaves. Slicing the raw uri at the first '?' instead of parsing
   * it leaks it into the LAST value — `{ tag: 'a#section' }` — which is a value
   * no server could ever produce, and it disagrees with pathOf on the same
   * string, since pathOf parses. It only fires when the url carries both '?'
   * and '#' and the caller passed no `params`, because axios's own buildURL
   * drops the hash when it appends.
   */
  it('drops a url fragment instead of leaking it into the last query value', async () => {
    expect(await queryOf('/suppliers?tag=a#section')).toEqual({ tag: 'a' });
    expect(await queryOf('/suppliers?tag=a&page=1#section')).toEqual({ tag: 'a', page: '1' });
    expect(await queryOf('/suppliers#section')).toEqual({});
    // and with params present, where axios strips the hash itself
    expect(await queryOf('/suppliers?tag=a#section', { params: { page: '1' } }))
      .toEqual({ tag: 'a', page: '1' });
  });
});

describe('a malformed url is a 400 envelope, not a raw URIError', () => {
  it('answers a bad percent escape in a path param with 400 BAD_REQUEST', async () => {
    const c = client([{ method: 'GET', path: '/suppliers/:id', handler: () => ({ ok: 1 }) }]);
    const err = await c.get('/suppliers/100%').then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect((err as AxiosError).response?.status).toBe(400);
    expect((err as AxiosError).response?.data).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });
});

/**
 * `axios.getUri` on the DEFAULT export is a method of the global axios
 * instance, so it merges `axios.defaults` into whatever config it is handed.
 * The config reaching an adapter has already been through dispatchRequest with
 * its OWN instance's defaults merged in, so any global default the URI builder
 * adds on top is a value the real request would never have carried — and
 * `axios.create` snapshots defaults at create time, so an instance made before
 * the global was touched genuinely does not have them.
 */
describe('the request uri is built from the config alone, never from global axios defaults', () => {
  it('ignores a baseURL set on the global instance after the client was created', async () => {
    const c = axios.create({
      adapter: mockAdapter([{ method: 'GET', path: '/suppliers', handler: () => ({ ok: 1 }) }], {
        caps: new Set<string>(), actor: ACTOR, now: NOW,
      }),
    });
    axios.defaults.baseURL = 'http://global.example/api';
    try {
      // the real request would go to '/suppliers'; a globally-prefixed uri with
      // config.baseURL still undefined means nothing gets stripped back off.
      expect((await c.get('/suppliers')).status).toBe(200);
    } finally {
      delete axios.defaults.baseURL;
    }
  });

  it('ignores params set on the global instance, which this client never had', async () => {
    const c = client([QUERY_ROUTE]);
    axios.defaults.params = { tenant: 'GLOBAL' };
    try {
      seenQuery = undefined;
      await c.get('/suppliers', { params: { page: '2' } });
      expect(seenQuery).toEqual({ page: '2' });
    } finally {
      delete axios.defaults.params;
    }
  });
});

/**
 * express with `strict routing` off — Nest's default, and what the comment on
 * pathOf cites — accepts exactly ONE optional trailing slash. Measured against
 * path-to-regexp 8.4.2, express 5's matcher: '/suppliers' becomes
 * /^(?:\/suppliers)(?:\/$)?$/i, which matches '/suppliers/' and rejects
 * '/suppliers//'. Absorbing any number is MORE permissive than the product,
 * which is the divergence direction this package exists to prevent: a url that
 * works in the demo and 404s after conversion.
 */
describe('trailing slashes are absorbed the way express absorbs them: one, not any number', () => {
  it('404s a path with more trailing slashes than a server would accept', async () => {
    const c = client([{ method: 'GET', path: '/suppliers', handler: () => ({ ok: 1 }) }]);
    expect((await c.get('/suppliers')).status).toBe(200);
    expect((await c.get('/suppliers/')).status).toBe(200);
    await expect(c.get('/suppliers//')).rejects.toBeTruthy();
    await expect(c.get('/suppliers///')).rejects.toBeTruthy();
  });
});

/**
 * `reference/contract/all-exceptions.filter.ts:78` sets `path: request.url` —
 * the path the SERVER received: global prefix included, query string included,
 * origin excluded. The envelope is field-for-field faithful everywhere else, so
 * a support screen or a bug report rendering `envelope.path` must not read one
 * string in the demo and a different one in production.
 */
describe('the error envelope\'s path is the one the product\'s filter emits', () => {
  it('keeps the baseURL prefix and the query string, and drops the origin', async () => {
    const c = axios.create({
      baseURL: 'http://mock/api',
      adapter: mockAdapter([], { caps: new Set<string>(), actor: ACTOR, now: NOW }),
    });
    const err = await c.get('/nope', { params: { a: 1 } }).then(() => null, (e: AxiosError) => e);
    expect((err?.response?.data as ErrorEnvelope | undefined)?.path).toBe('/api/nope?a=1');
  });

  it('is identical for a relative baseURL, which is what a mock actually ships with', async () => {
    const c = axios.create({
      baseURL: '/api',
      adapter: mockAdapter([], { caps: new Set<string>(), actor: ACTOR, now: NOW }),
    });
    const err = await c.get('/nope', { params: { a: 1 } }).then(() => null, (e: AxiosError) => e);
    expect((err?.response?.data as ErrorEnvelope | undefined)?.path).toBe('/api/nope?a=1');
  });

  it('is the bare path when there is no prefix and no query', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => { throw new DomainError(409, 'C', 'c'); } }]);
    const err = await c.get('/x').then(() => null, (e: AxiosError) => e);
    expect((err?.response?.data as ErrorEnvelope | undefined)?.path).toBe('/x');
  });
});

/**
 * `new URL()` refuses some strings axios will happily hand an adapter verbatim
 * ('http://[' is one), so pathOf, queryOf and basePathOf each carry a fallback.
 * They have to AGREE, or a url resolves to a route whose query is empty — the
 * pathOf/queryOf disagreement this round already fixed once, one branch down.
 */
describe('a uri the URL parser refuses is still resolved, and by the same rules', () => {
  it('treats an unparseable baseURL as a literal prefix and still reads the query off it', async () => {
    const c = axios.create({
      baseURL: 'http://[',
      adapter: mockAdapter([QUERY_ROUTE], { caps: new Set<string>(), actor: ACTOR, now: NOW }),
    });
    seenQuery = undefined;
    expect((await c.get('/suppliers?tag=a#section')).status).toBe(200);
    expect(seenQuery).toEqual({ tag: 'a' });
  });

  it('404s rather than throwing when nothing can be made of the url', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => ({ ok: 1 }) }]);
    const err = await c.get('http://[/x').then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AxiosError);
    expect((err as AxiosError).response?.status).toBe(404);
  });
});
