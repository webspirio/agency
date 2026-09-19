// mocks/driver-report/src/components/office/StatTile.tsx
/** Label 13/600 → value mono 28/600 → one to three consequence lines (§4.1, C-01; at most three tiles on a page).
 *
 *  The consequence lines are the criterion, not an extra: §8.3 C-01 #2 asks that every tile say what FOLLOWS from
 *  the number, and that none of them says «зателефонуйте». A tile that shows only a count is a number nobody can
 *  act on, which is what the office already has in BAS.
 *
 *  The value is mono because it is data, and it stays `--ink` in every tone but `hold`: a count is not a warning
 *  until a rule in `src/domain` says so, and the accent is never a status (D10). */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import type { Tone } from '../../domain/types';

const VALUE: Record<Tone, string> = {
  plain: 'text-ink',
  hold: 'text-hold',
  reject: 'text-reject',
  muted: 'text-text-2',
};

export function StatTile({
  label,
  value,
  consequence,
  tone = 'plain',
}: {
  label: string;
  value: string;
  consequence: string[];
  tone?: Tone;
}): JSX.Element {
  return (
    <div data-tone={tone} className="card-ring px-[20px] py-[16px]">
      <p className="text-[13px] leading-[1.3] font-semibold text-text-2">{label}</p>
      <p className={cn('mt-[6px] font-mono text-[28px] leading-[1.15] font-semibold tracking-[-0.02em]', VALUE[tone])}>
        {value}
      </p>
      {consequence.length === 0 ? null : (
        <div className="mt-[8px] flex flex-col gap-[2px]">
          {consequence.map((line, index) => (
            <p key={`${index}:${line}`} className="text-[13px] leading-[1.45] text-text-2">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
