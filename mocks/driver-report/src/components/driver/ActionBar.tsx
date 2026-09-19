// mocks/driver-report/src/components/driver/ActionBar.tsx
/** Everything the driver is required to touch lives here, stuck to the bottom of the viewport in the thumb zone
 *  (§3.1). Rows stack with a 0.5rem gap; the bottom padding carries `env(safe-area-inset-bottom)` so the last row
 *  clears the home indicator.
 *
 *  Sticky, not fixed: at 130 % text the bar grows to ~290 px and a fixed bar would simply cover the scroll area
 *  instead of pushing it (§3.1, EC-78). */
import type { JSX, ReactNode } from 'react';

export function ActionBar({ children, dark = false }: { children: ReactNode; dark?: boolean }): JSX.Element {
  return (
    <div
      className={`sticky bottom-0 z-20 shrink-0 ${dark ? 'bg-cam-surface' : 'bg-label'}`}
      style={{
        boxShadow: `inset 0 1px 0 ${dark ? 'var(--cam-ring)' : 'var(--line)'}`,
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
      }}
    >
      <div className="mx-auto flex w-full max-w-[35rem] flex-col gap-2 px-gutter pt-3">{children}</div>
    </div>
  );
}
