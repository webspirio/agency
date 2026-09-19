// mocks/driver-report/src/components/office/review/RequestPopover.tsx
/** «Попросити перезняти» (§4.2 C-06): a structured request instead of a phone call.
 *
 *  A popover anchored to the photo's own button, not a dialog, because the operator is choosing WHY THIS PHOTO is
 *  unusable and must keep looking at it while deciding. The reasons are a closed, multi-select set of five, and
 *  «Не видно підпису» is deliberately NOT among them [DSP-8]: a missing signature is not something a retake can fix,
 *  and offering it would send the driver back to the dock for nothing.
 *
 *  The Reading is the promise the request makes on the driver's behalf — «Водій побачить на найближчій зупинці, не в
 *  дорозі» — and it is here rather than in the driver app because the person who needs convincing that the phone
 *  will not buzz at 90 km/h is the dispatcher about to press the button.
 *
 *  A SECOND request on the same record is refused, not queued: `REQUEST_ALREADY_OPEN` carries who asked, when, and
 *  where it got to, and `fillSays` renders those from the envelope's ctx — «Уже запитано: Н. Шевчук 08:43 · побачив
 *  08:43». Reading a ctx is not branching (HARD RULE 5); the branch is on `code` alone. */
import { useState, type JSX, type ReactNode } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Button } from '@agency/kit/button';
import { codeOf } from '../../../api/contract';
import { useCreateRequest } from '../../../api/hooks';
import { fillSays, SAYS_REQUEST } from '../../../api/says';
import { OC } from '../../../copy/office';
import type { PageView, RequestView } from '../../../domain/dto';
import { RETAKE_REASONS, type RetakeReason } from '../../../domain/types';
import { ReasonChips } from './ReasonChips';

const REASONS: { value: RetakeReason; label: string }[] =
  RETAKE_REASONS.map((value) => ({ value, label: OC.retakeReasons[value] }));

export function RequestPopover({ page, context, children, onSent }: {
  page: PageView;
  context: string;
  children: ReactNode;
  onSent(r: RequestView): void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<RetakeReason[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const send = useCreateRequest();

  const words = reasons.map((r) => OC.retakeReasons[r].toLowerCase()).join(', ');

  const submit = (): void => {
    if (reasons.length === 0) return;
    setRefused(null);
    send.mutate(
      { type: 'RETAKE_PHOTO', record_key: page.record_key, page_key: page.key, reasons },
      {
        onSuccess: (view) => {
          onSent(view);
          setOpen(false);
        },
        onError: (err) => {
          const code = codeOf('createRequest', err);
          setRefused(code === undefined ? 'Не вдалося надіслати — спробуйте ще раз.' : fillSays(SAYS_REQUEST[code], err));
        },
      },
    );
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReasons([]);
          setRefused(null);
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="popover-content"
          align="start"
          sideOffset={8}
          className="card-ring z-50 flex w-[420px] max-w-[calc(100vw-32px)] flex-col gap-[12px] p-[16px]"
        >
          <p className="text-[15px] leading-[1.35] font-semibold text-ink">Попросити перезняти</p>
          <p className="text-[13px] leading-[1.4] text-text-2">{`${page.caption} · ${context}`}</p>
          <ReasonChips options={REASONS} value={reasons} multi onChange={setReasons} />
          <p className="text-[13px] leading-[1.45] text-text-2">
            {`Водій побачить на найближчій зупинці, не в дорозі: «Диспетчер просить перезняти: ${page.caption} — ${words === '' ? '…' : words}»`}
          </p>
          {refused === null ? null : <p className="text-[13px] leading-[1.45] text-reject">{refused}</p>}
          <div className="flex items-center justify-end gap-[8px]">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-[36px] text-[14px]">
              Скасувати
            </Button>
            <Button type="button" onClick={submit} disabled={reasons.length === 0 || send.isPending} className="h-[36px] text-[14px]">
              Надіслати водію
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
