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
    expect([...ids].sort()).toEqual(ids);
  });
});
