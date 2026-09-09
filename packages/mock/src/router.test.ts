import { describe, it, expect } from 'vitest';
import { compile, type Route } from './router';
import { DomainError } from './errors';

const H = () => ({});
const r = (path: string, extra: Partial<Route> = {}): Route => ({ method: 'GET', path, handler: H, ...extra });

describe('compile rejects a route table that cannot mean what it looks like', () => {
  it('rejects a param name that is not a bare identifier, instead of registering one called "id.csv"', () => {
    expect(() => compile([r('/reports/:id.csv')])).toThrow(/:id\.csv/);
  });

  it('rejects an express-4 optional param rather than naming the param "id?"', () => {
    expect(() => compile([r('/x/:id?')])).toThrow(/:id\?/);
  });

  it('rejects a wildcard rather than escaping it to a literal asterisk that matches nothing', () => {
    expect(() => compile([r('/files/*')])).toThrow(/wildcard/i);
  });

  it('rejects a route path with no leading slash, which no incoming path could ever equal', () => {
    expect(() => compile([r('overview')])).toThrow(/leading/i);
  });

  it('accepts an ordinary table', () => {
    expect(() => compile([r('/suppliers'), r('/suppliers/:id'), r('/suppliers/:id/notes')])).not.toThrow();
  });
});

describe('declaration order is the contract, so shadowing is a startup failure', () => {
  it('matches the first declaration, exactly as express does', () => {
    const t = compile([r('/suppliers/export'), r('/suppliers/:id')]);
    expect(t.match('GET', '/suppliers/export')?.route.path).toBe('/suppliers/export');
    expect(t.match('GET', '/suppliers/s1')?.params).toEqual({ id: 's1' });
  });

  it('throws when an earlier param route swallows a later capability-gated literal', () => {
    expect(() => compile([
      r('/reports/:id'),
      r('/reports/pnl', { caps: ['fleet'] }),
    ])).toThrow(/shadow/i);
  });

  it('throws for the benign form too — an unreachable route is always a bug', () => {
    expect(() => compile([r('/suppliers/:id'), r('/suppliers/export')])).toThrow(/shadow/i);
  });

  it('is quiet when the literal is declared first', () => {
    expect(() => compile([r('/reports/pnl', { caps: ['fleet'] }), r('/reports/:id')])).not.toThrow();
  });

  it('does not confuse a longer path with a shadowed one', () => {
    expect(() => compile([r('/a/:id'), r('/a/:id/notes')])).not.toThrow();
  });

  it('compares only routes of the same method', () => {
    expect(() => compile([r('/x/:id'), r('/x/export', { method: 'POST' })])).not.toThrow();
  });
});

describe('match', () => {
  it('answers a malformed percent escape with a 400 DomainError, never a raw URIError', () => {
    const t = compile([r('/suppliers/:id')]);
    const err = (() => { try { t.match('GET', '/suppliers/100%'); return null; } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).status).toBe(400);
    expect((err as DomainError).code).toBe('BAD_REQUEST');
  });
});
