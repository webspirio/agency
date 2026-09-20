// mocks/driver-report/src/stage/PhoneFrame.tsx
/** A phone, drawn around an iframe (§5.3).
 *
 *  The bezel is not decoration. The audience has to read a 360 px screen from across a room and believe it is the
 *  thing in a driver's hand: the 24 px status bar with the SERVER clock, the signal and the battery is what makes
 *  «Офлайн» legible as a phone losing the network rather than as a web page changing colour — offline drops «LTE»
 *  and swaps `Signal` for `SignalZero`, and that is the only difference anybody needs to name.
 *
 *  All three phones stay mounted, always. The two that are not framed sit in place with `visibility: hidden` and no
 *  pointer events (§5.1), so switching is instant and neither pane reloads, reseeds, or loses the screen it was
 *  left on. `src` is read ONCE, in state, because «Такт» reloads the frame imperatively through the hub and a
 *  re-render that re-declared the same attribute would fight it (see hub.ts). */
import { useCallback, useState, type JSX } from 'react';
import { BatteryMedium, Signal, SignalZero } from 'lucide-react';
import { fmtTime } from '../app/format';
import type { Instant } from '../domain/types';
import { phoneSrc, type Hub, type StagePhone } from './hub';

/** The viewport each phone renders at: Павло's and Олег's 360 × 670, or the 390 × 844 of the hidden menu (D1). */
const VIEWPORTS = { '360x670': { w: 360, h: 670 }, '390x844': { w: 390, h: 844 } } as const;
/** §0.1 wants the NBSP before a «%», and this one is a battery reading rather than bar chrome. */
const BATTERY = '64 %';

export function PhoneFrame({
  phone,
  visible,
  x,
  y,
  scale,
  viewport,
  now,
  offline,
  hub,
}: {
  phone: StagePhone;
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  viewport: '360x670' | '390x844';
  now: Instant;
  offline: boolean;
  hub: Hub;
}): JSX.Element {
  const [src] = useState(() => phoneSrc(phone.id));
  /** Stable, so React hands the element over once rather than on every clock tick: a ref callback is re-invoked
   *  (with `null` first) whenever its identity changes, and this one is what «Такт» reloads through. */
  const setFrame = useCallback((el: HTMLIFrameElement | null) => { hub.frames.register(phone.slot, el); },
    [hub, phone.slot]);
  const vp = VIEWPORTS[viewport];
  return (
    <div
      data-phone={phone.id}
      className="absolute origin-top-left"
      style={{
        left: x,
        top: y,
        transform: `scale(${scale})`,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="rounded-[40px] bg-[var(--phone-bezel)] p-[12px] shadow-[0_30px_80px_-30px_rgb(0_0_0/.8)]
          ring-1 ring-inset ring-white/[0.06]"
      >
        <div className="overflow-hidden rounded-[28px]" style={{ width: vp.w }}>
          <div
            className="flex h-[24px] items-center justify-between bg-[#0b1013] px-[12px] text-[12px] font-semibold
              text-[#e6eef0]"
          >
            <span className="font-mono">{fmtTime(now)}</span>
            <span className="flex items-center gap-[4px]">
              {offline ? (
                <SignalZero size={13} aria-hidden="true" />
              ) : (
                <>
                  <Signal size={13} aria-hidden="true" />
                  <span>LTE</span>
                </>
              )}
              <BatteryMedium size={15} aria-hidden="true" />
              <span>{BATTERY}</span>
            </span>
          </div>
          <iframe
            ref={setFrame}
            src={src}
            title={`Телефон · ${phone.short}`}
            className="block border-0 bg-white"
            style={{ width: vp.w, height: vp.h }}
          />
          <div className="flex h-[18px] items-center justify-center bg-[var(--phone-bezel)]">
            <span className="h-[4px] w-[120px] rounded-full bg-[#6b7c85]" />
          </div>
        </div>
      </div>
    </div>
  );
}
