import { describe, it, expect } from 'vitest';
import { DomainError, envelopeOf } from './errors';
import { createSeq } from './types';

describe('DomainError -> envelope', () => {
  it('emits the envelope the real backend emits, with code as the branch point', () => {
    const e = new DomainError(409, 'SHIFT_CLOSED', 'Shift is closed');
    expect(envelopeOf(e, '/shifts/s1/close', '2026-09-09T10:00:00.000Z')).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Shift is closed',
      code: 'SHIFT_CLOSED',
      path: '/shifts/s1/close',
      timestamp: '2026-09-09T10:00:00.000Z',
    });
  });

  it('uses the canonical HTTP phrase, never a JS class name', () => {
    // yagoda-starter leaks 'ConflictException' here; the mock must not copy that.
    expect(envelopeOf(new DomainError(409, 'X', 'x'), '/p', 'T').error).toBe('Conflict');
    expect(envelopeOf(new DomainError(404, 'X', 'x'), '/p', 'T').error).toBe('Not Found');
    expect(envelopeOf(new DomainError(400, 'X', 'x'), '/p', 'T').error).toBe('Bad Request');
    expect(envelopeOf(new DomainError(500, 'X', 'x'), '/p', 'T').error).toBe('Internal Server Error');
  });

  it('spreads context fields alongside code, and never lets them clobber the envelope', () => {
    const e = new DomainError(409, 'LOGIN_TAKEN', 'taken', { field: 'login', statusCode: 999 });
    const env = envelopeOf(e, '/users', 'T');
    expect(env.field).toBe('login');
    expect(env.statusCode).toBe(409);
  });

  it('carries a string[] message for field-level validation failures', () => {
    const e = new DomainError(400, 'VALIDATION', ['login must not be empty', 'role is invalid']);
    expect(envelopeOf(e, '/users', 'T').message).toEqual([
      'login must not be empty', 'role is invalid',
    ]);
  });
});

describe('createSeq', () => {
  it('is monotonic and prefixed — never Math.random', () => {
    const next = createSeq('intake');
    expect([next(), next(), next()]).toEqual(['intake-000001', 'intake-000002', 'intake-000003']);
  });

  it('sorts lexicographically in creation order, which a SQL ORDER BY can reproduce', () => {
    const next = createSeq('x');
    const ids = Array.from({ length: 1200 }, next);
    // oxlint-disable-next-line agency/no-implicit-sort -- the DEFAULT lexicographic sort is the subject: this asserts it reproduces createSeq order, which is what makes a zero-padded id reproducible by a SQL ORDER BY. A comparator here would test the comparator.
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('the decorative `error` phrase is never a JS class name', () => {
  it('maps the statuses outside the ten most common ones', () => {
    const phrase = (status: number) => envelopeOf(new DomainError(status, 'X', 'x'), '/p', 'T').error;
    expect(phrase(402)).toBe('Payment Required');
    expect(phrase(405)).toBe('Method Not Allowed');
    expect(phrase(413)).toBe('Payload Too Large');
    expect(phrase(415)).toBe('Unsupported Media Type');
    expect(phrase(423)).toBe('Locked');
    expect(phrase(451)).toBe('Unavailable For Legal Reasons');
    expect(phrase(502)).toBe('Bad Gateway');
  });

  it('falls back to the status CLASS for an unregistered status, never to "Error"', () => {
    const phrase = (status: number) => envelopeOf(new DomainError(status, 'X', 'x'), '/p', 'T').error;
    expect(phrase(499)).toBe('Client Error');
    expect(phrase(599)).toBe('Server Error');
  });
});

describe('requestId', () => {
  it('is set when the adapter supplies one, and wins over a ctx field of the same name', () => {
    const e = new DomainError(409, 'X', 'x', { requestId: 'FORGED' });
    expect(envelopeOf(e, '/p', 'T', 'req-000007').requestId).toBe('req-000007');
  });

  it('is absent — not undefined-valued — when none was supplied', () => {
    const env = envelopeOf(new DomainError(409, 'X', 'x'), '/p', 'T');
    expect('requestId' in env).toBe(false);
  });
});
