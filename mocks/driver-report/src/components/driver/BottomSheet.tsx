// mocks/driver-report/src/components/driver/BottomSheet.tsx
/** The driver route's one sheet (§6.8): light, radius 18 at the top, 240 ms in from the bottom edge. It is the kit's
 *  `Drawer` rather than a hand-rolled overlay, so Escape, the outside press and the focus trap are radix's and not a
 *  second implementation of them.
 *
 *  `DrawerBareContent` rather than `DrawerContent`: the kit's preset geometry is a desktop sheet with a grabber, and
 *  this one owns its own. It also opts out of radix's "Dialog needs a description" warning, which is right here —
 *  the sheet's content IS the description.
 *
 *  A sheet is never used for connectivity (§8.6 #10); it carries a choice the driver asked for. */
import type { JSX, ReactNode } from 'react';
import { Drawer, DrawerBareContent, DrawerOverlay, DrawerPortal, DrawerTitle } from '@agency/kit/drawer';

export function BottomSheet({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}): JSX.Element {
  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerBareContent
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[18px] bg-label text-ink duration-[240ms] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
          style={{ boxShadow: 'var(--elev-2)' }}
        >
          <div
            className="mx-auto flex w-full max-w-[35rem] flex-col gap-3 px-gutter pt-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <DrawerTitle className="text-[1.25rem] leading-[1.625rem] font-semibold">{title}</DrawerTitle>
            {children}
          </div>
        </DrawerBareContent>
      </DrawerPortal>
    </Drawer>
  );
}
