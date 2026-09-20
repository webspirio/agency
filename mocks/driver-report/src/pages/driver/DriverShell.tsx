// mocks/driver-report/src/pages/driver/DriverShell.tsx
/** The driver layout (§2.2, I-16): everything that must be true on EVERY driver screen, and nothing a screen owns.
 *
 *  Four things live here because they are properties of the phone rather than of a screen:
 *  - the `BootGate` (standalone default «Такт 2», §2.1), so nothing renders before the realm's server sits at a beat;
 *  - `useLiveSync()` and `startOutbox(DEVICE_ID)` — one subscription and one flush loop per pane, not one per route;
 *  - the OS text size the stage simulates (`server.toggles.textScale`), applied as `font-size: 130%` on `<html>`;
 *  - the motion lock of §3.3 D-19.
 *
 *  THE LOCK IS ONE INSTANCE, AND IT IS SHARED DOWNWARD. `useMotionLock` keeps its lock in local state, so a screen
 *  that called it a second time would have a lock of its own: on an RG truck the reading happens INSIDE `guard()`,
 *  so a tap guarded by the screen's own instance would be swallowed there and raise no overlay here — which is
 *  exactly what §8.2 D-19 #1 asks for (beat 8, Павло on Регіс: a tap on «Мій день» must raise the overlay). So the
 *  shell holds the one instance and publishes its `guard` through a context; `useDriverGuard()` is what a screen
 *  wraps its taps in.
 *
 *  While locked the screen under the overlay stays MOUNTED and unchanged — a flow must keep its step and its answers
 *  (D-19 «the flow in progress is kept») — inside a wrapper carrying `inert` and `aria-hidden`, so nothing under it
 *  is reachable by a tap, by the keyboard or by a screen reader (§8.6 #9). */
import { createContext, use, useEffect, useMemo, useState, type JSX } from 'react';
import { Outlet } from 'react-router';
import { useToday } from '../../api/hooks';
import { BootGate } from '../../app/boot';
import { DEVICE_ID, STANDALONE_TOUCH } from '../../app/device';
import { openDrafts } from '../../app/flow';
import { useLiveSync, useServerNow, useServerValue } from '../../app/live';
import { pendingRecords, startOutbox } from '../../app/outbox';
import { useMotionLock } from '../../app/speed';
import { ensureLightDefault } from '../../app/theme';
import { MotionLock } from '../../components/driver';
import { project } from '../../domain/project';
import { StandaloneBanner } from './home/StandaloneBanner';

/** What `useMotionLock` hands out: a wrapper that runs `fn` only while the truck is standing (I-10). */
export type TapGuard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void;

const PASS_THROUGH: TapGuard = (fn) => fn;
/** The shell's ONE lock, as much of it as a screen needs. Outside the shell the guard passes through and nothing
 *  has just unlocked, so a kit rendered on its own in a test behaves as it does on a standing truck. */
const GuardContext = createContext<{ guard: TapGuard; justUnlocked: boolean }>(
  { guard: PASS_THROUGH, justUnlocked: false });

/** Wrap every tap that opens or continues a flow in this (§3.1 «Speed check»). Never `useMotionLock` in a screen:
 *  that is a SECOND lock, and on an RG truck the reading happens inside `guard()`, so the screen would lock itself
 *  while the shell — which raises the overlay and marks everything under it inert — learned nothing. */
export const useDriverGuard = (): TapGuard => use(GuardContext).guard;

/** True for the five seconds after the lock lets go: the «Продовжимо: …» hold banner of §3.3 D-19. */
export const useJustUnlocked = (): boolean => use(GuardContext).justUnlocked;

/** How long the overlay fades out; the fade IN is `MotionLock`'s own (§6.8). */
const FADE_MS = 200;
/** The OS text size the stage simulates (§5.4, EC-78). */
const BIG_TEXT = '130%';

function DriverRuntime(): JSX.Element {
  useLiveSync();
  // Read BEFORE the outbox loop is started on purpose: `startOutbox` puts TanStack Query offline while the stage's
  // «Офлайн» is on, and a query that had not started by then would be paused instead of answering from the adapter.
  const today = useToday().data ?? null;
  const now = useServerNow();
  const bigText = useServerValue((s) => s.toggles.textScale[DEVICE_ID] === true);
  const drafts = useServerValue(() => openDrafts(DEVICE_ID));

  useEffect(() => { ensureLightDefault(); }, []);
  useEffect(() => startOutbox(DEVICE_ID), []);
  useEffect(() => {
    if (!bigText) return undefined;
    const root = document.documentElement;
    const before = root.style.fontSize;
    root.style.fontSize = BIG_TEXT;
    return () => { root.style.fontSize = before; };
  }, [bigText]);

  const view = today === null ? null : project(today, pendingRecords(DEVICE_ID), now);
  const truck = today?.truck ?? null;
  const lock = useMotionLock(
    truck === null ? null : { id: truck.id, has_can: truck.has_can, gnss: truck.gnss },
    view?.openStop != null,
  );

  // The overlay outlives the unlock by one fade (`MotionLock` animates itself in only, by design).
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (lock.locked) {
      setFading(true);
      return undefined;
    }
    const id = setTimeout(() => { setFading(false); }, FADE_MS);
    return () => { clearTimeout(id); };
  }, [lock.locked]);

  const ahead = view?.nextStop?.short ?? view?.openStop?.stop.short ?? '';
  const resuming = lock.justUnlocked ? drafts.at(-1) ?? null : null;
  const published = useMemo(() => ({ guard: lock.guard, justUnlocked: lock.justUnlocked }),
    [lock.guard, lock.justUnlocked]);

  return (
    <>
      {STANDALONE_TOUCH ? <StandaloneBanner /> : null}
      <GuardContext value={published}>
        <div {...(lock.locked ? { inert: true, 'aria-hidden': true } : {})}>
          <Outlet />
        </div>
      </GuardContext>
      {resuming === null ? null : (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-gutter pb-3">
          <p
            className="card-ring mx-auto w-full max-w-[35rem] bg-label px-4 py-3 text-[1rem] leading-[1.375rem] font-semibold"
            style={{ color: 'var(--hold)' }}
          >
            {`Продовжимо: ${resuming.label}`}
          </p>
        </div>
      )}
      {lock.locked || fading ? (
        <div
          className="fixed inset-0 z-50"
          style={{ opacity: lock.locked ? 1 : 0, transition: `opacity ${FADE_MS}ms linear` }}
        >
          <MotionLock nextStop={ahead} />
        </div>
      ) : null}
    </>
  );
}

export function DriverShell(): JSX.Element {
  return <BootGate defaultBeat={2}><DriverRuntime /></BootGate>;
}
