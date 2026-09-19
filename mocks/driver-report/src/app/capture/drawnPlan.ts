// mocks/driver-report/src/app/capture/drawnPlan.ts
/**
 * What the viewfinder shows instead of a camera frame (§3.3 D-06, §6.11, D4): the ordered artefacts a flow will
 * photograph, one spec per shot.
 *
 * It READS `SCRIPT` rather than keeping a second table of ТТН numbers. That is the whole design: the demo day already
 * says, once, which pages Павло hands over at Вільнянськ and which number is on them (S-10), and a copy here could
 * drift from it silently — the presenter would photograph `ttn-004517` while the office opened `ttn-004520` and
 * nothing would be red. Григорій's numbers and Олег's WOG receipt come out of the same read, so «Григорій's pages use
 * his ТТН numbers» needs no rule of its own.
 *
 * Two things do NOT come from the script, because they belong to the moment rather than to the day:
 *  - the DASH reading. The stage can be rewound, a flow can be replayed and the office can have corrected an
 *    odometer since, so the digits on the drawn cluster are the value the flow EXPECTS now (§7.3), not the one the
 *    script photographed. The one exception is an authored MISREAD — «Лан», where `sim_read` 412 866 differs from the
 *    412 566 on the paper — because that pair is the point of the digit question (§8.2 D-08 #4) and copying it is the
 *    only way to keep it.
 *  - a flow the script never took. Then there is nothing authored to draw: a step that photographs a dash still gets
 *    its cluster (every truck has one), and a step that photographs a DOCUMENT gets nothing rather than somebody
 *    else's ТТН. The caller draws an empty seat for a shot this list does not reach.
 */
import { SCRIPT } from '../../domain/script';
import type { PageTemplate, RecordTemplate } from '../../domain/script';
import type { ArtefactKind, Km, RecordType } from '../../domain/types';
import type { FlowKind } from '../flow';

/** One drawn artefact: the picture to draw, what the "OCR" will read off it (§6.11), and WHICH page of which
 *  document it is.
 *
 *  The numbering rides here rather than being re-derived by each flow because the script already states it — S-10's
 *  four pages are 1/1, 1/2, 2/1, 2/2 — and it is what the office reads back: `domain/exceptions.ts` builds
 *  «ТТН 2 з 2, зворотний» out of `doc_index`, and a retake request (§3.3 D-13) names exactly one of the four. A camera
 *  is shown one page and cannot know it is the reverse of the second ТТН of two, so a spec that dropped the pair
 *  would leave four separate Wave 2 flows to reconstruct it by hand with nothing red when one of them got it wrong. */
export type DrawnSpec = { artefact: ArtefactKind; doc_index: number; page_no: number; variant: string;
  value: string | null; sim_read: string | null };

export type DrawnContext = {
  deviceId: string;
  flow: FlowKind;
  stopPlanKey: string | null;
  expectedKm: Km | null;
  retake: { artefact: ArtefactKind; doc_index: number; page_no: number } | null;
};

/** Which record a flow ends in — which is also which scripted pages it photographs. A flow that is absent here
 *  photographs nothing: «Стою», «Я в іншому місці» and a segment change are taps, not documents. */
const CAPTURE_OF: Partial<Record<FlowKind, RecordType>> = {
  'shift-start': 'SHIFT_START',
  arrive: 'ARRIVED',
  loaded: 'LOADED',
  unloaded: 'UNLOADED',
  later: 'DOCS_ADDED',
  refuel: 'REFUEL',
  'refuel-later': 'REFUEL',
  'shift-end': 'SHIFT_END',
};

/** The flows whose whole capture is the dash: with no scripted photograph they still show a cluster, because the
 *  odometer is the one artefact every truck carries (§3.3 D-03, D-04, D-14). */
const DASH_ONLY: readonly FlowKind[] = ['shift-start', 'arrive', 'shift-end'];

/** «000000» — a dash drawn for a step with no expected reading at all (D6: the app shows no number either). */
const NO_READING = 'cluster:000000';

/** A dash is always the whole of its own document: one page, one copy. The script agrees — every `cluster()` template
 *  it writes is `pg('CLUSTER', 1, 1, …)` — so a synthesised cluster and a scripted one are numbered alike. */
