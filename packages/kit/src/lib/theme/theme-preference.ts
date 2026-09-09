import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'web-starter:theme';
const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const isPreference = (v: string | null): v is ThemePreference =>
  v != null && (PREFERENCES as readonly string[]).includes(v);

function getStored(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return isPreference(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

type Store = {
  <T>(selector: (s: ThemeStore) => T): T;
  getState(): ThemeStore;
  setState(partial: Partial<ThemeStore>): void;
  subscribe(listener: () => void): () => void;
};

/**
 * The upstream file was a `zustand` create() call. zustand is not a dependency
 * of this workspace and adding one is out of scope for the lift, so the store is
 * the same three-line contract — `useStore(selector)`, `getState`, `setState` —
 * over React's own `useSyncExternalStore`. Same external API, same tests.
 */
function createThemeStore(): Store {
  const listeners = new Set<() => void>();
  let state: ThemeStore = {
    preference: getStored(),
    setPreference: (preference) => {
      try {
        localStorage.setItem(KEY, preference);
      } catch {
        /* storage disabled — ignore */
      }
      store.setState({ preference });
    },
  };

  const store = (<T,>(selector: (s: ThemeStore) => T): T =>
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => selector(state),
      () => selector(state),
    )) as Store;

  store.getState = () => state;
  store.setState = (partial) => {
    state = { ...state, ...partial };
    // Snapshot: a listener may unsubscribe while being called.
    for (const listener of Array.from(listeners)) listener();
  };
  store.subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return store;
}

export const useThemePreference = createThemeStore();
