// mocks/driver-report/src/pages/driver/home/HomeActions.tsx
/** The thumb zone of home (§3.1, §3.3 D-02): the receipt of what was just recorded, the two tiles, and the one
 *  accent-filled button that advances the day.
 *
 *  THE ACCENT IS COUNTED, NOT DESCRIBED. `PrimaryAction` renders `data-accent=""` and this file renders at most one
 *  of them — none at all in mode E, where there is nothing left to advance (§8.2 D-02 #1). Everything else in the
 *  bar is an outline: the tiles, the quiet secondary and the receipt's «Скасувати».
 *
 *  THE RECEIPT SURVIVES ITS OWN UNDO. «Скасувати» on an entry the office does not have yet REMOVES it from the
 *  outbox (`undo`, I-10) — there is nothing left to render, and «Скасовано · Повернути» would vanish with it. So the
 *  undone entry is held here for the rest of its fifteen seconds, marked `undone`, and «Повернути» re-enqueues it
 *  under a fresh seq. The hold is dropped as soon as it is stale, so a stage rebuild (which restarts `seq`) cannot
 *  leave an old card sitting over a new one. */
import { useState, type JSX } from 'react';
import { CalendarDays, Check, FileCheck, FileText, Flag, Fuel, MapPin, MapPinned, OctagonPause, Play,
  Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DEVICE_ID } from '../../../app/device';
import { receiptState, redo, undo, UNDO_MS, type OutboxEntry } from '../../../app/outbox';
import { ActionBar, PrimaryAction, QuietButton, ReceiptCard, Tile } from '../../../components/driver';
import { DC } from '../../../copy/driver';
import { cmpNum, gt, lt } from '../../../domain/num';
import type { PrimaryTarget, Projection } from '../../../domain/project';
import type { Instant } from '../../../domain/types';

const FIRST_ARRIVAL = 'Натискайте, щойно стали в чергу — навіть за воротами';

/** §6.7, one icon per thing the primary can be. */
const ICON: Record<PrimaryTarget['kind'], LucideIcon> = {
  'shift-start': Play,
  arrive: MapPin,
  'choose-place': MapPin,
  loaded: FileText,
  unloaded: FileCheck,
  leave: Truck,
  'shift-end': Flag,
  'close-road-stop': Check,
  elsewhere: MapPinned,
  'my-day': CalendarDays,
  'new-shift': Play,
};

/** An entry still inside its fifteen seconds of wall clock, and loud enough to have a card at all. */
const showable = (e: OutboxEntry | null): OutboxEntry | null =>
  e !== null && e.receipt !== null && lt(Date.now() - e.created_wall, UNDO_MS) ? e : null;

export function HomeActions({ view, entries, offline, now, rc, busy, onRefuel, onStand, onPrimary, onQuiet }: {
  view: Projection;
  entries: OutboxEntry[];
  offline: boolean;
  now: Instant;
  rc: boolean;
  busy: boolean;
  onRefuel(): void;
  onStand(): void;
  onPrimary(): void;
  onQuiet(): void;
}): JSX.Element {
  const [held, setHeld] = useState<OutboxEntry | null>(null);

  const newest = showable([...entries].filter((e) => e.receipt !== null).sort((a, b) => cmpNum(a.seq, b.seq)).at(-1) ?? null);
  const kept = showable(held);
  const card = kept !== null && (newest === null || gt(kept.seq, newest.seq)) ? kept : newest;
  const { primary, quiet } = view;

  return (
    <ActionBar>
      {card === null || card.receipt === null ? null : (
        <ReceiptCard
          title={card.receipt.title}
          status={receiptState(card, offline, now)}
          next={card.receipt.next}
          createdWall={card.created_wall}
          undone={card.undone}
          onUndo={() => {
            setHeld({ ...card, undone: true });
            undo(DEVICE_ID, card.key);
          }}
          onRedo={() => {
            setHeld(null);
            redo(DEVICE_ID, card.key);
          }}
        />
      )}

      <div className="flex gap-2">
        <Tile
          icon={Fuel}
          word={DC.tiles.refuel}
          sub={rc ? DC.tiles.refuelSubRc : DC.tiles.refuelSub}
          onPress={onRefuel}
        />
        <Tile icon={OctagonPause} word={DC.tiles.stand} sub={DC.tiles.standSub} onPress={onStand} />
      </div>

      {view.mode === 'B' && view.firstArrivalEver ? (
        <p className="text-[0.875rem] leading-[1.125rem]" style={{ color: 'var(--text-2)' }}>{FIRST_ARRIVAL}</p>
      ) : null}

      {primary === null ? null : (
        <PrimaryAction
          icon={ICON[primary.target.kind]}
          verb={primary.verb}
          place={primary.place}
          busy={busy}
          onPress={onPrimary}
        />
      )}
      {quiet === null ? null : <QuietButton icon={ICON[quiet.target.kind]} label={quiet.verb} onPress={onQuiet} />}
    </ActionBar>
  );
}
