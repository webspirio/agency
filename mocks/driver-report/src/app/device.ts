// mocks/driver-report/src/app/device.ts
/** Who this page is, read ONCE from the URL (§2.1) through the scaffold-owned profile, and never persisted: a stored
 *  identity would survive the pre-call reset and put the wrong phone on the stage. */
import { between, toInt } from '../domain/num';
import { ACTOR, PROFILE } from '../profiles';

const search = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

export const PROFILE_ID = PROFILE.id as 'driver' | 'dispatcher' | 'demo';
/** The phone's device id (`ACTOR.id`) on the driver profile; '' on the console and the stage. */
export const DEVICE_ID: string = PROFILE_ID === 'driver' ? ACTOR.id : '';
/** `?stage=1`: this page is one of the stage's iframes. */
export const IS_STAGE: boolean = search.get('stage') === '1';

function coarsePointer(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
/** A finger, not a mouse: `matchMedia('(pointer: coarse)')`, false where matchMedia is absent. */
export const IS_TOUCH: boolean = coarsePointer();
/** The driver app opened on a real phone outside the stage: it shows the one-device banner (§2.1, EC-134). */
export const STANDALONE_TOUCH: boolean = PROFILE_ID === 'driver' && !IS_STAGE && IS_TOUCH;

/** `?beat=0..13`, else `fallback` (driver 2, dispatcher 10, demo 0 — §2.1). */
export function urlBeat(fallback: number): number {
  const raw = search.get('beat') ?? '';
  if (!/^\d{1,2}$/.test(raw)) return fallback;
  const beat = toInt(raw);
  return between(beat, 0, 13) ? beat : fallback;
}

/** Per-viewer conveniences in localStorage (try/catch at every use; the page works without them): the «Що бачить
 *  офіс» row and the «Ось так» cards are shown until these are set. The server's `first_time` flags are the seed's
 *  truth. */
export const officeSeesKey = (deviceId: string): string => `driver-report:office-sees:${deviceId}`;
export const examplesKey = (deviceId: string): string => `driver-report:examples:${deviceId}`;
