// mocks/driver-report/src/stage/hub.ts
/** What the presenter's controls DO (§5.4, §5.8, I-13). The bar renders; this decides.
 *
 *  Every method reads `server` at CALL TIME rather than closing over a rendered value, so the object `useHub()`
 *  returns is stable for the life of the page and a button handler can never act on a beat that has since changed.
 *
 *  The four iframes are addressed imperatively, through `frames`. That is deliberate and it is the one place the
 *  stage steps outside React: «Такт» must RELOAD a pane — assigning `src` the same string is what re-navigates it —
 *  and a re-render that merely re-declares the same `src` attribute would do nothing at all. The page therefore
 *  renders each frame's src ONCE (its initial value) and hands the element here. */
import { server } from '../api/server';
import { allRows } from '../api/stores';
import { BEATS, HRYHORII, OLEH, PAVLO, type Beat } from '../domain/script';
import type { Scope } from '../domain/types';
import { consoleHash, rebuild } from './runner';

export type FrameName = 'phone-1' | 'phone-2' | 'phone-3' | 'console';

export type Hub = { goBeat(n: number): Promise<void>; selectPhone(deviceId: string): void; setScope(s: Scope): void;
  toggleOffline(): void; toggleSpeed(): void; toggleGps(): void; reset(): Promise<void>;
  frames: { register(name: FrameName, el: HTMLIFrameElement | null): void; reloadAll(): void } };

/** The three phones on the stage (§5.1, §5.3, §5.4 #4). The copy is pinned here rather than derived from the seed
 *  because it is the PRESENTER's vocabulary, not the product's: «Регіс-машина» and «Ruptela-машина» name what the
 *  audience is being shown, the caption puts the given name first («Павло Ватаманюк», where the seed's `full_name`
 *  is «Ватаманюк Павло»), and Григорій's phone is unbound until beat 1, so at beat 0 there is no driver row to read
 *  a name off at all. The plate is the one field that IS a key: the R+C toggles resolve their truck through it. */
export type StagePhone = { id: string; slot: FrameName; segment: string; short: string; of: string; caption: string;
  plate: string };
export const STAGE_PHONES: readonly StagePhone[] = [
  { id: PAVLO, slot: 'phone-1', segment: 'Регіс-машина · Павло', short: 'Павло', of: 'Павла',
    caption: 'Телефон водія · Павло Ватаманюк · АР 1234 ВС', plate: 'АР 1234 ВС' },
  { id: OLEH, slot: 'phone-2', segment: 'Ruptela-машина · Олег', short: 'Олег', of: 'Олега',
    caption: 'Телефон водія · Олег Кравчук · АР 9012 МК', plate: 'АР 9012 МК' },
  { id: HRYHORII, slot: 'phone-3', segment: 'Новий водій · Григорій', short: 'Григорій', of: 'Григорія',
    caption: 'Телефон водія · Григорій Савенко · АР 7390 ЕВ', plate: 'АР 7390 ЕВ' },
];
/** The office pane's caption (§5.3). */
export const CONSOLE_CAPTION = 'Офіс · Наталія Шевчук, оператор';

export const phoneOf = (deviceId: string): StagePhone | null =>
  STAGE_PHONES.find((p) => p.id === deviceId) ?? null;

/** Each pane is its own document with its own viewport, hash router and CAPS (§5.1); `stage=1` is what tells the
 *  driver app it is framed rather than in a hand (§2.1). */
export const phoneSrc = (deviceId: string): string => `/?profile=driver&device=${deviceId}&stage=1#/`;
export const consoleSrc = (beat: Beat): string =>
  `/?profile=dispatcher&user=natalia&stage=1${consoleHash(beat)}`;

export function beatOf(n: number | null): Beat | null {
  return n === null ? null : BEATS.find((b) => b.n === n) ?? null;
}

/** The truck of the phone in the frame, resolved by plate against the realm's own rows — so «Швидкість» and «GPS
 *  зник» key `server.toggles` on the same truck id the handlers read them by. */
export function framedTruck(deviceId: string): { id: string; rc: boolean } | null {
  const phone = phoneOf(deviceId);
  if (phone === null) return null;
  const truck = allRows(server.stores.trucks).find((t) => t.plate === phone.plate);
  return truck === undefined ? null : { id: truck.id, rc: truck.telematics === 'RUPTELA' };
}

/** The speed «Швидкість 60 км/год» puts on the framed truck (§5.4 #7). */
const DEMO_KMH = 60;

/** One registry per realm: the stage is a single page, and a remount replaces an entry rather than adding one. */
const els = new Map<FrameName, HTMLIFrameElement>();

function register(name: FrameName, el: HTMLIFrameElement | null): void {
  if (el === null) els.delete(name);
  else els.set(name, el);
}

/** «Такт» sends every pane back to the beat's route (§5.8). Assigning `src` re-navigates the iframe even when the
 *  string is unchanged, which is exactly what a rebuilt server needs from a pane that is still showing the old one. */
function reloadAll(): void {
  for (const phone of STAGE_PHONES) {
    const el = els.get(phone.slot);
    if (el !== undefined) el.src = phoneSrc(phone.id);
  }
  const office = els.get('console');
  const beat = beatOf(server.ui.beat);
  if (office !== undefined && beat !== null) office.src = consoleSrc(beat);
}

/** Every toggle off, on every «Такт» (§5.4 #9) — `rebuild` does it through `server.reset()`, and this is the note
 *  that says so, because nothing in the bar would otherwise explain why a toggle it set is suddenly off. */
async function goBeat(n: number): Promise<void> {
  await rebuild(n);
  server.clock.run();
  reloadAll();
  const beat = beatOf(n);
  if (beat !== null) server.setUi({ beat: n, phone: beat.phone, scope: beat.scope, cue: beat.cue });
}

const hub: Hub = {
  goBeat,
  selectPhone(deviceId) {
    server.setUi({ phone: deviceId });
  },
  setScope(scope) {
    server.setUi({ scope });
  },
  /** All three phones lose the network; the console stays online. Idempotent by construction: the button renders
   *  the toggle's own state, so «on» twice is «on» (§5.8). */
  toggleOffline() {
    server.setToggle('offline', !server.toggles.offline);
  },
  toggleSpeed() {
    const truck = framedTruck(server.ui.phone);
    if (truck === null) return;
    const speed = { ...server.toggles.speed };
    if (truck.id in speed) delete speed[truck.id];
    else speed[truck.id] = DEMO_KMH;
    server.setToggle('speed', speed);
  },
  /** Only the R+C truck has automatic arrivals to lose, so only Олег's phone can render the RG path (D3, §5.4 #8). */
  toggleGps() {
    const truck = framedTruck(server.ui.phone);
    if (truck === null || !truck.rc) return;
    const gpsLost = { ...server.toggles.gpsLost };
    if (truck.id in gpsLost) delete gpsLost[truck.id];
    else gpsLost[truck.id] = true;
    server.setToggle('gpsLost', gpsLost);
  },
  /** «Скинути демо» (§5.4 #10): beat 0 IS the seed at 05:14, whatever the wall date — the clock comes from the beat
   *  and never from `Date.now()` (EC-129). The stage log is W3-03's to clear. */
  reset() {
    return goBeat(0);
  },
  frames: { register, reloadAll },
};

export function useHub(): Hub {
  return hub;
}
