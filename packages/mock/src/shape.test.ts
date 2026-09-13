import { describe, expect, it } from 'vitest';
import { check, s, shape } from './shape';

/**
 * MEASURED 2026-09-13 against a freshly scaffolded mock, through the real adapter:
 * `POST /parties` with `{}` answered **500** `Internal server error`, where the
 * product's global ValidationPipe answers 400 with one sentence per failed field. A
 * forged `id` was accepted with 201 and silently ignored, where `forbidNonWhitelisted`
 * answers 400. The sentences below are class-validator's own wording, because the
 * point is to emit the product's BYTES, not to validate well.
 */
describe('shape emits what a Nest ValidationPipe emits, not what is convenient', () => {
  const body = shape({ name: s.str(), balance: s.dec2(), note: s.opt(s.str()) });

  it('accepts a body that satisfies every field', () => {
    expect(check(body, { name: 'A', balance: '1.00' })).toEqual([]);
  });

  it('reports ONE SENTENCE PER FAILED FIELD, in declaration order', () => {
    // `message` is an ARRAY for a validation failure and a STRING for everything
    // else. packages/mock/src/api-error.ts already reads exactly that shape into
    // `details`, so a screen mapping field errors works unchanged after conversion.
    expect(check(body, {})).toEqual(['name must be a string', 'balance must be a string']);
  });

  it('refuses an unknown property, because forbidNonWhitelisted is on in the product', () => {
    expect(check(body, { name: 'A', balance: '1.00', id: 'forged' })).toEqual([
      'property id should not exist',
    ]);
  });

  it('accepts an absent optional and refuses a present-but-wrong one', () => {
    expect(check(body, { name: 'A', balance: '1.00' })).toEqual([]);
    expect(check(body, { name: 'A', balance: '1.00', note: 4 })).toEqual([
      'note must be a string',
    ]);
  });

  it('says a decimal string is a string, never a number', () => {
    // HARD RULE 3 on the wire: money is a decimal string on both sides of the seam.
    expect(check(body, { name: 'A', balance: 1 })).toEqual(['balance must be a string']);
  });

  it('refuses a decimal string that is not two places', () => {
    expect(check(body, { name: 'A', balance: '1.5' })).toEqual([
      'balance must be a decimal string with two places',
    ]);
  });

  it('refuses a non-object body outright, rather than throwing', () => {
    expect(check(body, null)).toEqual(['body must be an object']);
    expect(check(body, 'nope')).toEqual(['body must be an object']);
  });

  it('reports EVERY failure, not the first — a form shows all its errors at once', () => {
    expect(check(body, { balance: 1, id: 'x' })).toEqual([
      'name must be a string',
      'balance must be a string',
      'property id should not exist',
    ]);
  });
});
