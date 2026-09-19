// mocks/driver-report/src/api/server.ts
/** The one server of the mock (§7.7, I-6). Every store, the stage clock, the toggles, the per-phone local state and
 *  an event bus live in ONE object. The stage creates it and publishes it on `window.__ktlServer`; the four
 *  same-origin iframes inherit it, so a write in one pane is visible in the others.
 *
 *  Cross-realm rules, because an iframe's code calls into this object from another realm:
 *  - no `instanceof` on server state (an Array or Error from another realm fails it);
 *  - `stores` is REPLACED by `reset()`, so a handler reads `server.stores` at call time and never captures it;
 *  - a listener that throws (typically one registered by an iframe that has since unloaded) is dropped, and its
 *    error never reaches the writer. */
import { asInstant, type Actor } from '@agency/mock';
import { kyiv } from '../domain/clock';
import { populate } from '../domain/seed';
import type { Instant, Scope, World } from '../domain/types';
import { emptyStores, snapshot, type Stores } from './stores';
import type { OutboxEntry } from '../app/outbox';
import type { Draft } from '../app/flow';

export type Toggles = { offline: boolean; speed: Record<string, number>; gpsLost: Record<string, boolean>;
  textScale: Record<string, boolean>; viewport: '360x670' | '390x844'; hideSimChips: boolean };
export type PhoneLocal = { outbox: OutboxEntry[]; drafts: Record<string, Draft>; outboxVersion: number };
export type StageUi = { beat: number | null; phone: string; scope: Scope; focus: 'both' | 'phone' | 'console';
  single: 'both' | 'phone' | 'console'; consoleZoom: boolean; barHidden: boolean; cue: string | null };
export type ChangedEvent = { type: 'changed'; op: string; actor: Actor; at: Instant;
  params: Record<string, string>; body: unknown; truck_day_id: string | null; result_id: string | null;
  highlight: boolean; toast: { title: string; line: string } | null; replayed: boolean };
export type ServerEvent = ChangedEvent
  | { type: 'toggles' } | { type: 'clock'; jumped: boolean } | { type: 'rebuilt'; beat: number }
  | { type: 'ui' } | { type: 'outbox'; device_id: string }
  | { type: 'transfer'; device_id: string; phase: 'start' | 'end' } | { type: 'stage-key'; key: string };
export type Clock = { nowIso(): Instant; set(at: Instant): void; freeze(): void; run(): void; frozen(): boolean;
  onJump(fn: () => void): () => void };
export type Server = {
  stores: Stores;                 // REPLACED by reset(): handlers read server.stores at call time, never capture it
  clock: Clock;
  toggles: Toggles;
  devices: Record<string, PhoneLocal>;   // per-phone local state (NOT the Device rows, which are stores.devices)
  ui: StageUi;
  replaying: boolean;             // true while the runner applies script entries or replays the log
  done: string[];                 // script entry ids already applied or retired by a live twin
  scriptRefs: Record<string, string>;    // script entry id → record key / created row id it produced
  reset(): void;                  // fresh stores via populate(), toggles off, phones cleared, done/scriptRefs cleared, ui.beat = null
  mintSeq(deviceId: string): number;     // returns stores.devices[deviceId].next_seq and increments it
  phone(deviceId: string): PhoneLocal;   // get-or-create
  setToggle<K extends keyof Toggles>(key: K, value: Toggles[K]): void;   // emits { type: 'toggles' }
  setUi(patch: Partial<StageUi>): void;                                   // emits { type: 'ui' }
  wrote(op: string, c: { actor: Actor; now: string; params: Record<string, string>; body: unknown },
    extra: { truck_day_id: string | null; result_id?: string | null; highlight?: boolean;
      toast?: { title: string; line: string } | null }): void;          // emits a ChangedEvent
  emit(e: ServerEvent): void;     // listener errors are caught; a throwing listener is dropped
  subscribe(fn: (e: ServerEvent) => void): () => void;
  world(): World;                 // snapshot(this.stores)
};

function freshStores(): Stores {
  const s = emptyStores();
  populate(s);
  return s;
}
const offToggles = (): Toggles =>
  ({ offline: false, speed: {}, gpsLost: {}, textScale: {}, viewport: '360x670', hideSimChips: false });

