// mocks/driver-report/src/stage/bar/StageBar.tsx
/** The presenter bar (§5.4): 40 px of chrome that belongs to the owner, not to either product.
 *
 *  Everything here is a stage condition or a stage jump — nothing on this bar exists inside the phone or the
 *  console, and nothing inside them can reach it. That separation is the point: the audience is watching two real
 *  products, and the bar is visibly the operator's desk beside them.
 *
 *  Left to right, all thirteen rows of §5.4: identity · demo day and the server clock · the beat cue · the phone
 *  switch · «Перемотати до… ▾» · the three toggles · «Такт ▾» · «Скинути демо» · «⋯» · the link indicator · the
 *  guard chips.
 *
 *  WHICH MENU IS OPEN IS NOT THIS COMPONENT'S. «T» opens «Такт ▾» and «R» opens «Перемотати до…» from anywhere,
 *  including from inside a pane (§5.10), and Esc closes whichever is open — so the stage page holds that one value
 *  and hands it down. «⋯» keeps its own, because no key opens it.
 *
 *  TWO DECISIONS ABOUT LABELS, NOT ONE. `wide` says whether the identity is shown — a claim about the canvas being
 *  the rehearsal size (§5.4 row 1). `compact` says whether the long labels fit, which is a different question with
 *  a different answer: measured in Chrome, the full-label bar is 1 819 px and the rehearsal canvas is 1 440, so it
 *  is compact there too (see `barLabels`). They were one boolean until 2026-09-20, and the bar was clipping rows
 *  10 to 13 off the right-hand edge at the size the demo is shown at.
 *
 *  The accessible names do not move with either: a control's name is its sentence, and the window is not part of
 *  it — so a test and a screen reader address the same control at every size. */
import { useMemo, type JSX } from 'react';
import { Gauge, SatelliteDish, WifiOff } from 'lucide-react';
import { TruckMark } from '../../components/shared';
import { fmtDay, fmtTime } from '../../app/format';
import type { Toggles, StageUi } from '../../api/server';
import type { Instant } from '../../domain/types';
import { framedTruck, type Hub } from '../hub';
import { rewindTo } from '../runner';
import { BeatCue } from './BeatCue';
import { BeatMenu } from './BeatMenu';
import { GuardChips } from './GuardChips';
import { HiddenMenu } from './HiddenMenu';
import { LinkIndicator } from './LinkIndicator';
import { PhoneSwitch } from './PhoneSwitch';
import { ResetButton } from './ResetButton';
import { RewindMenu } from './RewindMenu';
import { StageToggle } from './StageToggle';

/** Which of the two keyboard-openable menus is open, if either (§5.10). */
export type BarMenuId = 'beat' | 'rewind' | null;

export function StageBar({
  hub,
  ui,
  toggles,
  now,
  scaleLabel,
  wide,
  compact,
  menu,
  onMenu,
}: {
  hub: Hub;
  ui: StageUi;
  toggles: Toggles;
  now: Instant;
  scaleLabel: string | null;
  /** §5.4 row 1: the identity is shown. */
  wide: boolean;
  /** §5.2: every label is at its short spelling. */
  compact: boolean;
  menu: BarMenuId;
  onMenu(menu: BarMenuId): void;
}): JSX.Element {
  /** Re-resolved when the frame moves or the demo is rebuilt; `allRows` pages a store, and the bar re-renders on
   *  every clock tick. */
  const truck = useMemo(() => framedTruck(ui.phone), [ui.phone, ui.beat]);
  const speedOn = truck !== null && truck.id in toggles.speed;
  const gpsOn = truck !== null && truck.id in toggles.gpsLost;

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
        <PhoneSwitch phone={ui.phone} compact={compact} onSelect={hub.selectPhone} />

        <RewindMenu
          now={now}
          open={menu === 'rewind'}
          onOpen={(open) => { onMenu(open ? 'rewind' : null); }}
          onPick={(at) => { void rewindTo(at); }}
        />

        <StageToggle icon={WifiOff} label="Офлайн" on={toggles.offline} compact={compact} onPress={hub.toggleOffline} />
        <StageToggle
          icon={Gauge}
          label="Швидкість 60 км/год"
          on={speedOn}
          compact={compact}
          onPress={hub.toggleSpeed}
        />
        <StageToggle
          icon={SatelliteDish}
          label="GPS зник"
          on={gpsOn}
          compact={compact}
          disabled={truck === null || !truck.rc}
          hint="Лише для машини з Ruptela"
          onPress={hub.toggleGps}
        />

        <BeatMenu
          open={menu === 'beat'}
          onOpen={(open) => { onMenu(open ? 'beat' : null); }}
          onPick={(n) => { void hub.goBeat(n); }}
        />
        <ResetButton onReset={() => { void hub.reset(); }} />
        <HiddenMenu ui={ui} toggles={toggles} />

        <LinkIndicator offline={toggles.offline} />

        <GuardChips scaleLabel={scaleLabel} />
      </span>
    </div>
  );
}
