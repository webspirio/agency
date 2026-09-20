// mocks/driver-report/src/components/driver/StopCard.tsx
/** Home mode C (§3.3 D-02): the driver is standing at a place, and the card answers «скільки я тут стою» before it
 *  answers anything else — the hero is a 2.5rem mono timer, because that number is the one the shipper argues about.
 *
 *  THE TIMER IS A PROP, NOT A SUBSCRIPTION. `now` comes from the screen's `useServerNow()` (I-10), so the second
 *  hand belongs to ONE clock per pane and the card stays a pure function of its view model — the stage can rewind to
 *  a beat and every timer on both panes moves together (§5.8). Elapsed minutes are floored at zero: a `now` behind
 *  the arrival (a rewind mid-render) would otherwise reach `intDiv`'s negative guard and throw.
 *
 *  THE STATUS LINE IS THE ONLY TAP. It is the 3.5rem row with the `ChevronRight` that opens «Що зараз?» (D-05), and
 *  it reads, in this order:
 *   · an alert inside the stop — «Тривога · з 19:12» in hold, with a 3.5rem outline «Закінчилось» under the card
 *     (EC-58). An alert is a SEGMENT of the stop, never mode D, so the on-site timer above keeps running;
 *   · the segment the driver last chose — «Черга · з 06:10»; «Чекаю вказівки · з 10:40» after «Не приймають» is
 *     held in ochre and, given `onCall`, is followed by the call button, because waiting for instructions without a
 *     number to ring is not a state anyone can leave (D-11);
 *   · nothing chosen — the invitation. `rc` is what makes it optional wording: a Ruptela truck's arrival is written
 *     by the server, so its driver was never asked, and §3.3 D-02 gives that case «Що зараз? — якщо хочете,
 *     оберіть». An RG driver always passed through D-04's `status` step, so he only ever sees this line if
 *     something went missing — and it still has to open D-05, or the stop has no way out.
 *
 *  (The R+C «Не так» button of §3.3 D-02 is P1 and deliberately absent.) */
import type { JSX } from 'react';
import { ArrowDownToLine, Ban, Ellipsis, FileCheck, FileClock, FlaskConical, Hourglass, PackageOpen, Siren,
  Weight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fmtTime, fmtTimer } from '../../app/format';
import { minutesBetween } from '../../domain/clock';
import type { OnCallView, PlannedStopView } from '../../domain/dto';
import type { OpenStop } from '../../domain/project';
import type { Instant, SegmentChip } from '../../domain/types';
import { DC } from '../../copy/driver';
import { SimChip } from '../shared';
import { CallButton } from './CallButton';
import { QuietButton } from './QuietButton';
import { StatusLine } from './StatusLine';

/** §6.7, one icon per chip. «Чекаю вказівки» borrows «Не приймають»'s `Ban`: it is the same refusal, seen from the
 *  cab a minute later. */
const CHIP_ICON: Record<SegmentChip, LucideIcon> = {
  QUEUE: Hourglass, LOADING_NOW: PackageOpen, UNLOADING_NOW: PackageOpen, SCALES: Weight, LAB: FlaskConical,
  WAIT_DOCS: FileClock, DRIVE_IN: ArrowDownToLine, TTN_SHOWN: FileCheck, ALERT: Siren, OTHER: Ellipsis,
  WAIT_ORDERS: Ban,
};

const DROP_LINE = 'Покажіть ТТН на прохідній одразу — з цього часу рахується вивантаження';
const NO_PHOTO_LINE = 'Тут фото заборонені — ТТН і щиток знімете після виїзду';
const ASK = 'Що зараз?';
const ASK_OPTIONAL = 'Що зараз? — якщо хочете, оберіть';

function titleOf(stop: PlannedStopView): string {
  switch (stop.kind) {
    case 'LOADING':
      return `Завантаження — «${stop.label}»`;
    case 'DROP':
      return stop.drop_index !== null && stop.drop_count !== null
        ? `Вивантаження ${stop.drop_index} з ${stop.drop_count} — «${stop.label}»`
        : `Вивантаження — «${stop.label}»`;
    case 'BASE':
      return 'Повернення на базу';
    case 'UNPLANNED':
      return `Зупинка — «${stop.label}»`;
  }
}

export function StopCard({ open, now, rc, onStatus, onAlertOver, onCall }: {
  open: OpenStop;
  now: Instant;
  rc: boolean;
  onStatus(): void;
  onAlertOver?(): void;
  onCall?: OnCallView;
}): JSX.Element {
  const { stop, arrived_at: arrived, auto, segment, alert } = open;
  const waiting = segment?.chip === 'WAIT_ORDERS';
  const line = alert !== null
    ? { text: `${DC.roadStopShort.ALERT} · з ${fmtTime(alert.since)}`, tone: 'hold' as const, icon: Siren }
    : segment !== null
      ? { text: `${DC.segments[segment.chip]} · з ${fmtTime(segment.since)}`,
        tone: waiting ? ('hold' as const) : ('plain' as const), icon: CHIP_ICON[segment.chip] }
      : { text: rc ? ASK_OPTIONAL : ASK, tone: 'plain' as const, icon: Ellipsis };

  return (
    <section className="card-ring flex flex-col gap-3 p-4">
      <h2 className="text-[1.625rem] leading-[2rem] font-semibold tracking-[-0.015em]">{titleOf(stop)}</h2>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[1rem] leading-[1.5rem] font-medium" style={{ color: 'var(--text-2)' }}>
          {auto ? `На місці ${fmtTime(arrived)} · Ruptela` : `На місці ${fmtTime(arrived)}`}
        </span>
        {auto ? <SimChip /> : null}
      </span>
      <span className="flex flex-col pt-2 pb-2">
        <span className="text-[1rem] leading-[1.5rem]" style={{ color: 'var(--text-2)' }}>на місці</span>
        <span className="font-mono text-[2.5rem] leading-[2.75rem] font-semibold tracking-[-0.01em]">
          {fmtTimer(Math.max(0, minutesBetween(arrived, now)))}
        </span>
      </span>
      <StatusLine tone={line.tone} icon={line.icon} text={line.text} onPress={onStatus} />
      {stop.kind === 'DROP' ? <p className="text-[1rem] leading-[1.5rem]">{DROP_LINE}</p> : null}
      {stop.no_photos ? (
        <p className="text-[1rem] leading-[1.5rem]" style={{ color: 'var(--hold)' }}>{NO_PHOTO_LINE}</p>
      ) : null}
      {waiting && onCall !== undefined ? (
        <CallButton person={{ name: onCall.name, role: onCall.role_label }} phone={onCall.phone} />
      ) : null}
      {alert !== null && onAlertOver !== undefined ? (
        <QuietButton label={DC.primary.over} onPress={onAlertOver} />
      ) : null}
    </section>
  );
}
