// mocks/driver-report/src/components/office/review/CorrectionDialog.tsx
/** «Виправити» (§4.2 C-05): change a value, KEEP the original, by the right person, with a reason (ст.9 ч.7).
 *
 *  Four things make this dialog the one screen where the office is allowed to overwrite a driver:
 *
 *  1. THE ORIGINAL SURVIVES. The Reading says so before the click — «Оригінал лишиться закресленим: ~~318 405~~ →
 *     381 405 · одруківка · Н. Шевчук» — and the row afterwards says so again. Nothing here deletes.
 *  2. THE DRIVER IS TOLD, IN HIS WORDS. The second Reading quotes exactly what his phone will show («число
 *     виправлено за фото щитка» · Згоден / Не згоден), so the operator can see that the office's reason and the
 *     driver's sentence are two different texts and that he gets the gentler one (D-02).
 *  3. A REASON IS REQUIRED. «Зберегти виправлення» stays disabled until a chip is chosen — §8.3 C-05 #1 — because a
 *     correction without a reason is indistinguishable from a typo by the office.
 *  4. NO BACKDROP BLUR. The operator is comparing the digits on the dash photo with the digits in the field; a
 *     blurred backdrop is exactly the wrong effect on a screen whose job is reading a number off a photograph, so
 *     the overlay is a flat scrim and §8.3 C-05 #2 asserts it.
 *
 *  The photo is brightened and contrast-lifted rather than left raw: a dash at 05:41 is a dark photograph, and the
 *  office is being asked to read six digits out of it. The caption says the picture has been changed, because an
 *  operator who does not know that would read the brightness as evidence about the photo.
 *
 *  The VALUE ON THE WIRE is the raw digits, never the grouped string: `createCorrection` declares `VALUE_INVALID` as
 *  «Лише цифри, до 7 знаків.» and the field is grouped for the eye only. */
import { useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Button } from '@agency/kit/button';
import { Dialog, DialogDescription, DialogPortal, DialogTitle } from '@agency/kit/dialog';
import { fmtKm } from '../../../app/format';
import { codeOf } from '../../../api/contract';
import { useCreateCorrection } from '../../../api/hooks';
import { useWriteOnce } from '../../../app/once';
import { SAYS_CORRECTION } from '../../../api/says';
import { allRows } from '../../../api/stores';
import { server } from '../../../api/server';
import { DC } from '../../../copy/driver';
import { OC } from '../../../copy/office';
import type { CorrectionView } from '../../../domain/dto';
import { toInt } from '../../../domain/num';
import { CORRECTION_REASONS, type CorrectionReason } from '../../../domain/types';
import { ACTOR } from '../../../profiles';
import { ReasonChips } from './ReasonChips';

const REASONS: { value: CorrectionReason; label: string }[] =
  CORRECTION_REASONS.map((value) => ({ value, label: OC.correctionReasons[value] }));

const digitsOf = (v: string | null): string => (v ?? '').replace(/\D/g, '').slice(0, 7);
const grouped = (digits: string): string => (digits === '' ? '' : fmtKm(toInt(digits)));
/** Who is signing this correction. The console's actor is `'user-' + login` (§7.8), as the handlers resolve it. */
function actingShort(): string {
  return allRows(server.stores.officeUsers).find((u) => `user-${u.login}` === ACTOR.id)?.short_name ?? '';
}

