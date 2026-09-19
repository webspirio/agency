// mocks/driver-report/src/components/driver/StatusLine.tsx
/** The status grammar of §6.6, as one component: a 4 × 24 px rule in the tone colour, a 1.25rem icon and a 1rem/600
 *  word. Three things say the same thing, so a grayscale screenshot keeps every state readable and colour is never
 *  carrying it alone (§8.5).
 *
 *  Three tones, and no more (§8.6 #6): `plain` (ink), `hold` (ochre) and `muted`. There is no accent tone — the accent
 *  advances state, it never reports one — and no brick on the driver route (§8.6 #4).
 *
 *  `extra` is the second half of a two-tone line: «В офісі ✓ 08:41» plain, «· фото 1 з 4 ще в телефоні» hold. It is a
 *  node rather than a string because the ReceiptCard also hangs its «Повернути» button there.
 *
 *  `live` marks the line as `aria-live="polite"`: the ReceiptCard's line changes under the driver's eyes and a screen
 *  reader must say so without stealing focus. */
import type { JSX, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronRight, Clock, CloudOff, CloudUpload, Undo2 } from 'lucide-react';
import type { ReceiptState, SyncState } from '../../app/outbox';

type Tone = 'plain' | 'hold' | 'muted';

/** `ReceiptState`/`SyncState` name their icon as a STRING, because they are computed in `src/app/outbox.ts` and a
 *  component is not importable from there. This is the one place the name becomes a component; both the ReceiptCard
 *  and the SyncStrip read it, so there is one table rather than two that drift. */
export const STATUS_ICON: Record<ReceiptState['icon'] | SyncState['icon'], LucideIcon> = {
  Check,
  Clock,
  CloudOff,
  CloudUpload,
  Undo2,
};

const INK: Record<Tone, string> = {
  plain: 'var(--ink)',
  hold: 'var(--hold)',
  muted: 'var(--text-2)',
};

export function StatusLine({ tone, icon: Icon, text, extra, onPress, live = false }: {
  tone: Tone;
  icon: LucideIcon;
  text: string;
  extra?: ReactNode;
  onPress?(): void;
  live?: boolean;
}): JSX.Element {
  const ink = INK[tone];
  const body = (
    <>
      <span
        aria-hidden="true"
        className="block h-[24px] w-[4px] shrink-0 rounded-[2px]"
        style={{ background: ink }}
      />
      <Icon aria-hidden="true" className="size-[1.25rem] shrink-0" style={{ color: ink }} />
      <span className="min-w-0 text-[1rem] leading-[1.375rem] font-semibold" style={{ color: ink }}>
        {text}
        {extra}
      </span>
    </>
  );
  if (onPress === undefined) {
    return (
      <div className="flex w-full items-center gap-2" {...(live ? { 'aria-live': 'polite' as const } : {})}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPress}
      {...(live ? { 'aria-live': 'polite' as const } : {})}
      className="flex min-h-tap w-full items-center gap-2 rounded-[12px] text-left"
    >
      {body}
      <ChevronRight aria-hidden="true" className="ml-auto size-[1.25rem] shrink-0" style={{ color: 'var(--text-2)' }} />
    </button>
  );
}
