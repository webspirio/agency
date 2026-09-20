// mocks/driver-report/src/pages/office/day/DayFooter.tsx
/** The truck-day's action footer (§4.2 C-08): sticky, 72 px, the consequence on the left and the one thing to do on
 *  the right.
 *
 *  THE CONSEQUENCE IS THE LEFT HALF OF THE BUTTON. «Підтвердити день» on its own asks the office to take an
 *  irreversible step without saying what becomes irreversible; beside «Після підтвердження день стане лише для
 *  читання і піде у файл для BAS» it is a decision. After confirmation the same slot carries the stamp — the view's
 *  own `consequence`, «Підтверджено Н. Шевчук 21.09 16:06» — so there is exactly ONE place on the page that says who
 *  confirmed and when, and nothing to keep in step with it.
 *
 *  ONE NUMBER PER DAY, EVEN ON A DOUBLE CLICK (04 EC-137). `useCommitOnce` fires on the first call and ignores every
 *  later one; the ref survives the re-render the mutation causes, which `disabled` alone would not — a second click
 *  can land before React has painted the busy state. The page remounts this component on `view.version`, so a day
 *  that CHANGED under the operator (`DAY_CHANGED`) gets a fresh guard and can be confirmed again after re-reading it;
 *  a day that did not change keeps the spent one, which is exactly the case the guard exists for.
 *
 *  With an open flag the primary asks its reason first: «Підтвердити з позначкою» reveals the three chips of §4.2
 *  C-08 and only then commits, so a flagged day cannot be confirmed without the office saying why it is acceptable.
 *
 *  «Закрити КЕП» is rendered DISABLED rather than hidden. A button nobody can press but everybody can read is how
 *  this screen says «the qualified signature is a decision КТЛ has not taken yet» — hiding it would leave the office
 *  wondering whether the product forgot about it. */
import { useState, type JSX } from 'react';
import { Button } from '@agency/kit/button';
import { Lock, Printer } from 'lucide-react';
import { Link } from 'react-router';
import { useCommitOnce } from '../../../app/flow';
import { ReasonChips } from '../../../components/office/review';
import { OC } from '../../../copy/office';
import type { ResolveReason } from '../../../domain/types';

const REASONS: { value: ResolveReason; label: string }[] = [
  { value: 'DOC_TODAY', label: OC.resolveReasons.DOC_TODAY },
  { value: 'DRIVER_EXPLAINED', label: OC.resolveReasons.DRIVER_EXPLAINED },
  { value: 'NOT_A_PROBLEM', label: OC.resolveReasons.NOT_A_PROBLEM },
];

const KEP_NOTE = 'Запрацює, коли КТЛ затвердить електронний лист наказом.';

export function DayFooter({ consequence, flagsOpen, confirmed, printTo, onConfirm }: {
  consequence: string;
  flagsOpen: number;
  confirmed: boolean;
  printTo: string;
  onConfirm(reason: string | null): void;
}): JSX.Element {
  const once = useCommitOnce();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<ResolveReason[]>([]);
  const flagged = flagsOpen !== 0;

  const commit = (): void => {
    once.run(() => onConfirm(reason[0] ?? null));
  };

  return (
    <div className="sticky bottom-0 z-10 mt-[16px] flex flex-col gap-[10px] border-t border-line bg-label px-[20px] py-[14px]">
      {asking && !confirmed ? (
        <ReasonChips<ResolveReason> options={REASONS} value={reason} onChange={setReason} />
      ) : null}
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-[16px]">
        <p className="min-w-0 max-w-[64ch] text-[14px] leading-[1.45] text-ink">{consequence}</p>
        {confirmed ? (
          <div className="flex flex-wrap items-center gap-[12px]">
            <Button asChild size="lg">
              <Link to={printTo}>
                <Printer aria-hidden="true" />
                Друкувати подорожній лист
              </Link>
            </Button>
            <div className="flex flex-col gap-[2px]">
              <Button variant="outline" size="lg" disabled>
                <Lock aria-hidden="true" />
                Закрити КЕП — після наказу КТЛ
              </Button>
              <span className="text-[12px] leading-[1.35] text-text-2">{KEP_NOTE}</span>
            </div>
          </div>
        ) : (
          <Button
            size="lg"
            disabled={once.busy}
            onClick={() => {
              if (!flagged) return commit();
              if (!asking) return setAsking(true);
              if (reason.length !== 0) commit();
            }}
          >
            {flagged ? 'Підтвердити з позначкою' : 'Підтвердити день'}
          </Button>
        )}
      </div>
    </div>
  );
}