export function CorrectionDialog({ open, onOpenChange, target, onSaved }: {
  open: boolean;
  onOpenChange(o: boolean): void;
  target: { record_key: string; title: string; context: string; current: string; expected: string | null; photo: ReactNode };
  onSaved(c: CorrectionView): void;
}): JSX.Element {
  const [digits, setDigits] = useState(() => digitsOf(target.expected ?? target.current));
  const [reason, setReason] = useState<CorrectionReason | null>(null);
  const [note, setNote] = useState('');
  const [refused, setRefused] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const save = useCreateCorrection();

  const by = actingShort();
  const current = grouped(digitsOf(target.current));
  const expected = target.expected === null ? null : grouped(digitsOf(target.expected));

  /** `save.isPending` is state, so it is still false for a second click inside the same React batch — measured as
   *  two corrections in `never.office.test.tsx` (§8.6 #13, `src/app/once.ts`). */
  const once = useWriteOnce();
  const submit = (): void => {
    if (reason === null || digits === '') return;
    const body = { record_key: target.record_key, field: 'odometer' as const, value: digits, reason,
      ...(note === '' ? {} : { note }) };
    if (!once.claim(JSON.stringify(body))) return;
    setRefused(null);
    save.mutate(
      body,
      {
        onSettled: () => { once.release(); },
        onSuccess: (view) => {
          onSaved(view);
          onOpenChange(false);
        },
        onError: (err) => {
          const code = codeOf('createCorrection', err);
          setRefused(code === undefined ? 'Не вдалося зберегти — спробуйте ще раз.' : SAYS_CORRECTION[code]);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* `bg-scrim` is §4.2 C-05's flat `rgb(16 22 26 / .45)` as a token (index.css), never a literal and never
            blurred: the kit's own DialogOverlay carries `supports-backdrop-filter:backdrop-blur-xs`, which is the
            wrong effect on a screen whose job is reading a number off a photograph (§8.3 C-05 #2). */}
        <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            field.current?.focus();
            field.current?.select();
          }}
          style={{ boxShadow: 'var(--ring-card), var(--elev-2)' }}
          className={
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] w-[720px] max-w-[calc(100%-32px)] -translate-x-1/2 '
            + '-translate-y-1/2 flex-col overflow-y-auto rounded-[18px] bg-label text-ink '
            // §4.2 C-05: full-screen on a phone. Not a `card-ring` + `rounded-none` pair — two utilities of the same
            // property sort by Tailwind's order, not by the order they are written, so the radius is set outright.
            + 'max-[719px]:top-0 max-[719px]:left-0 max-[719px]:h-dvh max-[719px]:max-h-dvh max-[719px]:w-dvw max-[719px]:max-w-none '
            + 'max-[719px]:translate-x-0 max-[719px]:translate-y-0 max-[719px]:rounded-none'
          }
        >
          <header className="flex flex-col gap-[4px] px-[24px] pt-[24px]">
            <DialogTitle className="font-sans text-[18px] leading-[1.3] font-semibold tracking-normal text-ink">{target.title}</DialogTitle>
            <DialogDescription className="text-[14px] leading-[1.45] text-text-2">{target.context}</DialogDescription>
          </header>

          <div className="grid grid-cols-1 gap-[20px] px-[24px] py-[20px] min-[720px]:grid-cols-2">
            <div className="flex flex-col gap-[6px]">
              <div className="overflow-hidden rounded-[12px] bg-bench" style={{ filter: 'brightness(1.15) contrast(1.1)' }}>
                {target.photo}
              </div>
              <p className="text-[12px] leading-[1.35] text-text-2">збільшено й освітлено</p>
            </div>

            <div className="flex flex-col gap-[14px]">
              <p className="text-[14px] leading-[1.45] text-ink">
                {expected === null ? `Зараз: ${current}` : `Зараз: ${current} · очікували ~${expected}`}
              </p>

              <div className="flex flex-col gap-[4px]">
                <label htmlFor={fieldId} className="text-[13px] leading-[1.3] text-text-2">Нове значення, км</label>
                <input
                  id={fieldId}
                  ref={field}
                  inputMode="numeric"
                  autoComplete="off"
                  value={grouped(digits)}
                  onChange={(e) => setDigits(digitsOf(e.target.value))}
                  className="h-[44px] w-[180px] rounded-[8px] border border-line-strong bg-label px-[12px] font-mono text-[20px] leading-none text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </div>

              <ReasonChips
                options={REASONS}
                value={reason === null ? [] : [reason]}
                onChange={(v) => setReason(v[0] ?? null)}
              />

              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Нотатка для офісу — водій її не побачить"
                aria-label="Нотатка для офісу — водій її не побачить"
                className="resize-none rounded-[8px] border border-line-strong bg-label px-[12px] py-[8px] text-[14px] leading-[1.45] text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />

              {reason === null ? null : (
                <div className="flex flex-col gap-[6px]">
                  <p className="text-[13px] leading-[1.45] text-text-2">
                    Оригінал лишиться закресленим: <s className="text-text-2">{current}</s>
                    {` → ${grouped(digits)} · ${OC.correctionReasons[reason].toLowerCase()} · ${by}`}
                  </p>
                  <p className="text-[13px] leading-[1.45] text-text-2">
                    {`Водій побачить: «${DC.correctionWording[reason]}» · Згоден / Не згоден`}
                  </p>
                </div>
              )}

              {refused === null ? null : <p className="text-[13px] leading-[1.45] text-reject">{refused}</p>}
            </div>
          </div>

          <footer className="flex items-center justify-end gap-[8px] border-t border-line/70 px-[24px] py-[16px]">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-[36px] text-[14px]">
              Скасувати
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={reason === null || digits === '' || save.isPending}
              className="h-[36px] text-[14px]"
            >
              Зберегти виправлення
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
