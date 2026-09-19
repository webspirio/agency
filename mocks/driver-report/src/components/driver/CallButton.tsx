// mocks/driver-report/src/components/driver/CallButton.tsx
/** «Подзвонити — Ірина Коваленко, диспетчер» (§3.3 D-11). The name and the role are IN the label: a phone icon alone
 *  tells a driver who has two numbers nothing.
 *
 *  It is a `tel:` link on a touch phone outside the stage, and a button everywhere else. That is not a nicety — a
 *  desktop follows `tel:` into FaceTime or Skype, and during a demo that opens on the shared screen in front of the
 *  client (§3.3 D-11, §8.6 #14). Off a phone it opens a sheet with the number in mono 1.75rem, big enough to dial by
 *  hand, and «Закрити». */
import type { JSX } from 'react';
import { useState } from 'react';
import { Phone } from 'lucide-react';
import { IS_STAGE, IS_TOUCH } from '../../app/device';
import { BottomSheet } from './BottomSheet';
import { QuietButton } from './QuietButton';

export function CallButton({ person, phone }: {
  person: { name: string; role: string };
  phone: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const label = `Подзвонити — ${person.name}, ${person.role}`;
  const shell = 'tap-ring flex min-h-tap w-full items-center justify-center gap-2 rounded-[12px] px-3';
  const inner = (
    <>
      <Phone aria-hidden="true" className="size-[1.25rem] shrink-0" />
      <span className="min-w-0 truncate text-[1.125rem] leading-[1.5rem] font-semibold">{label}</span>
    </>
  );

  if (IS_TOUCH && !IS_STAGE) {
    return (
      <a href={`tel:${phone.replaceAll(' ', '')}`} className={shell} style={{ color: 'var(--ink)' }}>
        {inner}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); }} className={shell}>{inner}</button>
      <BottomSheet
        open={open}
        title={`${person.name}, ${person.role}`}
        onClose={() => { setOpen(false); }}
      >
        <p className="py-2 font-mono text-[1.75rem] leading-[2.25rem] font-medium">{phone}</p>
        <QuietButton label="Закрити" onPress={() => { setOpen(false); }} />
      </BottomSheet>
    </>
  );
}
