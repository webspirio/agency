// mocks/driver-report/src/components/driver/QuietButton.tsx
/** The secondary action of a driver screen (§3.1, §6.5): 3.5rem, outlined with `tap-ring` rather than filled, so the
 *  accent stays unique. `tone: 'hold'` is for a secondary that carries an ochre consequence; there is no reject tone
 *  on the driver route (§8.6 #4).
 *
 *  `half` puts two of them side by side in one ActionBar row («Мій день» / «Ще»). */
import type { JSX } from 'react';
import type { LucideIcon } from 'lucide-react';

export function QuietButton({ icon: Icon, label, onPress, tone = 'plain', dark = false, half = false }: {
  icon?: LucideIcon;
  label: string;
  onPress(): void;
  tone?: 'plain' | 'hold';
  dark?: boolean;
  half?: boolean;
}): JSX.Element {
  const ink = dark ? 'var(--cam-ink)' : tone === 'hold' ? 'var(--hold)' : 'var(--ink)';
  return (
    <button
      type="button"
      onClick={onPress}
      className={`flex min-h-tap items-center justify-center gap-2 rounded-[12px] px-3 ${
        half ? 'w-full flex-1' : 'w-full'
      } ${dark ? '' : 'tap-ring'}`}
      style={{
        color: ink,
        boxShadow: dark ? 'inset 0 0 0 1px var(--cam-line-strong)' : undefined,
      }}
    >
      {Icon === undefined ? null : <Icon aria-hidden="true" className="size-[1.25rem] shrink-0" />}
      <span className="min-w-0 truncate text-[1.125rem] leading-[1.5rem] font-semibold">{label}</span>
    </button>
  );
}
