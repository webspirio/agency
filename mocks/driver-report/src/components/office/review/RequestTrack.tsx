// mocks/driver-report/src/components/office/review/RequestTrack.tsx
/** What happened to a request after it was sent (§4.2 C-04, C-06): «надіслано 08:43 → на телефоні 08:43 → побачив
 *  08:43 → виконано 08:44».
 *
 *  Four moments, not a status word. «Надіслано» and «на телефоні» are different facts — the first is the office's,
 *  the second the phone's — and the gap between them is the only honest answer to «why has he not done it yet»:
 *  §4.2 C-06 spells the two unanswered cases out («ще не на телефоні — телефон без зв'язку з 08:57», «не побачив 2
 *  год»), and both arrive here already worded, in `unseen_line`, because whether two hours have passed is a rule of
 *  `src/domain` and this is a component.
 *
 *  ONE ELEMENT, ONE SENTENCE. The steps are not four spans: Testing Library reads an element's DIRECT text children,
 *  so a line split across spans cannot be asked for as the sentence it is — and it is the sentence, not the spans,
 *  that both this kit's test and C-04's screen assert. That costs the per-step weight §4.2 gives the current step;
 *  the line carries `data-current` instead, and the mono face runs the whole way so the four times still line up. */
import type { JSX } from 'react';
import { fmtTime } from '../../../app/format';
import type { RequestView } from '../../../domain/dto';

type StepKey = 'sent' | 'delivered' | 'seen' | 'done' | 'cancelled';
const WORD: Record<StepKey, string> = {
  sent: 'надіслано',
  delivered: 'на телефоні',
  seen: 'побачив',
  done: 'виконано',
  cancelled: 'скасовано',
};
const ORDER: readonly StepKey[] = ['sent', 'delivered', 'seen', 'done', 'cancelled'];

export function RequestTrack({ request }: { request: RequestView }): JSX.Element {
  const reached = ORDER.flatMap((k) => {
    const at = request.states[k];
    return at === null ? [] : [{ key: k, text: `${WORD[k]} ${fmtTime(at)}` }];
  });
  const current = reached.at(-1)?.key ?? 'sent';
  return (
    <div className="flex flex-col gap-[3px]">
      <p data-current={current} className="font-mono text-[13px] leading-[1.45] text-ink">
        {reached.map((s) => s.text).join(' → ')}
      </p>
      {request.unseen_line === null ? null : <p className="text-[13px] leading-[1.4] text-hold">{request.unseen_line}</p>}
    </div>
  );
}
