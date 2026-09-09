import { useState } from 'react';
import { cn } from './lib/cn';
import {
  SUPPORTED_LANGUAGES,
  getStoredLanguage,
  storeLanguage,
  type SupportedLanguage,
} from './lib/language-preference';
import { Segmented } from './segmented';

/**
 * LIFT NOTE — upstream this component read the active locale from i18next
 * (`i18n.resolvedLanguage`), wrote it with `i18n.changeLanguage()`, and took its
 * option labels from `t('lang.*')`. The kit carries no i18n runtime, so:
 *   - the locale is a controlled `value`/`onChange` pair, falling back to the
 *     persisted preference when the caller does not drive it;
 *   - the strings arrive as a `labels` prop with English defaults.
 * `language-preference` itself came across unchanged — it is plain localStorage
 * with no i18next in it.
 */
export interface LanguageSwitcherLabels {
  /** Accessible name of the control. */
  label: string;
  /** Text of each locale's segment, keyed by locale code. */
  options: Record<SupportedLanguage, string>;
}

const DEFAULT_LABELS: LanguageSwitcherLabels = {
  label: 'Language',
  options: { uk: 'UK', en: 'EN' },
};

interface LanguageSwitcherProps {
  className?: string;
  /** The active locale. Omit to run uncontrolled off the stored preference. */
  value?: SupportedLanguage;
  /** Called with the picked locale. The choice is persisted either way. */
  onChange?: (code: SupportedLanguage) => void;
  labels?: Partial<LanguageSwitcherLabels>;
}

/**
 * Language segmented control. Manual choices are persisted
 * (language-preference) so they win on the next launch.
 *
 * Renders nothing while only one locale is configured — a visible switcher with
 * a single option is a dead control. It starts rendering again the moment a
 * second entry is added to `SUPPORTED_LANGUAGES`.
 *
 * Built on the shared `<Segmented>` primitive so it gets the focus ring,
 * roving-tabindex keyboard navigation and the discrete-pick interaction for
 * free instead of re-deriving them.
 */
export function LanguageSwitcher({ className, value, onChange, labels }: LanguageSwitcherProps) {
  const text = { ...DEFAULT_LABELS, ...labels, options: { ...DEFAULT_LABELS.options, ...labels?.options } };
  const [stored, setStored] = useState<SupportedLanguage>(
    () => getStoredLanguage() ?? SUPPORTED_LANGUAGES[0],
  );

  if (SUPPORTED_LANGUAGES.length <= 1) return null;

  const active = value ?? stored;
  const set = (code: SupportedLanguage) => {
    storeLanguage(code);
    setStored(code);
    onChange?.(code);
  };
  const options = SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: text.options[code] }));

  return (
    <Segmented
      options={options}
      value={active}
      onChange={set}
      label={text.label}
      size="sm"
      fit="content"
      // Both call sites are absolutely positioned overlays sized to their
      // content — override Segmented's default `w-full` so it doesn't stretch
      // to the positioned ancestor's full width.
      className={cn('w-auto', className)}
    />
  );
}
