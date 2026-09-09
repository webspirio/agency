import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useThemePreference } from './lib/theme';
import { Button } from './button';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * LIFT NOTE — upstream these three strings came from `useTranslation()`. The
 * kit carries no i18n runtime, so they arrive as a `labels` prop with English
 * defaults.
 */
export interface ThemeToggleLabels {
  /** Accessible name of the button. */
  label: string;
  /** Title shown while a press would switch TO light. */
  light: string;
  /** Title shown while a press would switch TO dark. */
  dark: string;
}

const DEFAULT_LABELS: ThemeToggleLabels = { label: 'Theme', light: 'Light', dark: 'Dark' };

/** Live `prefers-color-scheme: dark` — what a 'system' preference resolves to right now. */
function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DARK_QUERY);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

/**
 * Header control for the theme: ONE button that flips light ⇄ dark — no
 * menu, no third state to pick. The store still starts at 'system' (so a
 * fresh browser follows the OS); the toggle reads what that resolves to and
 * writes the OPPOSITE explicit preference, after which the choice sticks.
 * It only writes `useThemePreference`; `useAppTheme` (mounted once by
 * AppLayout) is what actually toggles the `.dark` class on <html>.
 *
 * `aria-pressed` = «dark is on»; the icon shows what a press will switch TO
 * (sun while dark, moon while light), the usual convention.
 */
export function ThemeToggle({
  className,
  labels,
}: {
  className?: string;
  labels?: Partial<ThemeToggleLabels>;
}) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const preference = useThemePreference((s) => s.preference);
  const setPreference = useThemePreference((s) => s.setPreference);
  const systemDark = useSystemPrefersDark();
  const isDark = preference === 'system' ? systemDark : preference === 'dark';
  const next = isDark ? 'light' : 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={text.label}
      aria-pressed={isDark}
      title={text[next]}
      className={className}
      onClick={() => setPreference(next)}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