const clusterFor = (km: Km | null, authored: string | null = null): DrawnSpec => {
  const digits = km === null ? authored : String(km);
  if (digits === null) return { artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: NO_READING, value: null, sim_read: null };
  return { artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: `cluster:${digits}`, value: digits, sim_read: digits };
};

const records = (): RecordTemplate[] =>
  SCRIPT.flatMap((entry) => (entry.step.kind === 'record' ? entry.step.records : []));

/** The pages the script photographs for this phone, this record and — when the flow names one — this planned stop.
 *  A record with no pages is not a match: «Вивантажено» at «Лан» commits deferred, and the pages arrive later under
 *  `DOCS_ADDED`. */
function scriptedPages(deviceId: string, type: RecordType, planKey: string | null): PageTemplate[] {
  for (const record of records()) {
    if (record.device !== deviceId || record.type !== type) continue;
    if (planKey !== null && record.plan_key !== planKey) continue;
    if (record.pages.length === 0) continue;
    return record.pages;
  }
  return [];
}

function specOf(page: PageTemplate, expectedKm: Km | null): DrawnSpec {
  const at = { doc_index: page.doc_index, page_no: page.page_no };
  if (page.artefact !== 'CLUSTER') {
    return { artefact: page.artefact, ...at, variant: page.variant, value: page.value, sim_read: page.sim_read };
  }
  const misread = page.sim_read !== null && page.sim_read !== page.value;
  const sameReading = expectedKm === null || page.value === String(expectedKm);
  if (misread && sameReading) {
    return { artefact: 'CLUSTER', ...at, variant: page.variant, value: page.value, sim_read: page.sim_read };
  }
  return { ...clusterFor(expectedKm, page.value), ...at };
}

/** `ttn-004518-back:soft` → `ttn-004518-back`. Every modifier §6.11 defines is a colon suffix, so the clean page is
 *  the base. Never called on a cluster, whose digits are a suffix too. */
const cleanVariant = (variant: string): string => variant.split(':')[0] ?? variant;

/** The page the office is asking for again (§3.3 D-13), found by what it IS rather than by which record carried it,
 *  so a replacement already in the script resolves to the same paper. */
function pageLike(deviceId: string, want: { artefact: ArtefactKind; doc_index: number; page_no: number },
  planKey: string | null): PageTemplate | null {
  const matches = (record: RecordTemplate): PageTemplate | null =>
    record.device !== deviceId
      ? null
      : record.pages.find((p) => p.artefact === want.artefact && p.doc_index === want.doc_index
        && p.page_no === want.page_no) ?? null;
  const all = records();
  for (const record of all) {
    if (planKey !== null && record.plan_key !== planKey) continue;
    const page = matches(record);
    if (page !== null) return page;
  }
  for (const record of all) {
    const page = matches(record);
    if (page !== null) return page;
  }
  return null;
}

/** I-15: the artefacts this flow photographs, in the order it photographs them. */
export function drawnFor(ctx: DrawnContext): DrawnSpec[] {
  if (ctx.flow === 'retake') {
    const want = ctx.retake;
    if (want === null) return [];
    // A retake is numbered by what the office ASKED for, never by where it sits in this one-page shoot: the
    // replacement has to supersede exactly the page named in the request (§3.3 D-13, S-14 supersedes S-10's page 4).
    const at = { doc_index: want.doc_index, page_no: want.page_no };
    if (want.artefact === 'CLUSTER') return [{ ...clusterFor(ctx.expectedKm), ...at }];
    const page = pageLike(ctx.deviceId, want, ctx.stopPlanKey);
    return page === null
      ? []
      : [{ artefact: want.artefact, ...at, variant: cleanVariant(page.variant), value: null, sim_read: null }];
  }
  const type = CAPTURE_OF[ctx.flow];
  if (type === undefined) return [];
  const pages = scriptedPages(ctx.deviceId, type, ctx.stopPlanKey);
  if (pages.length !== 0) {
    const specs = pages.map((page) => specOf(page, ctx.expectedKm));
    // D7: a refuel photographed later asks for the receipt only — its odometer is CAN or the office's.
    return ctx.flow === 'refuel-later' ? specs.filter((spec) => spec.artefact !== 'CLUSTER') : specs;
  }
  return DASH_ONLY.includes(ctx.flow) ? [clusterFor(ctx.expectedKm)] : [];
}
