// mocks/driver-report/src/components/driver/ChipRow.tsx
/** One full-width 4rem row of a driver list: the problem sheet's «Тривога / укриття», «Поломка», «Об'їзд» (§3.3
 *  D-11), the place list of «Я в іншому місці», the reasons of «Немає документа». Icon 1.5rem, word 1.125rem/600,
 *  one column — never two, because two 48 % targets at 130 % text are two half-missed taps. */
import type { JSX } from 'react';
import type { LucideIcon } from 'lucide-react';

export function ChipRow({ icon: Icon, label, onPress, dark = false }: {
  icon: LucideIcon;
  label: string;
  onPress(): void;
  dark?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`flex h-tap-lg w-full items-center gap-3 rounded-[12px] px-4 text-left ${
        dark ? '' : 'tap-ring'
      }`}
      style={{
        color: dark ? 'var(--cam-ink)' : 'var(--ink)',
        boxShadow: dark ? 'inset 0 0 0 1px var(--cam-line-strong)' : undefined,
      }}
    >
      <Icon aria-hidden="true" className="size-[1.5rem] shrink-0" />
      <span className="min-w-0 truncate text-[1.125rem] leading-[1.5rem] font-semibold">{label}</span>
    </button>
  );
}
