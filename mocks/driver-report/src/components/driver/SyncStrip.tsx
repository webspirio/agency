// mocks/driver-report/src/components/driver/SyncStrip.tsx
/** The one place the phone says where the day's records are (§3.3 D-02, §6.6). It is a 3.5rem card and NOT a button:
 *  there is nothing to do about it, so offering a tap would only invite one. It is never a modal either — a modal for
 *  connectivity is §8.6 #10 — and it never predicts when the office will see anything.
 *
 *  `aria-live="polite"` sits on the card, because the strip changes by itself while the driver reads something else
 *  (§8.5). */
import type { JSX } from 'react';
import type { SyncState } from '../../app/outbox';
import { STATUS_ICON, StatusLine } from './StatusLine';

export function SyncStrip({ state }: { state: SyncState }): JSX.Element {
  return (
    <div aria-live="polite" className="card-ring flex min-h-tap items-center px-3">
      <StatusLine tone={state.tone} icon={STATUS_ICON[state.icon]} text={state.text} />
    </div>
  );
}
