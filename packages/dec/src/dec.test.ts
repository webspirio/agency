import { describe, it, expect } from 'vitest';
import { add, sub, mul, div, sum, cmp, gt, lt, isZero, isNegative, round } from './dec';

describe('parsing', () => {
  it('rejects anything that is not a plain decimal', () => {
    for (const bad of ['1e3', '', ' 1', '1.2.3', 'NaN', '0x10', '+1']) {
      expect(() => add(bad, '0')).toThrow(/decimal/);
    }
  });
});

describe('add / sub — scale 2 by default', () => {
  it('does not go through a float', () => {
    expect(add('0.10', '0.2')).toBe('0.30'); // 0.1 + 0.2 === 0.30000000000000004 in floats
    expect(add('140.00', '-5')).toBe('135.00');
    expect(sub('1.05', '1.05')).toBe('0.00');
    expect(sub('1.00', '2.50')).toBe('-1.50');
  });
});

describe('mul — half-up AWAY FROM ZERO, operands may differ in scale', () => {
  it('rounds the scale-4 product back to scale 2', () => {
    expect(mul('2.50', '1.005')).toBe('2.51');
    expect(mul('-2.50', '1.005')).toBe('-2.51'); // away from zero, not toward positive
  });
  it('multiplies a scale-2 amount by a scale-4 FX rate', () => {
    expect(mul('100.00', '47.8032')).toBe('4780.32');
  });
  it('can return a higher-scale product when asked', () => {
    expect(mul('1.5', '1.5', 4)).toBe('2.2500');
  });
});

describe('div — a decimal split over a whole count', () => {
  it('matches the semantics already shipped in yagoda-starter', () => {
    expect(div('126.40', 2)).toBe('63.20');
    expect(div('1.00', 8)).toBe('0.13');
    expect(div('3.00', 8)).toBe('0.38');
    expect(div('10.00', 3)).toBe('3.33');
  });
  it('refuses a non-integer or zero divisor', () => {
    expect(() => div('1.00', 0)).toThrow(/non-zero integer/);
    expect(() => div('1.00', 2.5)).toThrow(/non-zero integer/);
  });
});

describe('sum — rounded per line then summed', () => {
  it('totals the printed lines', () => {
    expect(sum(['10944.00', '1827.00', '0.50'])).toBe('12771.50');
    expect(sum([])).toBe('0.00');
  });
});

describe('cmp — numeric, never lexicographic', () => {
  it('orders 9 before 10, which a string sort does not', () => {
    expect(cmp('9.00', '10.00')).toBe(-1);
    expect(['9.00', '10.00'].sort()).toEqual(['10.00', '9.00']); // the bug this exists to prevent
    expect(cmp('10', '10.00')).toBe(0);
    expect(gt('0.01', '0')).toBe(true);
    expect(lt('-0.01', '0')).toBe(true);
    expect(isZero('0.00')).toBe(true);
    expect(isNegative('-0.01')).toBe(true);
  });
});

describe('round', () => {
  it('rescales half-up away from zero', () => {
    expect(round('2.345', 2)).toBe('2.35');
    expect(round('-2.345', 2)).toBe('-2.35');
    expect(round('2.344', 2)).toBe('2.34');
    expect(round('2', 4)).toBe('2.0000');
  });
});
