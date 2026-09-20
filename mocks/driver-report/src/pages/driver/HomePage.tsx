// mocks/driver-report/src/pages/driver/HomePage.tsx
/** «Сьогодні» — the screen that answers «що мені зараз робити?» with one button (§3.2, §3.3 D-02).
 *
 *  IT DECIDES NOTHING. The mode, the primary, the quiet secondary and the whole TripRail come from `project()`
 *  (I-11), a pure function of what the server last answered and what the phone still holds. This file is the
 *  arrangement of §3.2 — pinned cards, now card, sync strip, links, action bar — plus the four commits home performs
 *  itself, and nothing else. That is why home has a mode E with no accent and a mode D with a running timer without
 *  a single `if` about shifts in this file.
 *
 *  THE PHONE ANSWERS WITH NO NETWORK. `pendingRecords(DEVICE_ID)` is laid over the last `getToday`, so a record the
 *  office has not acknowledged still moves the screen on: commit «Поїхав далі» offline and the next stop becomes the
 *  primary at once. Nothing on this screen waits for a round trip.
 *
 *  FOUR COMMITS HAPPEN HERE, each one the driver reached without a flow: «Поїхав далі» (STOP_LEFT), «Закінчилось» on
 *  a road stop and on an alert inside a stop (both ROAD_STOP_END, EC-58), the answer to an office correction
 *  (CORRECTION_ACK) and the inline shift start of D-21. Everything else is a route.
 *
 *  EVERY TAP THAT OPENS OR CONTINUES A FLOW GOES THROUGH `guard()` (§3.1, D-19) — «Мій день» included, because that
 *  is the tap §8.2 D-19 #1 measures. The guard is the shell's ONE motion lock, taken from `useDriverGuard()`. */
import { useState, type JSX } from 'react';
import { CalendarDays, Ellipsis, ShieldOff } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { DEVICE_ID, officeSeesKey } from '../../app/device';
import { discardDraft, openDrafts, type Draft } from '../../app/flow';
import { fmtDur, fmtTime } from '../../app/format';
import { useServerNow, useServerValue } from '../../app/live';
import { enqueue, pendingRecords, syncState, useOutbox } from '../../app/outbox';
import { buildRecord } from '../../app/records';
import { AppHeader, DriverScreen, DriverSkeleton, HoldCard, InlineStartSheet, QuietButton, SyncStrip,
  type StartChip, type TimeChip } from '../../components/driver';
import { DC } from '../../copy/driver';
import { addMinutes, minutesBetween } from '../../domain/clock';
import type { CorrectionView } from '../../domain/dto';
import { project, type PrimaryTarget } from '../../domain/project';
import type { Instant, Payloads, RecordType } from '../../domain/types';
import { useDriverGuard } from './DriverShell';
import { HomeActions } from './home/HomeActions';
import { NowCard } from './home/NowCard';
import { PinnedCards } from './home/PinnedCards';
import { RoadStopCloseSheet } from './home/RoadStopCloseSheet';
import { SegmentPanel } from './SegmentPanel';

const REVOKED = 'Цей телефон відключено. Попросіть диспетчера підключити його знову.';
const RG_HINT = 'Якщо машина їде — нічого не натискайте, усе почекає';
const INLINE_NEXT = 'без одометра — зміну почато на точці';
/** How far back each inline-start chip puts the shift (D-21); «Раніше…» opens the full flow instead. */
const BACK_MINUTES: Partial<Record<StartChip, number>> = { M30: 30, H1: 60 };
/** How far back each close chip puts a road stop's end (D-11). */
const CHIP_MINUTES: Record<'now' | 15 | 30 | 60, number> = { now: 0, 15: 15, 30: 30, 60: 60 };

/** Per-viewer only: the one-time «Що бачить офіс» row. The seed's own flag is the truth; this is the convenience
 *  that keeps the row from coming back on the next page load (I-10). */
function readOfficeSees(): boolean {
  try {
    return localStorage.getItem(officeSeesKey(DEVICE_ID)) !== null;
  } catch {
    return false;   // a private window or blocked storage: the row simply shows again
  }
}

