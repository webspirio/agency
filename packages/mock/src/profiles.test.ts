import { describe, it, expect } from 'vitest';
import { createProfiles } from './profiles';

const P = createProfiles(
  [
    { id: 'custody', label: 'Cargo custody', caps: ['custody'] },
    { id: 'fleet', label: 'Fleet & money', caps: ['fleet', 'money'] },
    { id: 'solo', label: 'Just the numbers', caps: ['money'] },
  ] as const,
  'custody',
);

describe('resolve', () => {
  it('reads ?profile= first', () => {
    expect(P.resolve('?profile=fleet').id).toBe('fleet');
  });

  it('falls back to VITE_PROFILE when the query is absent', () => {
    expect(P.resolve('', 'solo').id).toBe('solo');
  });

  it('prefers the query over the env', () => {
    expect(P.resolve('?profile=fleet', 'solo').id).toBe('fleet');
  });

  it('is case-insensitive', () => {
    expect(P.resolve('?profile=FLEET').id).toBe('fleet');
  });

  it('falls back for an unknown id rather than throwing mid-demo', () => {
    expect(P.resolve('?profile=nope').id).toBe('custody');
    expect(P.resolve('').id).toBe('custody');
  });
});

describe('capsOf', () => {
  it('returns the capability set the adapter gates on', () => {
    expect(P.capsOf(P.resolve('?profile=fleet'))).toEqual(new Set(['fleet', 'money']));
  });

  it('gives solo money but not fleet, so the fleet routes 404 for it', () => {
    const caps = P.capsOf(P.resolve('?profile=solo'));
    expect(caps.has('money')).toBe(true);
    expect(caps.has('fleet')).toBe(false);
  });
});

describe('href — rewriting the current URL for sharing', () => {
  it('adds the profile when absent', () => {
    expect(P.href('', 'fleet')).toBe('?profile=fleet');
  });

  it('replaces an existing profile, preserving other params', () => {
    expect(P.href('?point=p1&profile=custody', 'fleet')).toBe('?point=p1&profile=fleet');
  });
});
