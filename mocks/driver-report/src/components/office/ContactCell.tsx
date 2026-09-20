// mocks/driver-report/src/components/office/ContactCell.tsx
/** When the office last heard from a phone, and what was still in it then (§4.1, C-01).
 *
 *  «щойно» · «2 хв» · «2 год 42 хв · тоді в телефоні 3». The second half is the whole point: a gap is only worrying
 *  if something was WAITING at the last contact, and the number is what was unsent at that moment — not now, which
 *  the office cannot know. It goes hold after two hours («Без зв'язку», §6.6), and the caller decides that, because
 *  staleness is a rule of `src/domain` and this is a component.
 *
 *  Unknown renders «—», never «0» (§0.1): a truck the office has never heard from has no elapsed time to show.
 *
 *  THE LINE WRAPS. It used to be `whitespace-nowrap`, and under `table-layout: auto` that is what made «Зв'язок»
 *  take 203 px of a 690 px pane and push «Парк зараз» 106 px past the panel that clips it (W3-06, §8.6 #22). The
 *  column is a share now, so a sentence that does not fit takes two lines instead of taking the table with it. The
 *  elapsed time itself is short; it is «· тоді в телефоні 3» that is the second line. */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import type { Instant } from '@agency/mock';
import { minutesBetween } from '../../domain/clock';
import { fmtAgo } from '../../app/format';

export function ContactCell({ at, unsent, stale, now }: { at: Instant | null; unsent: number; stale: boolean; now: Instant }): JSX.Element {
  if (at === null) return <span className="text-[14px] text-text-2">—</span>;
  const ago = fmtAgo(minutesBetween(at, now));
  const line = unsent === 0 ? ago : `${ago} · тоді в телефоні ${unsent}`;
  return (
    <span className={cn('text-[14px] leading-[1.35]', stale ? 'text-hold' : 'text-ink')}>{line}</span>
  );
}
