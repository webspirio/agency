import { describe, it, expect } from 'vitest';
import { stampFx } from './fx';

describe('stampFx', () => {
  it('computes base once, at write, and stores it alongside the rate', () => {
    expect(stampFx('100.00', 'EUR', '47.8032')).toEqual({
      amount: '100.00', ccy: 'EUR', rate: '47.8032', base: '4780.32',
    });
  });

  it('keeps a scale-4 rate at scale 4 — a scale-2 validator would have thrown here', () => {
    expect(stampFx('1.00', 'EUR', '47.8032').rate).toBe('47.8032');
  });

  it('does not move when the rate later moves — base is a stored value', () => {
    const march = stampFx('100.00', 'EUR', '40.0000');
    const today = stampFx('100.00', 'EUR', '47.8032');
    expect(march.base).toBe('4000.00');
    expect(today.base).toBe('4780.32');
  });

  it('rejects a malformed rate', () => {
    expect(() => stampFx('1.00', 'EUR', '')).toThrow(/decimal/);
  });
});
