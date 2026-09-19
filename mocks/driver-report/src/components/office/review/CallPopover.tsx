// mocks/driver-report/src/components/office/review/CallPopover.tsx
/** The driver's number, where the office can take it (§4.2 C-02 «Подзвонити»).
 *
 *  The console is a desk, not a phone: there is no `tel:` here, because on the machine this runs on it would open
 *  nothing, and on the stage it would open something in front of a client. So the popover does the two things a desk
 *  actually needs — the number large enough to dial from across the keyboard (mono 20 px, so a 7 and a 1 cannot be
 *  confused), and one button that puts it on the clipboard for a softphone.
 *
 *  «Скопійовано» stays until the popover closes rather than fading on a timer: a timer that outlives the popover is
 *  a state update into an unmounted tree, and the operator has already looked away by then anyway. */
import { useState, type JSX, type ReactNode } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Button } from '@agency/kit/button';
import { copyToClipboard } from '@agency/kit/lib/clipboard';

export function CallPopover({ phone, children }: { phone: string; children: ReactNode }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <PopoverPrimitive.Root
      onOpenChange={(o) => {
        if (!o) setCopied(false);
      }}
    >
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="popover-content"
          align="start"
          sideOffset={8}
          className="card-ring z-50 flex items-center gap-[12px] p-[16px]"
        >
          <span className="font-mono text-[20px] leading-none whitespace-nowrap text-ink">{phone}</span>
          <Button
            type="button"
            variant="outline"
            className="h-[36px] text-[14px]"
            onClick={() => {
              void copyToClipboard(phone);
              setCopied(true);
            }}
          >
            {copied ? 'Скопійовано' : 'Копіювати'}
          </Button>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
