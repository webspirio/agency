// mocks/driver-report/src/api/shapes.test.ts
import { describe, expect, it } from 'vitest';
import { check } from '@agency/mock';
import { int, obj, oneOf, strs } from './shapes';

describe('body rules in class-validator wording (§7.4)', () => {
  it('int()', () => {
    expect(check({ seq: int() }, { seq: 417 })).toEqual([]);
    expect(check({ seq: int() }, { seq: '417' })).toEqual(['seq must be an integer number']);
  });
  it('oneOf()', () => {
    expect(check({ type: oneOf(['A', 'B']) }, { type: 'C' })).toEqual(['type must be one of the following values: A, B']);
  });
  it('obj()', () => {
    expect(check({ payload: obj() }, { payload: [] })).toEqual(['payload must be an object']);
  });
  it('strs()', () => {
    expect(check({ reasons: strs() }, { reasons: ['BLUR'] })).toEqual([]);
    expect(check({ reasons: strs() }, { reasons: 'BLUR' })).toEqual(['reasons must be an array']);
    expect(check({ reasons: strs() }, { reasons: [1] })).toEqual(['each value in reasons must be a string']);
  });
});
