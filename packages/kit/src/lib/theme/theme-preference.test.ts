import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { themeStorageKey } from './theme-preference';

/** Not a literal: the key is per-app now, so a test that spelled one out would
 *  agree with itself and with nothing else. */
const KEY = themeStorageKey();

async function freshStore() {
  const mod = await import('./theme-preference');
  return mod.useThemePreference;
}

describe('theme-preference store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => localStorage.clear());

  it('defaults to system when nothing is stored', async () => {
    const store = await freshStore();
    expect(store.getState().preference).toBe('system');
  });

  it('initialises from a stored value', async () => {
    localStorage.setItem(KEY, 'dark');
    const store = await freshStore();
    expect(store.getState().preference).toBe('dark');
  });

  it('setPreference updates state and persists', async () => {
    const store = await freshStore();
    store.getState().setPreference('light');
    expect(store.getState().preference).toBe('light');
    expect(localStorage.getItem(KEY)).toBe('light');
  });

  it('ignores an invalid stored value, falling back to system', async () => {
    localStorage.setItem(KEY, 'chartreuse');
    const store = await freshStore();
    expect(store.getState().preference).toBe('system');
  });
});
