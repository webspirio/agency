// mocks/driver-report/src/pages/driver/flows/shiftReceipts.ts
/** What the three shift flows — «Почати зміну» (D-03), «Я на місці» (D-04) and «Що зараз?» (D-05) — hand to home
 *  when they commit, and the two facts they all have to work out first.
 *
 *  THE RECEIPT IS THE FLOW'S LAST SENTENCE, so it is composed here rather than inside three page files: «Зміну
 *  почато 05:20 · 412 355 км» and «На місці 06:10 · 412 391 км» differ by a verb, and a second copy of the km half
 *  is a second place for the NBSP, the «· CAN» and the missing number of an unread dash to drift. The «Далі: …»
 *  line the ReceiptCard shows under the status is NOT here: `docReceipts.nextLine` composes it for every flow that
 *  hands one over, because one demo must not word «what is next» two ways.
 *
 *  THE LAST TRUSTED READING is the other shared fact, and it is NOT `today.odometer_ref`. That field is the server's
 *  answer flattened to four kinds, and the one it loses is exactly the one the arrival needs: a shift start earlier
 *  today comes back as `POINT`, so `expectedOdometer` would word the arrival «+36 км» instead of «+36 км від
 *  виїзду» (§3.3 D-09). So the phone rebuilds the points itself — the reference, then every reading in today's
 *  records, then every reading still in the outbox — and asks the domain (`lastTrustedOf`) which one counts. The
 *  reference goes FIRST on purpose: `lastTrustedOf` keeps the later of two points at the same instant, so a record
 *  that re-states the reference wins with its own, unflattened kind.
 *
 *  «Ось так» (D-06) lives here too, because both capture flows ask the same question of the same two lists: the
 *  server's `first_time.examples_seen` — the seed's truth, which marks all seven kinds seen for Павло and Олег so
 *  the stage never shows the card — and the per-viewer list in localStorage beside it. */
import { asInstant } from '@agency/mock';
import { DEVICE_ID, examplesKey } from '../../../app/device';
import { fmtKm, fmtTime } from '../../../app/format';
import type { ReceiptMeta } from '../../../app/outbox';
import { DC } from '../../../copy/driver';
import type { DriverToday, RecordIn } from '../../../domain/dto';
import { lastTrustedOf, type LastTrusted, type OdometerPoint } from '../../../domain/odometer';
import type { ArtefactKind, Instant, Km, Odometer, RecordPayload, RecordType, SegmentChip } from '../../../domain/types';

/* ── the receipts ─────────────────────────────────────────────────── */

/** « · 412 355 км», and « · CAN» when the number came off the bus rather than off a photo (§3.3 D-09 tier 1). */
function odometerTail(odometer: Odometer | null): string {
  if (odometer === null || odometer.value === null) return '';
  return ` · ${fmtKm(odometer.value)} км${odometer.source === 'CAN' ? ' · CAN' : ''}`;
}

/** «Зміну почато 05:20 · 412 355 км» · R+C «Зміну почато 07:20 · 241 476 км · CAN» (§3.3 D-03). */
export const shiftStartReceipt = (at: Instant, odometer: Odometer | null, next: string | null): ReceiptMeta =>
  ({ title: `Зміну почато ${fmtTime(at)}${odometerTail(odometer)}`, next });

/** «На місці 06:10 · 412 391 км»; at a no-photo place there is no number yet, so the sentence simply ends (D-04). */
export const arriveReceipt = (at: Instant, odometer: Odometer | null): ReceiptMeta =>
  ({ title: `На місці ${fmtTime(at)}${odometerTail(odometer)}`, next: null });

/** «Ваги · з 07:52» (§3.3 D-05). */
export const segmentReceipt = (chip: SegmentChip, at: Instant): ReceiptMeta =>
  ({ title: `${DC.segments[chip]} · з ${fmtTime(at)}`, next: null });

/* ── the last trusted reading ─────────────────────────────────────── */

/** Which records are odometer points at all, and what each one is to `lastTrustedOf` (§7.3). */
const POINT_KIND: Partial<Record<RecordType, OdometerPoint['kind']>> = {
  SHIFT_START: 'SHIFT_START', ARRIVED: 'ARRIVAL', REFUEL: 'REFUEL', SHIFT_END: 'SHIFT_END', DOCS_ADDED: 'DOCS',
};