/** The stage clock (§5.8, server side). Frozen, it answers its anchor; running, the anchor plus the wall time that
 *  has passed since it started, measured by `performance.now()` (monotonic, so a system clock change cannot move it).
 *  `set` jumps it and tells every `onJump` subscriber; the jump keeps the frozen/running state. */
function createClock(start: Instant, emit: (e: ServerEvent) => void): Clock {
  let anchorStage = Date.parse(start);
  let anchorWall = performance.now();
  let frozen = true;
  const jumps = new Set<() => void>();
  const nowMs = (): number => (frozen ? anchorStage : anchorStage + (performance.now() - anchorWall));
  return {
    nowIso: () => asInstant(new Date(Math.trunc(nowMs())).toISOString()),
    set(at) {
      anchorStage = Date.parse(at);
      anchorWall = performance.now();
      for (const fn of jumps) {
        try {
          fn();
        } catch {
          jumps.delete(fn);   // a jump listener from an unloaded iframe realm, dropped exactly as emit() drops one
        }
      }
      emit({ type: 'clock', jumped: true });
    },
    freeze() {
      anchorStage = nowMs();
      frozen = true;
    },
    run() {
      if (frozen) {
        anchorWall = performance.now();
        frozen = false;
      }
    },
    frozen: () => frozen,
    onJump(fn) {
      jumps.add(fn);
      return () => { jumps.delete(fn); };
    },
  };
}

/** A fresh server: the seed via `populate()`, and a frozen clock at 05:14 on the demo day. Methods refer to the
 *  server through the closure rather than `this`, so a method passed on as a callback keeps working. */
export function createServer(): Server {
  const listeners = new Set<(e: ServerEvent) => void>();
  // Deleting the entry being visited is safe while iterating a Set: the iteration simply moves on to the next one.
  const emit = (e: ServerEvent): void => {
    for (const fn of listeners) {
      try {
        fn(e);
      } catch {
        listeners.delete(fn);   // a listener from an unloaded iframe realm
      }
    }
  };
  const server: Server = {
    stores: freshStores(),
    clock: createClock(kyiv('2026-09-21 05:14'), emit),
    toggles: offToggles(),
    devices: {},
    ui: { beat: null, phone: 'device-000001', scope: 'PILOT', focus: 'both', single: 'both', consoleZoom: false,
      barHidden: false, cue: null },
    replaying: false,
    done: [],
    scriptRefs: {},
    reset() {
      server.stores = freshStores();
      server.toggles = offToggles();
      // The same object, emptied: an iframe may hold a reference to `devices` and must see the reset.
      for (const k of Object.keys(server.devices)) delete server.devices[k];
      server.done = [];
      server.scriptRefs = {};
      server.ui = { ...server.ui, beat: null };
    },
    mintSeq(deviceId) {
      const d = server.stores.devices.get(deviceId);
      if (!d) throw new Error(`mintSeq: no device ${deviceId}`);
      server.stores.devices.update(deviceId, { next_seq: d.next_seq + 1 });
      return d.next_seq;
    },
    phone(deviceId) {
      return (server.devices[deviceId] ??= { outbox: [], drafts: {}, outboxVersion: 0 });
    },
    setToggle(key, value) {
      server.toggles = { ...server.toggles, [key]: value };
      emit({ type: 'toggles' });
    },
    setUi(patch) {
      server.ui = { ...server.ui, ...patch };
      emit({ type: 'ui' });
    },
    wrote(op, c, extra) {
      emit({ type: 'changed', op, actor: c.actor, at: asInstant(c.now), params: c.params, body: c.body,
        truck_day_id: extra.truck_day_id, result_id: extra.result_id ?? null, highlight: extra.highlight ?? false,
        toast: extra.toast ?? null, replayed: server.replaying });
    },
    emit,
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    world() {
      return snapshot(server.stores);
    },
  };
  return server;
}

/** The parent's server when this document is a same-origin iframe of the stage; `null` at the top level, and `null`
 *  when the parent is cross-origin (reading its property throws). */
export function inherit(): Server | null {
  try {
    if (typeof window === 'undefined' || window.parent === window) return null;
    return window.parent.__ktlServer ?? null;
  } catch {
    return null;                      // cross-origin parent
  }
}

const isStage = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('profile') === 'demo';
export const server: Server = inherit() ?? createServer();
if (isStage) window.__ktlServer = server;

declare global {
  interface Window { __ktlServer?: Server }
}
