// mocks/driver-report/src/components/driver/LightPage.tsx
/** Every driver screen that is NOT the camera and NOT home: a `DriverScreen` with a `FlowHeader` on top, the body
 *  scrolling under it and an optional `ActionBar` stuck to the bottom (§3.1).
 *
 *  It exists so a flow step is one component and a step's own file contains only its content — the header, the step
 *  rail, the column width and the safe-area padding are decided once, here, and cannot drift from screen to screen.
 *
 *  The body is KEYED on the step index and carries `cl-label`, which is the «step enter» of §6.8: 200 ms,
 *  translateY 10 px → 0, no blur. Keyed rather than animated in place because the incoming step is a different
 *  subtree and an animation that does not remount simply never replays. `prefers-reduced-motion` turns it off in
 *  `index.css`, globally, so there is no second switch here. */
import type { JSX, ReactNode } from 'react';
import { DriverScreen } from './DriverScreen';
import { FlowHeader } from './FlowHeader';

export function LightPage({ title, step, onBack, children, bar }: {
  title: string;
  step?: { index: number; total: number };
  onBack(): void;
  children: ReactNode;
  bar?: ReactNode;
}): JSX.Element {
  return (
    <DriverScreen header={<FlowHeader title={title} step={step} onBack={onBack} />} bar={bar}>
      <div key={step === undefined ? 'one' : step.index} className="cl-label flex w-full flex-col gap-3">
        {children}
      </div>
    </DriverScreen>
  );
}
