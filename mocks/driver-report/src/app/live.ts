// mocks/driver-report/src/app/live.ts
/** One store across the panes (§7.7, §5.9): every screen follows the one server through these hooks.
 *
 *  Realms. On the stage the server lives in the parent window and each pane is an iframe, so every listener registered
 *  here is a function from THIS realm held by an object from ANOTHER one. A stage «Такт» reloads the four iframes; a
 *  listener left behind by a dead realm would keep running (or throwing) in the parent. So each subscription is also
 *  dropped on `window.pagehide`, and its timers cleared with it. */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { server, type ChangedEvent, type Server, type ServerEvent } from '../api/server';
import type { Instant } from '../domain/types';
import { lt } from '../domain/num';

/** How long a changed truck-day stays highlighted on the console, in wall-clock milliseconds (§5.9). */
export const LIVE_MS = 10000;
/** A burst of writes (a record and its pages) becomes ONE refetch, this long after the last of them. */
const DEBOUNCE_MS = 50;

/** Runs `cleanup` once: on the returned call (an effect's cleanup) or at `pagehide`, whichever comes first. */
function untilPagehide(cleanup: () => void): () => void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('pagehide', run);
    cleanup();
  };
  window.addEventListener('pagehide', run);
  return run;
}

/** Events after which what the server answers may have changed: a write, a rebuild, a clock jump, a toggle. */
const refetches = (e: ServerEvent): boolean =>
  e.type === 'changed' || e.type === 'rebuilt' || e.type === 'clock' || e.type === 'toggles';

/** Mounted once per shell: every write in any pane refetches this pane's active queries, 50 ms after the burst ends.
 *  No screen writes a query key by hand (EC-168). */
export function useLiveSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = server.subscribe((e) => {
      if (!refetches(e)) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ type: 'active' });
      }, DEBOUNCE_MS);
    });
    return untilPagehide(() => {
      off();
      if (timer !== null) clearTimeout(timer);
    });
  }, [queryClient]);
}

/** The stage clock, re-read every `tickMs` of wall clock and at once on a jump or a rebuild. Every "now" a screen
 *  shows comes from here, never from `new Date()` (§5.8). */
export function useServerNow(tickMs = 1000): Instant {
  const [now, setNow] = useState<Instant>(() => server.clock.nowIso());
  useEffect(() => {
    const tick = (): void => setNow(server.clock.nowIso());
    tick();
    const id = setInterval(tick, tickMs);
    const off = server.subscribe((e) => {
      if (e.type === 'clock' || e.type === 'rebuilt') tick();
    });
    return untilPagehide(() => {
      clearInterval(id);
      off();
    });
  }, [tickMs]);
  return now;
}

/** A value read off the server (a toggle, the stage ui, a phone's drafts), re-read and re-rendered on EVERY server
 *  event. `read` runs at render time, so it may build a fresh object each call. */
export function useServerValue<T>(read: (s: Server) => T): T {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => untilPagehide(server.subscribe(() => bump())), []);
  return read(server);
}

type Highlight = { at: Instant; wall: number };

/** The console's «щойно»: a truck-day a highlighted write touched stays live for `LIVE_MS` of wall clock. */
export function useLiveHighlight(): (truckDayId: string | null) => { live: boolean; at: Instant | null } {
  const seen = useRef(new Map<string, Highlight>());
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = server.subscribe((e) => {
      if (e.type === 'rebuilt') {
        seen.current.clear();
        bump();
        return;
      }
      if (e.type !== 'changed' || !e.highlight || e.truck_day_id === null) return;
      seen.current.set(e.truck_day_id, { at: e.at, wall: Date.now() });
      bump();
      // One more render when the highlight runs out, so a row loses it without waiting for another event.
      const t = setTimeout(() => {
        timers.delete(t);
        bump();
      }, LIVE_MS + 1);
      timers.add(t);
    });
    return untilPagehide(() => {
      off();
      for (const t of timers) clearTimeout(t);
    });
  }, []);
  // `version` is not read inside: it is the render the latest highlight asked for, and a new function identity is what
  // tells a memoised row to read the map again.
  return useCallback((truckDayId: string | null) => {
    const h = truckDayId === null ? undefined : seen.current.get(truckDayId);
    if (h === undefined || !lt(Date.now() - h.wall, LIVE_MS)) return { live: false, at: null };
    return { live: true, at: h.at };
  }, [version]);
}

/** Console: `fn` for every live (not replayed) write from a driver's phone that carries a toast. */
export function useDriverWrites(fn: (e: ChangedEvent) => void): void {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const off = server.subscribe((e) => {
      if (e.type === 'changed' && !e.replayed && e.actor.role === 'driver' && e.toast !== null) latest.current(e);
    });
    return untilPagehide(off);
  }, []);
}
