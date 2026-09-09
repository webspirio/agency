import { describe, it, expect } from 'vitest';
import golden from '../golden.json' with { type: 'json' };
import * as dec from './index';

type Case = { op: 'add' | 'sub' | 'mul'; a: string; b: string; scale: number; expected: string };

describe('golden parity fixture', () => {
  it('has at least 200 cases so the backend money module can be asserted against it later', () => {
    expect((golden as Case[]).length).toBeGreaterThanOrEqual(200);
  });

  it.each(golden as Case[])('$op($a, $b, $scale) === $expected', ({ op, a, b, scale, expected }) => {
    expect(dec[op](a, b, scale)).toBe(expected);
  });
});
