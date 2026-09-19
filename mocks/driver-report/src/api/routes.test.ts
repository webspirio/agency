// mocks/driver-report/src/api/routes.test.ts
import { describe, expect, it } from 'vitest';
import axios from 'axios';
import { compile, mockAdapter, transport } from '@agency/mock';
import { demo } from '../domain/clock';
import { call, toRoutes } from './contract';
import { makeHandlers, serverNow } from './routes';
import { createServer, server } from './server';

describe('the route table (§7.4, §7.7)', () => {
  it('has one route per operation, no shadowing, caps copied', () => {
    const table = toRoutes(makeHandlers(createServer()));
    expect(table).toHaveLength(32);
    expect(() => compile(table)).not.toThrow();
    expect(table.every((r) => r.caps?.length === 1)).toBe(true);
  });
  it('gives the adapter the stage clock', () => {
    expect(serverNow()).toBe(server.clock.nowIso());
  });
  it('serves the driver through the real adapter and 404s the office behind the cap', async () => {
    const http = transport(axios.create({ baseURL: '/api', adapter: mockAdapter(toRoutes(makeHandlers(createServer())), {
      caps: new Set(['driver']), actor: { id: 'device-000001', role: 'driver' }, now: () => demo('05:14') }) }));
    expect((await call(http, 'getToday', { params: {}, body: undefined })).plan?.trip_no).toBe('Р-26-3312');
    await expect(call(http, 'getOfficeSummary', { params: {}, body: undefined, qry: { scope: 'PILOT' } }))
      .rejects.toMatchObject({ response: { status: 404 } });
  });
  it('answers a malformed body with 400 and message[] (the ValidationPipe shape)', async () => {
    const http = axios.create({ baseURL: '/api', adapter: mockAdapter(toRoutes(makeHandlers(createServer())), {
      caps: new Set(['driver']), actor: { id: 'device-000001', role: 'driver' }, now: () => demo('05:14') }) });
    const err = await http.post('/driver/records', { key: 'k', seq: '1' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ response: { status: 400, data: { message: expect.arrayContaining(['seq must be an integer number']) } } });
  });
});
