// mocks/driver-report/src/domain/refusals.test.ts
import { describe, expect, it } from 'vitest';
import { badOdometer, badTime, dayConfirmed } from './refusals';

describe('office refusals are pure rules over values (§7.5)', () => {
  it('a time is four digits, at most 2359', () => {
    expect([badTime('0748'), badTime('2359')]).toEqual([null, null]);
    expect([badTime('748')?.code, badTime('2460')?.code, badTime('07:48')?.code]).toEqual(['VALUE_INVALID', 'VALUE_INVALID', 'VALUE_INVALID']);
  });
  it('an odometer is one to seven digits', () => {
    expect([badOdometer('381405'), badOdometer('12345678')?.code, badOdometer('381 405')?.code]).toEqual([null, 'VALUE_INVALID', 'VALUE_INVALID']);
  });
  it('a confirmed day refuses changes', () => {
    expect([dayConfirmed({ status: 'CONFIRMED' })?.code, dayConfirmed({ status: 'READY' })]).toEqual(['DAY_CONFIRMED', null]);
  });
});
