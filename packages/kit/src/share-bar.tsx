import { cn } from './lib/cn';

/** Small horizontal proportion bar with a 2px gap between fills. */
export function ShareBar({
  parts,
  className,
}: {
  parts: { value: number; color: string; label: string }[];
  className?: string;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className={cn('flex h-2 w-full gap-[2px] overflow-hidden', className)}>
      {parts.map((p, i) => (
        <div
          key={i}
          title={p.label}
          className="h-full rounded-[2px] first:rounded-l-full last:rounded-r-full"
          // oxlint-disable-next-line agency/no-float-arithmetic -- a CSS width percentage. Covers both operations on this line; the share bar renders proportions, it does not compute money.
          style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
        />
      ))}
    </div>
  );
}
