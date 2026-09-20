// mocks/driver-report/src/pages/office/lanes/SampleDialog.tsx
/** «Звірити» — the SAMPLE_CHECK dialog of §4.2 C-03 [T2]: the day's photographed readings, side by side with what
 *  the office already believes.
 *
 *  It is deliberately the THIN half of the spec's sentence. The sample item names no record — `target.record_key` is
 *  null on both the pilot's sample and the fleet example's — so the dialog can show the evidence the item carries and
 *  answer the one question the operator actually has: does the number on the photo match the number in the day?
 *  «Збігається» closes the item with `NOT_A_PROBLEM`; «Виправити» hands over to the correction dialog, and is only
 *  offered when there IS a record to correct. A button that opened an empty correction would be worse than absent. */
import type { JSX } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Button } from '@agency/kit/button';
import { Dialog, DialogDescription, DialogPortal, DialogTitle } from '@agency/kit/dialog';
import type { ExceptionItem } from '../../../domain/dto';
import { Artefact } from '../../../components/artefacts';

export function SampleDialog({ open, onOpenChange, item, onMatches, onFix }: {
  open: boolean;
  onOpenChange(o: boolean): void;
  item: ExceptionItem;
  onMatches(): void;
  onFix(): void;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(16_22_26/.45)]" />
        <DialogPrimitive.Content
          className="card-ring fixed top-1/2 left-1/2 z-50 flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-[16px] bg-paper p-[20px]"
          aria-describedby={undefined}
        >
          <DialogTitle className="text-[18px] leading-[1.3] font-semibold text-ink">Звірити з фото</DialogTitle>
          <DialogDescription className="sr-only">{item.title}</DialogDescription>
          <p className="text-[14px] leading-[1.45] text-ink">{item.title}</p>
          <p className="text-[13px] leading-[1.45] text-text-2">{item.meta}</p>
          {item.evidence === null ? null : item.evidence.kind === 'thumb'
            ? <Artefact variant={item.evidence.variant} size="view" className="self-start" />
            : <p className="text-[13px] leading-[1.45] text-ink">{item.evidence.text}</p>}
          <div className="flex flex-wrap items-center justify-end gap-[8px]">
            {item.target.record_key === null ? null : (
              <Button type="button" variant="ghost" className="h-[36px] text-[14px]" onClick={onFix}>
                Виправити
              </Button>
            )}
            <Button type="button" variant="outline" className="h-[36px] text-[14px]" onClick={onMatches}>
              Збігається
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
