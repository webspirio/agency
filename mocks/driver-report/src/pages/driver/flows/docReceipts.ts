// mocks/driver-report/src/pages/driver/flows/docReceipts.ts
/**
 * What the three document flows hand to home: the receipt title and the «Далі: …» line under it (§3.3 D-07, D-08).
 *
 * It lives beside the pages rather than in `src/copy` because these sentences are ASSEMBLED from one stop's own row —
 * «Вивантаження 1 з 2 · 11:50 · ТТН 004517» is `drop_index`, `drop_count`, the flow's own minute and `ttn_nos` — and a
 * copy file that held the halves would leave the joining to three pages that could each join them differently. One
 * function per receipt, and every page reads its sentence from here.
 *
 * The «Далі» line is built from the NEXT stop of the day's plan, not from the one being committed: after a loading it
 * names the first drop, after a drop the next one, and after the last drop there is nothing to say (home's own
 * primary becomes «Закінчити зміну»). A no-photo place adds its warning to that line, so the driver reads it while he
 * still has the wheel rather than at the gate.
 */
import { fmtKm, fmtTime } from '../../../app/format';
import type { PlannedStopView } from '../../../domain/dto';
import type { Deferred, Instant, Km, NoDocReason } from '../../../domain/types';

/** The tail a deferred capture puts where the documents would have been (§3.3 D-06 «Deferred»). */
const DEFERRED_TAIL: Record<Deferred, string> = {
  AT_PARKING: 'фото — на стоянці',
  AFTER_EXIT: 'фото — після виїзду',
};
/** The tail a commit with no document puts there. «Електронна ТТН» is its own sentence: nothing is owed later. */
const NO_TTN = 'без ТТН';
const NO_SIGNED_TTN = 'без ТТН з підписом';
const ETTN = 'електронна ТТН';
/** The line a drop at a place flagged «Фото на території заборонені» adds to «Далі: …» (§3.3 D-08). */
const NO_PHOTOS_AHEAD = 'На фермі фото заборонені — знімете після виїзду';

/** Which deferral this stop's postponed capture is: a farm that forbids photographs is «після виїзду», every other
 *  put-off is «на стоянці» (§3.3 D-06). */
export const deferredAt = (stop: PlannedStopView): Deferred => (stop.no_photos ? 'AFTER_EXIT' : 'AT_PARKING');

/** The stop after this one in the day's plan, or null at the end of it. */
export function stopAfter(stops: readonly PlannedStopView[], stopId: string): PlannedStopView | null {
  const at = stops.findIndex((s) => s.stop_id === stopId);
  return at === -1 ? null : stops[at + 1] ?? null;
}

/** «Далі: вивантаження 1 з 2 — Злагода, Синельникове · Відсіки 1–3 · ТТН 004517» (§3.3 D-07, D-08). */
export function nextLine(next: PlannedStopView | null): string | null {
  if (next === null) return null;
  // Every flow that hands a receipt to home reads this ONE function — the shift start (§3.3 D-03) included, which
  // is why the loading and base sentences live here beside the drop's.
  if (next.kind === 'LOADING') return `Далі: завантаження — ${next.short}`;
  if (next.kind === 'BASE') return 'Далі: повернення на базу';
  if (next.kind !== 'DROP') return null;
  const drop = next.drop_index === null || next.drop_count === null
    ? 'вивантаження'
    : `вивантаження ${next.drop_index} з ${next.drop_count}`;
  const parts = [`${drop} — ${next.short}`];
  if (next.compartments !== null) parts.push(`Відсіки ${next.compartments}`);
  if (next.ttn_nos.length !== 0) parts.push(`ТТН ${next.ttn_nos.join(', ')}`);
  if (next.no_photos) parts.push(NO_PHOTOS_AHEAD);
  return `Далі: ${parts.join(' · ')}`;
}

type Outcome = { deferred: Deferred | null; noDoc: NoDocReason | null };

const tailFor = (o: Outcome, none: string): string | null => {
  if (o.deferred !== null) return DEFERRED_TAIL[o.deferred];
  if (o.noDoc !== null) return o.noDoc === 'ETTN' ? ETTN : none;
  return null;
};

/** «Завантажено 08:40 · 2 ТТН, 4 стор.»; R+C adds «· 241 512 км · CAN» (§3.3 D-07). */
export function loadedTitle(at: Instant, p: Outcome & { ttn: number; pages: number; canKm: Km | null }): string {
  const tail = tailFor(p, NO_TTN) ?? `${p.ttn} ТТН, ${p.pages} стор.`;
  const can = p.canKm === null ? '' : ` · ${fmtKm(p.canKm)} км · CAN`;
  return `Завантажено ${fmtTime(at)} · ${tail}${can}`;
}

/** «Вивантаження 1 з 2 · 11:50 · ТТН 004517» · «Вивантаження 2 з 2 · 15:08 · фото — після виїзду» (§3.3 D-08). */
export function unloadedTitle(at: Instant, stop: PlannedStopView, p: Outcome): string {
  const head = stop.drop_index === null || stop.drop_count === null
    ? 'Вивантаження'
    : `Вивантаження ${stop.drop_index} з ${stop.drop_count}`;
  const ttn = stop.ttn_nos.length === 0 ? 'без номера' : `ТТН ${stop.ttn_nos.join(', ')}`;
  return `${head} · ${fmtTime(at)} · ${tailFor(p, NO_SIGNED_TTN) ?? ttn}`;
}

/** «Фото додано 15:17 · ТТН 004518 · 412 566 км» (§3.3 D-08 «Deferred capture»). */
export function docsAddedTitle(at: Instant, stop: PlannedStopView, km: Km | null): string {
  const parts = [`Фото додано ${fmtTime(at)}`];
  if (stop.ttn_nos.length !== 0) parts.push(`ТТН ${stop.ttn_nos.join(', ')}`);
  if (km !== null) parts.push(`${fmtKm(km)} км`);
  return parts.join(' · ');
}
