import { describe, it, expect } from 'vitest';
import axios, { type AxiosInstance } from 'axios';
import {
  ApiError, apiErrorCode, attachErrorInterceptor, DomainError, extractErrorCode,
  extractErrorDetails, extractErrorMessage, extractErrorPayload, extractErrorReason,
  mockAdapter, type Route,
} from './index';

const ACTOR = { id: 'u1', role: 'owner' };
const NOW = () => '2026-09-09T10:00:00.000Z';

function client(routes: Route[]): AxiosInstance {
  return axios.create({
    baseURL: 'http://mock',
    paramsSerializer: { indexes: null },
    adapter: mockAdapter(routes, { caps: new Set<string>(), actor: ACTOR, now: NOW }),
  });
}

const thrown = (e: unknown) => e;

describe('attachErrorInterceptor — above the seam the mock must be byte-identical to the product', () => {
  it('turns a DomainError into ApiError with status, code and the envelope as payload', async () => {
    const c = client([{
      method: 'POST', path: '/shifts/:id/close',
      handler: () => { throw new DomainError(409, 'SHIFT_CLOSED', 'Shift is closed', { field: 'shift' }); },
    }]);
    attachErrorInterceptor(c);
    const err = await c.post('/shifts/s1/close').then(() => null, thrown);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe('SHIFT_CLOSED');
    expect((err as ApiError).message).toBe('Shift is closed');
    expect((err as ApiError).payload).toMatchObject({ statusCode: 409, code: 'SHIFT_CLOSED', field: 'shift' });
    expect(apiErrorCode(err)).toBe('SHIFT_CLOSED');
  });

  it('flattens a string[] message and keeps the array in details for field-level forms', async () => {
    const c = client([{
      method: 'POST', path: '/users',
      handler: () => { throw new DomainError(400, 'VALIDATION', ['login must not be empty', 'role is invalid']); },
    }]);
    attachErrorInterceptor(c);
    const err = await c.post('/users').then(() => null, thrown) as ApiError;
    expect(err.message).toBe('login must not be empty; role is invalid');
    expect(err.details).toEqual(['login must not be empty', 'role is invalid']);
  });

  it('reads the body\'s reason, so a caller can branch on WHY without parsing prose', async () => {
    const c = client([{
      method: 'POST', path: '/login',
      handler: () => { throw new DomainError(401, 'AUTH', 'Bad credentials', { reason: 'invalid_credentials' }); },
    }]);
    attachErrorInterceptor(c);
    const err = await c.post('/login').then(() => null, thrown) as ApiError;
    expect(err.reason).toBe('invalid_credentials');
  });

  it('leaves a success untouched', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => ({ ok: 1 }) }]);
    attachErrorInterceptor(c);
    expect((await c.get('/x')).data).toEqual({ ok: 1 });
  });

  it('gives status 0 to an error that never reached a response', async () => {
    const c = axios.create({ adapter: () => Promise.reject(new Error('offline')) });
    attachErrorInterceptor(c);
    const err = await c.get('/x').then(() => null, thrown) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toBe('Request failed with status 0');
  });

  it('REPLACES on a second attach rather than stacking — a stacked handler collapses every status to 0', async () => {
    const c = client([{ method: 'GET', path: '/x', handler: () => { throw new DomainError(409, 'SHIFT_CLOSED', 'Shift is closed'); } }]);
    attachErrorInterceptor(c);
    attachErrorInterceptor(c);
    attachErrorInterceptor(c);
    const err = await c.get('/x').then(() => null, thrown) as ApiError;
    expect(err.status).toBe(409);
    expect(err.code).toBe('SHIFT_CLOSED');
  });

  it('keys by client, so attaching to one leaves another alone', async () => {
    const routes: Route[] = [{ method: 'GET', path: '/x', handler: () => { throw new DomainError(409, 'C', 'c'); } }];
    const a = client(routes);
    const b = client(routes);
    attachErrorInterceptor(a);
    expect(await a.get('/x').then(() => null, thrown)).toBeInstanceOf(ApiError);
    expect(await b.get('/x').then(() => null, thrown)).not.toBeInstanceOf(ApiError);
  });
});

describe('the extract helpers, which a caller may use on a raw body', () => {
  it('reads code, payload, message, details and reason off an envelope', () => {
    const body = { statusCode: 409, code: 'SHIFT_CLOSED', message: 'Shift is closed', reason: 'closed' };
    expect(extractErrorCode(body)).toBe('SHIFT_CLOSED');
    expect(extractErrorPayload(body)).toBe(body);
    expect(extractErrorMessage(409, body)).toBe('Shift is closed');
    expect(extractErrorDetails(body)).toBeUndefined();
    expect(extractErrorReason(body)).toBe('closed');
  });

  it('degrades to a status sentence when the body carried no message', () => {
    expect(extractErrorMessage(500, undefined)).toBe('Request failed with status 500');
    expect(extractErrorMessage(500, 'not an object')).toBe('Request failed with status 500');
    expect(extractErrorCode({ code: 7 })).toBeUndefined();
    expect(extractErrorPayload(['a'])).toBeUndefined();
  });
});
