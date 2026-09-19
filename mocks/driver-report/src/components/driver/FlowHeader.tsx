// mocks/driver-report/src/components/driver/FlowHeader.tsx
/** The header of every driver FLOW (§3.1): a 3rem Back button, the flow's name, the step count in sentence case, and
 *  under them a 0.375rem step rail of one cell per step.
 *
 *  The rail is the driver route's whole sense of progress — there is no caps eyebrow here, and the count reads «2 з 5»
 *  rather than «КРОК 2/5». `step.index` is 0-based, so the count is `index + 1`.
 *
 *  Every cell carries `data-rail-cell="done" | "current" | "future"`: the state is in the DOM, not only in a colour,
 *  so a test can read it and a grayscale screenshot keeps it. */
import type { JSX } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DC } from '../../copy/driver';

type Cell = 'done' | 'current' | 'future';

const cellStyle = (cell: Cell): { background: string; boxShadow?: string } => {
  if (cell === 'done') return { background: 'var(--accent-ink)' };
  if (cell === 'current') return { background: 'var(--bench)', boxShadow: 'inset 0 0 0 2px var(--accent-ink)' };
  return { background: 'var(--bench)' };
};

export function FlowHeader({ title, step, dark = false, onBack }: {
  title: string;
  step?: { index: number; total: number };
  dark?: boolean;
  onBack(): void;
}): JSX.Element {
  const muted = dark ? 'var(--cam-text-2)' : 'var(--text-2)';
  const cells: Cell[] = step === undefined
    ? []
    : Array.from({ length: step.total }, (_unused, i) => (i < step.index ? 'done' : i === step.index ? 'current' : 'future'));
  return (
    <header
      className={`sticky top-0 z-20 shrink-0 ${dark ? 'bg-cam-surface text-cam-ink' : 'bg-label text-ink'}`}
      style={{ boxShadow: `inset 0 -1px 0 ${dark ? 'var(--cam-ring)' : 'var(--line)'}` }}
    >
      <div className="mx-auto flex h-[3.5rem] w-full max-w-[35rem] items-center gap-1 pr-gutter pl-1">
        <button
          type="button"
          aria-label={DC.back}
          onClick={onBack}
          className="grid size-[3rem] shrink-0 place-items-center rounded-[10px]"
        >
          <ArrowLeft aria-hidden="true" className="size-[1.5rem]" />
        </button>
        <span className="min-w-0 truncate text-[1.125rem] leading-[1.5rem] font-semibold">{title}</span>
        {step === undefined ? null : (
          <span className="ml-auto shrink-0 pl-2 font-mono text-[0.875rem] font-medium" style={{ color: muted }}>
            {step.index + 1} з {step.total}
          </span>
        )}
      </div>
      {cells.length === 0 ? null : (
        <div className="mx-auto flex w-full max-w-[35rem] gap-[4px] px-gutter pb-2">
          {cells.map((cell, i) => (
            <span
              key={i}
              data-rail-cell={cell}
              className="h-[0.375rem] min-w-[0.5rem] flex-1 rounded-[3px]"
              style={cellStyle(cell)}
            />
          ))}
        </div>
      )}
    </header>
  );
}
