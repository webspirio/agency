// mocks/driver-report/src/stage/bar/StageBar.tsx
/** The presenter bar (§5.4): 40 px of chrome that belongs to the owner, not to either product.
 *
 *  Everything here is a stage condition or a stage jump — nothing on this bar exists inside the phone or the
 *  console, and nothing inside them can reach it. That separation is the point: the audience is watching two real
 *  products, and the bar is visibly the operator's desk beside them.
 *
 *  Left to right (§5.4 rows 1–4, 6–10, 12–13): identity · demo day and the server clock · the beat cue · the phone
 *  switch · the three toggles · «Такт ▾» · «Скинути демо» · the link indicator · the guard chips. Row 5
 *  («Перемотати до… ▾») and row 11 («⋯») are W3-03's and are deliberately absent rather than stubbed — a control
 *  that looks live and does nothing is worse on stage than a control that is not there.
 *
 *  Below 1 440 px the identity drops and every label shortens (§5.2). The accessible names do not move with it: a
 *  control's name is its sentence, and the window is not part of it. */
import { useMemo, type JSX } from 'react';
import { Gauge, SatelliteDish, WifiOff } from 'lucide-react';
import { TruckMark } from '../../components/shared';
import { fmtDay, fmtTime } from '../../app/format';
import type { Toggles, StageUi } from '../../api/server';
import type { Instant } from '../../domain/types';
import { framedTruck, type Hub } from '../hub';
import { BeatCue } from './BeatCue';
import { BeatMenu } from './BeatMenu';
import { LinkIndicator } from './LinkIndicator';
import { PhoneSwitch } from './PhoneSwitch';
import { ResetButton } from './ResetButton';
import { StageToggle } from './StageToggle';

export function StageBar({
  hub,
  ui,
  toggles,
  now,
  scaleLabel,
  wide,
}: {
  hub: Hub;
  ui: StageUi;
  toggles: Toggles;
  now: Instant;
  scaleLabel: string | null;
  wide: boolean;
}): JSX.Element {
  /** Re-resolved when the frame moves or the demo is rebuilt; `allRows` pages a store, and the bar re-renders on
   *  every clock tick. */
  const truck = useMemo(() => framedTruck(ui.phone), [ui.phone, ui.beat]);
  const speedOn = truck !== null && truck.id in toggles.speed;
  const gpsOn = truck !== null && truck.id in toggles.gpsLost;

  /** «Шрифти не завантажились» is a claim about the browser; jsdom has no font manager at all, so where there is
   *  nothing to ask, nothing is claimed (§5.4 #13). */
  const fontsMissing = typeof document.fonts?.check === 'function' && !document.fonts.check('16px Onest');

  return (
    <div
      className="flex size-full items-center gap-[8px] bg-stage-bar px-[12px] font-sans text-[13px] font-medium
        text-stage-text"
    >
      {wide ? (
        <span className="flex shrink-0 items-center gap-[6px]">
          <TruckMark size={18} className="text-stage-accent" />
          Сцена · Звіт водія · КТЛ
        </span>
      ) : null}

      <span className="flex shrink-0 items-center gap-[6px] text-stage-text-2">
        Демо-день: {fmtDay(now)}
        <span className="font-mono text-stage-text">{fmtTime(now)}</span>
      </span>

      <BeatCue cue={ui.cue} />

      <span className="ml-auto flex shrink-0 items-center gap-[8px]">
        <PhoneSwitch phone={ui.phone} compact={!wide} onSelect={hub.selectPhone} />

        <StageToggle icon={WifiOff} label="Офлайн" on={toggles.offline} compact={!wide} onPress={hub.toggleOffline} />
        <StageToggle
          icon={Gauge}
          label="Швидкість 60 км/год"
          on={speedOn}
          compact={!wide}
          onPress={hub.toggleSpeed}
        />
        <StageToggle
          icon={SatelliteDish}
          label="GPS зник"
          on={gpsOn}
          compact={!wide}
          disabled={truck === null || !truck.rc}
          hint="Лише для машини з Ruptela"
          onPress={hub.toggleGps}
        />

        <BeatMenu onPick={(n) => { void hub.goBeat(n); }} />
        <ResetButton onReset={() => { void hub.reset(); }} />

        <LinkIndicator offline={toggles.offline} />

        {scaleLabel === null ? null : <Chip text={scaleLabel} />}
        {fontsMissing ? <Chip text="Шрифти не завантажились" /> : null}
        {import.meta.env.DEV ? <Chip text="Не збірка — запустіть vite preview" /> : null}
      </span>
    </div>
  );
}

/** A guard chip: only ever rendered when the thing it warns about is true (§5.4 #13). */
function Chip({ text }: { text: string }): JSX.Element {
  return (
    <span className="shrink-0 rounded-[8px] bg-stage-hold-bg px-[8px] py-[4px] text-[12px] text-stage-hold">
      {text}
    </span>
  );
}
