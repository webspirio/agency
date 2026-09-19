// mocks/driver-report/src/components/driver/RoadStopCard.tsx
/** Home mode D (§3.3 D-02): the truck is standing on the road — an alert, a curfew, a checkpoint, a breakdown.
 *
 *  IT IS A PLAIN CARD, NOT A WARNING. A lawful stop is not a problem: no ochre rule, no brick anywhere (§8.6 #4),
 *  and nothing that reads as the driver's fault. He is already inside the thing the card describes; what he needs
 *  from the phone is the minutes, so the office does not ring to ask, and one number to ring if it drags on (D-11).
 *
 *  «таймер іде» under the 2.5rem mono is the whole reassurance: nothing is being asked of him while he waits, and
 *  the time is being counted anyway. The accent-filled «Закінчилось» is the screen's ActionBar primary (§8.2 D-02
 *  #1, #8), not this card's — mode D spends its one accent there. `now` is the screen's `useServerNow()`, floored at
 *  the stop's own start so a stage rewind cannot hand `fmtTimer` a negative. */
import type { JSX } from 'react';
import { CarFront, MoonStar, Route, Scale, ShieldAlert, Siren, ThermometerSun, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fmtTime, fmtTimer } from '../../app/format';
import { minutesBetween } from '../../domain/clock';
import type { OnCallView } from '../../domain/dto';
import type { OpenRoadStop } from '../../domain/project';
import type { Instant, RoadStopReason } from '../../domain/types';
import { DC } from '../../copy/driver';
import { CallButton } from './CallButton';

/** §6.7, one icon per road reason. */
const REASON_ICON: Record<RoadStopReason, LucideIcon> = {
  ALERT: Siren, CURFEW: MoonStar, HEAT: ThermometerSun, CHECKPOINT: ShieldAlert, BREAKDOWN: Wrench, DETOUR: Route,
  ACCIDENT: CarFront, WEIGH_CONTROL: Scale,
};

const RUNNING = 'таймер іде';

export function RoadStopCard({ road, now, onCall }: {
  road: OpenRoadStop;
  now: Instant;
  onCall: OnCallView;
}): JSX.Element {
  const Icon = REASON_ICON[road.reason];
  return (
    <section className="card-ring flex flex-col gap-2 p-3">
      <h2 className="flex items-center gap-2 text-[1.625rem] leading-[2rem] font-semibold tracking-[-0.015em]">
        <Icon aria-hidden="true" className="size-[1.5rem] shrink-0" />
        <span className="min-w-0">{`${DC.roadStopShort[road.reason]} · з ${fmtTime(road.since)}`}</span>
      </h2>
      <span className="flex flex-col pb-1">
        <span className="font-mono text-[2.5rem] leading-[2.75rem] font-semibold tracking-[-0.01em]">
          {fmtTimer(Math.max(0, minutesBetween(road.since, now)))}
        </span>
        <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{RUNNING}</span>
      </span>
      <CallButton person={{ name: onCall.name, role: onCall.role_label }} phone={onCall.phone} />
    </section>
  );
}
