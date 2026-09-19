// mocks/driver-report/src/components/office/Panel.tsx
/** The console's one container (§4.1): `card-ring` — radius 18, `--ring-card`, `--elev-1` — with NO padding of its
 *  own, because what it holds is usually a table that must reach both edges.
 *
 *  Head 56 px: title 15/600, hint 13 px `--text-2`, and a right slot for a mono counter or a 36 px ghost button.
 *  Footer note 13 px behind a 14 px icon — the "why" sentence, which is the thing that makes a console page teach
 *  instead of merely list. Both are optional and neither renders as an empty bar when it has nothing to say. */
import type { JSX, ReactNode } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { Info } from 'lucide-react';

export function Panel({
  title,
  hint,
  right,
  footer,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const head = title !== undefined || hint !== undefined || right !== undefined;
  return (
    <section className={cn('card-ring overflow-hidden', className)}>
      {head ? (
        <header className="flex h-[56px] items-center justify-between gap-[16px] border-b border-line/70 px-[20px] py-[14px]">
          <div className="flex min-w-0 items-baseline gap-[10px]">
            {title === undefined ? null : <h2 className="truncate text-[15px] leading-[1.35] font-semibold text-ink">{title}</h2>}
            {hint === undefined ? null : <p className="truncate text-[13px] text-text-2">{hint}</p>}
          </div>
          {right === undefined ? null : <div className="flex shrink-0 items-center gap-[8px]">{right}</div>}
        </header>
      ) : null}
      {children}
      {footer === undefined ? null : (
        <footer className="flex items-start gap-[8px] border-t border-line/70 px-[20px] py-[12px] text-[13px] leading-[1.45] text-text-2">
          <Info size={14} aria-hidden="true" className="mt-[3px] shrink-0" />
          <div className="min-w-0">{footer}</div>
        </footer>
      )}
    </section>
  );
}
