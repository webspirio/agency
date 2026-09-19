// mocks/driver-report/src/domain/fuel.test.ts
import { describe, expect, it } from 'vitest';
import { deviation, fullToFull, normLitres, overTolerance, per100, tkm } from './fuel';

describe('fuel (§7.3, §4.2 C-08, C-13)', () => {
  it('computes l/100 by decimal arithmetic and refuses a zero distance', () => {
    expect(per100('250.00' as never, 786)).toBe('31.8');
    expect(per100('250.00' as never, 0)).toBeNull();
  });
  it('computes full-to-full between two full fills', () => {
    expect(fullToFull([{ value: 411612, litres: '198.00' as never, full: true }, { value: 412398, litres: '250.00' as never, full: true }]))
      .toEqual({ rate: '31.8', km: 786, litres: '250.00', windows: 1 });
    expect(fullToFull([{ value: 412398, litres: '250.00' as never, full: true }])).toBeNull();
  });
  it('rounds the deviation to one place', () => {
    expect([deviation('31.8', '32.0'), deviation('33.9', '32.0'), deviation('1200.1', '1132.8')]).toEqual(['-0.6', '5.9', '5.9']);
  });
  it('holds a deviation beyond the 5 % tolerance only', () => {
    expect([overTolerance('5.9'), overTolerance('3.4'), overTolerance('5.0'), overTolerance(null)]).toEqual([true, false, false, false]);
  });
  it('computes the norm and t·km', () => {
    expect(normLitres(3540, '32.0')).toBe('1132.80');
    expect([tkm('24.400', 59), tkm('12.400', 116)]).toEqual(['1439.6', '1438.4']);
  });
});

describe('fuel — the edges the demo figures do not reach', () => {
  it('spans several windows: counts every fill after the first full one up to the last full one', () => {
    // 900 and 2000 are partial fills outside the span; 1300 is a partial fill inside it and its litres count.
    const fills = [
      { value: 900, litres: '40.00' as never, full: false },
      { value: 1000, litres: '100.00' as never, full: true },
      { value: 1300, litres: '50.00' as never, full: false },
      { value: 1600, litres: '140.00' as never, full: true },
      { value: 1900, litres: '90.00' as never, full: true },
      { value: 2000, litres: '30.00' as never, full: false },
    ];
    expect(fullToFull(fills)).toEqual({ rate: '31.1', km: 900, litres: '280.00', windows: 2 });
  });
  it('gives no rate when the pumps saw no distance, or none full', () => {
    expect(fullToFull([{ value: 412398, litres: '198.00' as never, full: true }, { value: 412398, litres: '12.00' as never, full: true }])).toBeNull();
    expect(fullToFull([{ value: 411612, litres: '198.00' as never, full: false }, { value: 412398, litres: '250.00' as never, full: false }])).toBeNull();
    expect(fullToFull([])).toBeNull();
  });
  it('compares litres to litres the same way: the R+C day «+0,9 %» (C-08)', () => {
    expect(deviation('86.2', '85.4')).toBe('0.9');
    expect(deviation('32.0', '32.0')).toBe('0.0');
  });
  it('rounds the deviation ONCE: 1252,4 л against 1234,5 л is +1,44998… %, which is 1,4 and not 1,5', () => {
    // Rounding to four places first turns 1.44998 into 1.4500, and the second half-up then makes it 1.5 — the
    // two-roundings error @agency/dec's own div() documents. Measured: the four-place formula gives '1.5' / '-1.5'.
    expect([deviation('1252.4', '1234.5'), deviation('1216.6', '1234.5')]).toEqual(['1.4', '-1.4']);
  });
  it('reads the tolerance strictly, and only upward', () => {
    expect([overTolerance('5.1'), overTolerance('-6.0'), overTolerance('3.4', '3.0'), overTolerance('3.0', '3.0')])
      .toEqual([true, false, true, false]);
  });
});
