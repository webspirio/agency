import { describe, it, expect, vi } from 'vitest';
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

describe('all', () => {
  it('exposes every profile in declared order, so the switcher can render them', () => {
    expect(P.all.map((d) => d.id)).toEqual(['custody', 'fleet', 'solo']);
  });
});

describe('the profile also lives in the hash, because the app uses createHashRouter', () => {
  it('reads ?profile= out of the hash query segment', () => {
    expect(P.resolve('', undefined, '#/dashboard?profile=fleet').id).toBe('fleet');
  });

  it('lets the hash win over the search — the hash is the URL the router owns', () => {
    expect(P.resolve('?profile=custody', undefined, '#/x?profile=fleet').id).toBe('fleet');
  });

  it('falls through to the search when the hash carries no profile', () => {
    expect(P.resolve('?profile=fleet', undefined, '#/x?tab=1').id).toBe('fleet');
  });

  it('reads the ambient location.hash, so every mock inherits the fix without changing its call', () => {
    vi.stubGlobal('location', { search: '', hash: '#/x?profile=fleet' });
    try {
      expect(P.resolve('').id).toBe('fleet');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('an empty ?profile= must never shadow VITE_PROFILE', () => {
  it('falls through to the env when the query param is present but empty', () => {
    expect(P.resolve('?profile=', 'fleet').id).toBe('fleet');
  });

  it('falls through from an empty hash profile too', () => {
    expect(P.resolve('', 'fleet', '#/x?profile=').id).toBe('fleet');
  });

  it('still falls back to the default when nothing is set anywhere', () => {
    expect(P.resolve('?profile=', '').id).toBe('custody');
  });
});

describe('href under a hash router', () => {
  it('writes the profile into the hash query when there is a hash route', () => {
    expect(P.href('', 'fleet', '#/reports')).toBe('#/reports?profile=fleet');
  });

  it('keeps the other hash params and drops a stale search profile, so the two cannot disagree', () => {
    expect(P.href('?profile=custody&point=p1', 'fleet', '#/reports?tab=2&profile=custody'))
      .toBe('?point=p1#/reports?tab=2&profile=fleet');
  });

  it('is unchanged when there is no hash at all', () => {
    expect(P.href('?point=p1&profile=custody', 'fleet')).toBe('?point=p1&profile=fleet');
  });
});