/** The reading a payload carries, for the five record types that carry one. */
const odometerOf = (payload: RecordPayload): Odometer | null => ('odometer' in payload ? payload.odometer : null);

/** A point the phone can build: it knows the value and the moment, never whether the office has flagged it. */
const point = (at: Instant, value: Km | null, kind: OdometerPoint['kind'], atBase: boolean): OdometerPoint =>
  ({ at, value, source: 'DASH_PHOTO', kind, place_id: null, flagged: false, at_base: atBase, record_key: null });

/** `today.odometer_ref` as a point again. Every kind the view distinguishes is carried straight across; only the
 *  anonymous POINT has to pick a record kind, and ARRIVAL is the one that reads «+N км від «…»». */
function referencePoint(today: DriverToday): OdometerPoint[] {
  const ref = today.odometer_ref;
  if (ref.value === null || ref.at === null || ref.kind === 'NONE') return [];
  const kind: OdometerPoint['kind'] = ref.kind === 'MECHANIC' ? 'MECHANIC'
    : ref.kind === 'SHIFT_END_AT_BASE' ? 'SHIFT_END'
      : ref.kind === 'SHIFT_START' ? 'SHIFT_START'
        : ref.kind === 'CAN' ? 'CAN' : 'ARRIVAL';
  return [{ ...point(ref.at, ref.value, kind, ref.kind === 'SHIFT_END_AT_BASE'),
    source: ref.source ?? 'DASH_PHOTO' }];
}

/** The GENITIVE of the place the last trusted reading was taken at, for the basis line «+23 км від «Лану»» (§3.3
 *  D-09). A shift start words itself «від виїзду» and needs none, and a place nobody can name DROPS the clause
 *  rather than printing a wrong case — every case a sentence needs is authored on the place, never derived here.
 *  The reference answers for itself; a reading from a record is named by the stop the plan files it under. */
export function fromLabelOf(today: DriverToday, last: LastTrusted | null): string | null {
  if (last === null || last.kind === 'SHIFT_START') return null;
  const ref = today.odometer_ref;
  if (ref.at === last.at && ref.value === last.value) return ref.place_gen;
  const rec = today.records.find((r) => r.occurred_at === last.at && odometerOf(r.payload)?.value === last.value);
  if (rec === undefined) return null;
  const stops = today.plan?.stops ?? [];
  const stop = stops.find((s) => s.stop_id === rec.stop_id) ?? stops.find((s) => s.place_id === rec.place_id);
  return stop?.label_gen ?? null;
}

/** The reading every expectation starts from, as the PHONE sees it: the server's reference, then today's records,
 *  then whatever is still in the outbox. Order is the tie-breaker (see the file header) — never sorted. */
export function lastTrusted(today: DriverToday, pending: readonly RecordIn[], before: Instant): LastTrusted | null {
  const points: OdometerPoint[] = [...referencePoint(today)];
  for (const r of today.records) {
    const kind = POINT_KIND[r.type];
    const odo = odometerOf(r.payload);
    if (kind === undefined || r.voided || odo === null || odo.value === null) continue;
    points.push(point(r.occurred_at, odo.value, kind, false));
  }
  for (const r of pending) {
    const kind = POINT_KIND[r.type];
    const odo = odometerOf(r.payload);
    if (kind === undefined || odo === null || odo.value === null) continue;
    points.push(point(asInstant(r.occurred_at), odo.value, kind, false));
  }
  return lastTrustedOf(points, before);
}

/* ── «Ось так» (§3.3 D-06) ────────────────────────────────────────── */

/** The per-viewer half of the list, beside the server's `first_time.examples_seen`. A blocked or cleared store is
 *  not an error: the card simply shows again. */
function seenHere(): ArtefactKind[] {
  try {
    const raw = window.localStorage.getItem(examplesKey(DEVICE_ID));
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is ArtefactKind => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Whether this capture step still owes the driver an example of this kind of paper. */
export const exampleNeeded = (today: DriverToday, artefact: ArtefactKind): boolean =>
  !today.first_time.examples_seen.includes(artefact) && !seenHere().includes(artefact);

/** «Зрозумів»: the kind joins the per-viewer list and never returns. */
export function rememberExample(artefact: ArtefactKind): void {
  try {
    const next = [...new Set([...seenHere(), artefact])];
    window.localStorage.setItem(examplesKey(DEVICE_ID), JSON.stringify(next));
  } catch {
    // A viewer with site data blocked simply sees the card again; nothing else depends on it.
  }
}