export function HomePage(): JSX.Element {
  const today = useToday().data ?? null;
  const now = useServerNow();
  const entries = useOutbox(DEVICE_ID);
  const offline = useServerValue((s) => s.toggles.offline);
  const drafts = useServerValue(() => openDrafts(DEVICE_ID));
  const navigate = useNavigate();
  const location = useLocation();
  const guard = useDriverGuard();
  const [committed, setCommitted] = useState<string | null>(null);
  const [startFor, setStartFor] = useState<string | null>(null);
  const [closeFor, setCloseFor] = useState<string | null>(null);

  if (today === null) {
    return <DriverScreen header={<AppHeader />}><DriverSkeleton /></DriverScreen>;
  }
  if (!today.device.bound) return <Navigate to="/bind" replace />;
  if (today.device.revoked) {
    return (
      <DriverScreen header={<AppHeader />}>
        <HoldCard icon={ShieldOff} title={REVOKED} />
      </DriverScreen>
    );
  }

  const view = project(today, pendingRecords(DEVICE_ID), now);
  const truck = today.truck;
  const rc = truck !== null && truck.has_can && truck.gnss === 'OK';
  const road = view.openRoadStop;
  const leftBase = today.auto_events.find((e) => e.kind === 'OUT')?.at ?? null;

  /** One commit, once: the tag changes the moment the projection moves on, so a second tap on the same state does
   *  nothing while a tap on the next one is free (§3.1 «Commit behaviour», EC-137). */
  const tag = `${view.mode}:${view.openStop?.stop.stop_id ?? ''}:${road?.key ?? ''}:${view.primary?.target.kind ?? ''}`;
  const busy = committed === tag;

  function commit<T extends RecordType>(type: T, payload: Payloads[T], at: Instant,
    receipt: { title: string; next: string | null } | null, stopId: string | null = null): void {
    const seq = server.mintSeq(DEVICE_ID);
    enqueue(DEVICE_ID, {
      record: buildRecord({ deviceId: DEVICE_ID, seq, occurredAt: at, committedAt: now, stopId }, type, payload),
      pages: [],
      receipt,
    });
  }

  /** Closes a road stop — or an alert inside a stop, which is the same record (EC-58) — at `at`. */
  const closeRoadStop = (key: string, since: Instant, at: Instant, by: 'DRIVER' | 'NEXT_TAP_CHIP'): void => {
    const word = road === null ? DC.roadStopShort.ALERT : DC.roadStopShort[road.reason];
    commit('ROAD_STOP_END', { road_stop_key: key, at, closed_by: by }, at,
      { title: `${word} ${fmtTime(since)}–${fmtTime(at)} · ${fmtDur(minutesBetween(since, at))}`, next: null });
  };

  /** Opening or continuing anything: the speed first (D-19), then D-21's sheet when no shift is open, then D-11's
   *  when a road stop is still running on an RG truck. */
  const open = guard((to: string) => {
    if (!view.shiftOpen && view.mode !== 'E') {
      setStartFor(to);
      return;
    }
    if (road !== null && !rc) {
      setCloseFor(to);
      return;
    }
    void navigate(to);
  });

  const resume = guard((draft: Draft) => {
    void navigate(draft.path, { state: { step: draft.step, draftId: draft.id } });
  });

  const acknowledge = (c: CorrectionView, agree: boolean): void => {
    commit('CORRECTION_ACK', { correction_id: c.id, agree }, now, null);
  };

  const runPrimary = guard((target: PrimaryTarget) => {
    if (busy) return;
    switch (target.kind) {
      case 'shift-start':
      case 'new-shift':
        void navigate('/shift/start');
        return;
      case 'arrive':
        void navigate(`/stop/${target.stopId}/arrive`);
        return;
      case 'choose-place':
      case 'elsewhere':
        void navigate('/elsewhere');
        return;
      case 'loaded':
        void navigate(`/stop/${target.stopId}/loaded`);
        return;
      case 'unloaded':
        void navigate(`/stop/${target.stopId}/unloaded`);
        return;
      case 'shift-end':
        void navigate('/shift/end');
        return;
      case 'my-day':
        void navigate('/day');
        return;
      case 'leave':
        setCommitted(tag);
        commit('STOP_LEFT', {}, now, { title: `${DC.primary.leave} ${fmtTime(now)}`, next: null }, target.stopId);
        return;
      case 'close-road-stop':
        if (road === null) return;
        setCommitted(tag);
        closeRoadStop(road.key, road.since, now, 'DRIVER');
    }
  });

  /** D-21: a chip opens the shift without an odometer, and the tap that asked for it then continues. */
  const startInline = (chip: StartChip): void => {
    const to = startFor;
    setStartFor(null);
    if (truck === null || today.trailer === null || to === null) return;
    if (chip === 'EARLIER') {
      void navigate('/shift/start');
      return;
    }
    const at = chip === 'CARD' && leftBase !== null ? leftBase : addMinutes(now, 0 - (BACK_MINUTES[chip] ?? 0));
    commit('SHIFT_START',
      { truck_id: truck.id, trailer_id: today.trailer.id, plan_match: true, odometer: null, inline: chip }, at,
      { title: `Зміну почато ${fmtTime(at)}`, next: INLINE_NEXT });
    void navigate(to);
  };

  /** D-11: the road stop is closed at the picked moment, and the tap that asked for it then continues. */
  const closeThen = (chip: TimeChip): void => {
    const to = closeFor;
    setCloseFor(null);
    if (road === null || to === null || chip === 'earlier') return;
    closeRoadStop(road.key, road.since, addMinutes(now, 0 - CHIP_MINUTES[chip]), 'NEXT_TAP_CHIP');
    void navigate(to);
  };

  const panel = (location.state as { panel?: unknown } | null)?.panel;
  if (panel === 'segment' && view.openStop !== null) {
    return <SegmentPanel stopId={view.openStop.stop.stop_id} onDone={() => { void navigate(-1); }} />;
  }

  return (
    <>
      <DriverScreen
        header={<AppHeader {...(today.plan === null ? {} : { tripNo: today.plan.trip_no })} />}
        bar={(
          <HomeActions
            view={view}
            entries={entries}
            offline={offline}
            now={now}
            rc={rc}
            busy={busy}
            onRefuel={() => { open('/refuel'); }}
            onStand={() => { open('/stand'); }}
            onPrimary={() => { if (view.primary !== null) runPrimary(view.primary.target); }}
            onQuiet={() => { if (view.quiet !== null) runPrimary(view.quiet.target); }}
          />
        )}
      >
        <PinnedCards
          today={today}
          now={now}
          drafts={drafts}
          officeSeesRead={today.first_time.office_sees_read || readOfficeSees()}
          shiftOpen={view.shiftOpen}
          rc={rc}
          onOpen={open}
          onResume={resume}
          onDiscard={(draft) => { discardDraft(DEVICE_ID, draft.id); }}
          onAck={acknowledge}
        />

        <NowCard
          today={today}
          view={view}
          now={now}
          rc={rc}
          onStatus={() => { void navigate('/', { state: { panel: 'segment' } }); }}
          onAlertOver={() => {
            const alert = view.openStop?.alert ?? null;
            if (alert !== null) closeRoadStop(alert.key, alert.since, now, 'DRIVER');
          }}
        />

        <SyncStrip state={syncState(entries, offline, today.last_contact_at)} />

        <div className="flex gap-2">
          <QuietButton half icon={CalendarDays} label={DC.links.myDay} onPress={() => { open('/day'); }} />
          <QuietButton half icon={Ellipsis} label={DC.links.more} onPress={() => { open('/more'); }} />
        </div>

        {!rc && view.shiftOpen ? (
          <p className="text-[0.875rem] leading-[1.125rem]" style={{ color: 'var(--text-2)' }}>{RG_HINT}</p>
        ) : null}
      </DriverScreen>

      <InlineStartSheet
        open={startFor !== null}
        plate={truck?.plate ?? ''}
        rc={rc}
        startedLabel={rc && leftBase !== null ? fmtTime(leftBase) : null}
        onPick={startInline}
        onClose={() => { setStartFor(null); }}
      />
      <RoadStopCloseSheet
        road={closeFor === null ? null : road}
        onPick={closeThen}
        onClose={() => { setCloseFor(null); }}
      />
    </>
  );
}
