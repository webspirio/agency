// mocks/driver-report/src/app/theme.test.ts
import { describe, expect, it } from 'vitest';
import { useThemePreference } from '@agency/kit/lib/theme';
import { ensureLightDefault } from './theme';

describe('light is the default and nothing follows the OS (D15)', () => {
  it('turns a stored "system" into "light"', () => {
    useThemePreference.getState().setPreference('system');
    ensureLightDefault();
    expect(useThemePreference.getState().preference).toBe('light');
  });
  it('keeps an explicit dark choice', () => {
    useThemePreference.getState().setPreference('dark');
    ensureLightDefault();
    expect(useThemePreference.getState().preference).toBe('dark');
  });
});
