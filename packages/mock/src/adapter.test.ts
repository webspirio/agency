import { describe, it, expect } from 'vitest';
import axios, { AxiosError } from 'axios';
import { mockAdapter, type Route } from './index';
import { DomainError } from './errors';

const ACTOR = { id: 'u1', role: 'owner' };
const NOW = () => '2026-09-09T10:00:00.000Z';

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
