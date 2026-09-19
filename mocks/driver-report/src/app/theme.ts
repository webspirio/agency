// mocks/driver-report/src/app/theme.ts
/** Light by default on every surface, and nothing ever follows the OS (D15, §6.3).
 *
 *  The kit's store owns the preference and `useAppTheme` (mounted by the scaffold-owned `main.tsx`) owns the `.dark`
 *  class; this module owns neither — two owners of one class is a flicker. It only (1) turns the kit's 'system'
 *  default into an explicit 'light', so `useAppTheme` never consults `prefers-color-scheme`, and (2) keeps
 *  `<meta name="theme-color">` in step with the choice. The key is already per profile: the paint-0 script in
 *  `index.html` sets `data-theme-key="driver-report:theme:<profile>"` before any module reads it. */
import { useCallback, useEffect } from 'react';
import { useThemePreference } from '@agency/kit/lib/theme';

const META_DARK = '#0b1013';
const META_LIGHT = '#eef0f1';

function paintMeta(dark: boolean): void {
  try {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? META_DARK : META_LIGHT);
  } catch {
    /* no document (a node test) — nothing to paint */
  }
}

/** First run: a stored 'system' (the kit's default) becomes 'light'. An explicit 'dark' or 'light' is kept. */
export function ensureLightDefault(): void {
  const state = useThemePreference.getState();
  if (state.preference === 'system') state.setPreference('light');
}

/** The «Світла | Темна» switch: dark only when the viewer chose it. Also sets the browser chrome's theme-color. */
export function useDarkTheme(): { dark: boolean; setDark(dark: boolean): void } {
  const dark = useThemePreference((s) => s.preference) === 'dark';
  useEffect(() => { paintMeta(dark); }, [dark]);
  const setDark = useCallback((next: boolean) => {
    useThemePreference.getState().setPreference(next ? 'dark' : 'light');
    paintMeta(next);
  }, []);
  return { dark, setDark };
}
