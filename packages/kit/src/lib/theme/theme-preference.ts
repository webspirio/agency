import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * The key when a host sets no `data-theme-key`. A LAST RESORT, not a default to
 * rely on: every mock `agency new` writes carries the attribute, and
 * `packages/cli/src/template.test.ts` asserts it does.
 */
const FALLBACK_KEY = 'agency-kit:theme';

/**
 * The localStorage key this store reads and writes, scoped to the app that is
 * running — read from `<html data-theme-key="…">`, which `agency new` fills in
 * with the mock's slug.
 *
 * It used to be a hardcoded `web-starter:theme`. One key, shared by every mock
 * served from one origin: harmless in production, where each slug gets its own
 * Worker, and wrong on `localhost:5173`, which is where every mock is reviewed
 * before a client ever sees it — flip one mock to dark and the next one opens
 * dark too.
 *
 * Read per call rather than captured at module load so a test (and a host that
 * mounts two apps) can change it, and because the attribute is the ONE place
 * the key is written: `index.html`'s paint-0 script reads the same attribute,
 * and that agreement is the entire point of the inline script.
 */
export function themeStorageKey(): string {
  try {
    return document.documentElement.dataset.themeKey || FALLBACK_KEY;
  } catch {
    // No document at all (SSR, a node test) — nothing can be persisted anyway.
    return FALLBACK_KEY;
  }
}

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const isPreference = (v: string | null): v is ThemePreference =>
  v != null && (PREFERENCES as readonly string[]).includes(v);

function getStored(): ThemePreference {
  try {
    const v = localStorage.getItem(themeStorageKey());
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
        localStorage.setItem(themeStorageKey(), preference);
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
