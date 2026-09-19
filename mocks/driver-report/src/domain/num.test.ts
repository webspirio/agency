// mocks/driver-report/src/domain/num.test.ts
import { describe, expect, it } from 'vitest';
import { between, cmpNum, differingDigits, gt, gte, intDiv, lt, lte, toInt } from './num';

describe('num', () => {
  it('compares integers without relational operators', () => {
    expect([gt(2, 1), gt(1, 1), gte(1, 1), lt(0, 1), lte(2, 1), cmpNum(3, 5)]).toEqual([true, false, true, true, false, -1]);
    expect([between(5, 5, 8), between(9, 5, 8)]).toEqual([true, false]);
  });
  it('divides whole numbers and refuses what is not one', () => {
    expect([intDiv(642, 60), intDiv(59, 60), intDiv(0, 60)]).toEqual([10, 0, 0]);
    expect(() => intDiv(5, 0)).toThrow();
    expect(() => intDiv(-5, 2)).toThrow();
  });
  it('parses digit strings and refuses anything else', () => {
    expect([toInt('412355'), toInt('-5')]).toEqual([412355, -5]);
    expect(() => toInt('412 355')).toThrow('toInt: "412 355" is not an integer');
    expect(() => toInt('1.5')).toThrow();
  });
  it('names the digit positions two readings disagree on', () => {
    expect(differingDigits(412866, 412566)).toEqual([3]);
    expect(differingDigits(412866, 412561)).toEqual([3, 5]);
    expect(differingDigits(99999, 100000)).toEqual([]);
  });
});
