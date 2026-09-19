// mocks/driver-report/src/components/driver/HoldCard.tsx
/** The card that asks for something without refusing anything (§3.3 D-02): «Потрібно від вас (2)», «Офіс виправив
 *  …», the deferred-capture reminder, the revoked-device notice. A 4 px ochre rule down its leading edge, a minimum
 *  of 4rem, and — when it leads somewhere — the WHOLE card is the button, because a 4rem card with a 2rem link
 *  inside it is a target the spec does not allow (§8.5).
 *
 *  Ochre, never brick: the driver route has no reject tone (§8.6 #4). */
import type { JSX, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function HoldCard({ icon: Icon, title, body, thumb, onPress, children }: {
  icon: LucideIcon;
  title: string;
  body?: string;
  thumb?: ReactNode;
  onPress?(): void;
  children?: ReactNode;
}): JSX.Element {
  const inner = (
    <div className="flex min-h-[4rem] w-full items-center gap-3 py-3 pr-3 pl-4">
      <Icon aria-hidden="true" className="size-[1.5rem] shrink-0" style={{ color: 'var(--hold)' }} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px] text-left">
        <span className="text-[1.125rem] leading-[1.5rem] font-semibold">{title}</span>
        {body === undefined ? null : (
          <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{body}</span>
        )}
        {children}
      </span>
      {thumb}
    </div>
  );
  const shell = 'card-ring relative overflow-hidden w-full';
  const rule = (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-[4px]"
      style={{ background: 'var(--hold)' }}
    />
  );
  if (onPress === undefined) {
    return <div className={shell}>{rule}{inner}</div>;
  }
  return (
    <button type="button" onClick={onPress} className={`${shell} text-left`}>
      {rule}
      {inner}
    </button>
  );
}
