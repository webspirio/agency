// mocks/driver-report/src/pages/driver/LoadedPage.tsx
/**
 * «Завантажено — фото ТТН» (§3.3 D-07): every page of every ТТН, both sides, photographed as the executed document is
 * handed over — and a way out for the day when it is not.
 *
 * THE PAGES COME FROM THE PLAN, NOT FROM THE CONSIGNEE. The titles count «ТТН 1 з 2», «ТТН 2 з 2» off
 * `ttn_expected`, because a driver at the gate knows how many papers are in his hand and does not know which farm
 * each belongs to [DRV-15]. The last expected ТТН's first page offers «Більше ТТН немає» in place of «Немає
 * документа»: that is the tap for a plan that says two and a shipper who gave one, and it ends the sequence at the
 * grid with the pages already taken.
 *
 * NOTHING HERE REFUSES ANYTHING (§8.6 #11). «Зніму на стоянці» commits the loading now, with the tap's own minute
 * and whatever was photographed, and home carries the reminder; «Немає документа» opens the four reasons of D-06,
 * three of which commit with the reason and one of which — «ТТН ще друкують» — commits nothing at all: it marks the
 * draft and leaves, and home shows it as «ТТН ще друкують — сфотографуйте, щойно дадуть» until the paper arrives.
 *
 * The flow's own state is the draft: the pages taken, the step, and which one-off shot the grid asked for. A step is
 * re-enterable by Back with its answers intact because none of it lives in this component (§2.2, EC-159).
 */
import { useEffect, useRef, type JSX } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { drawnFor } from '../../app/capture/drawnPlan';
import { chooseEngine } from '../../app/capture/engine';
import { DEVICE_ID } from '../../app/device';
import { useCommitOnce, useFlow } from '../../app/flow';
import { buildPages, buildRecord, type CapturedPage } from '../../app/records';
import { DriverSkeleton } from '../../components/driver';
import { NoDocumentPage, type AddKind, type Row2Kind } from '../../components/driver/capture';
import { DC } from '../../copy/driver';
import type { DriverToday, PlannedStopView } from '../../domain/dto';
import type { ArtefactKind, Deferred, NoDocReason } from '../../domain/types';
import { useDriverGuard, useJustUnlocked } from './DriverShell';
import { CaptureSequence, HINT, ttnTitle, type Shot } from './flows/CaptureSequence';
import { loadedTitle, nextLine, stopAfter } from './flows/docReceipts';

const GRID = 'grid';
const NO_DOC = 'nodoc';
const EXTRA = 'extra';
const TICKET = 'ticket';
const TTN_SIDES: readonly ArtefactKind[] = ['TTN_FRONT', 'TTN_BACK'];
const ADD_KINDS = ['MORE_TTN', 'PAGE', 'TICKET', 'ACT'] as const;
/** §3.3 D-06's grid chips for a loading. «+ Акт» is P1 and is not offered. */
const ADD_CHIPS: readonly AddKind[] = ['MORE_TTN', 'PAGE', 'TICKET'];
const TICKET_TITLE = 'Талон з ваг';
const ACT_TITLE = 'Акт';

const readRetake = (data: Record<string, unknown>): number | null => {
  const raw = data['retake'];
  return typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
};
const readAdd = (data: Record<string, unknown>): AddKind | null =>
  ADD_KINDS.find((k) => k === data['addKind']) ?? null;

const isTtn = (page: CapturedPage): boolean => TTN_SIDES.some((s) => s === page.artefact);

function titleOf(artefact: ArtefactKind, doc: number, expected: number): string {
  if (artefact === 'TTN_FRONT' || artefact === 'TTN_BACK') return ttnTitle(artefact, doc, Math.max(expected, doc));
  return artefact === 'WEIGH_TICKET' ? TICKET_TITLE : ACT_TITLE;
}

/** The pages of one loading, in the order the driver hands them over: front and back of each expected ТТН, then the
 *  weigh ticket where the place gives one (§3.3 D-07). The count under the title is every page plus the grid. */
function loadingShots(stop: PlannedStopView): Shot[] {
  const expected = Math.max(stop.ttn_expected, 1);
  const ticket = stop.weigh_ticket;
  const sides = Array.from({ length: expected }, (_unused, i) => i + 1)
    .flatMap((doc) => [{ doc, page: 1 }, { doc, page: 2 }]);
  const total = sides.length + (ticket ? 1 : 0) + 1;
  const name = (doc: number, page: number): string => `p${String(doc)}-${String(page)}`;
  const shots: Shot[] = sides.map(({ doc, page }, i) => {
    const after = sides[i + 1];
    const artefact: ArtefactKind = page === 1 ? 'TTN_FRONT' : 'TTN_BACK';
    // «Більше ТТН немає» belongs to the first page of the LAST ТТН the plan expects: the tap for a plan that says
    // two and a hand that holds one. On a one-ТТН plan it never appears — «Немає документа» is the way out there.
    const noMore = doc === expected && page === 1 && expected !== 1;
    return {
      step: name(doc, page),
      next: after === undefined ? (ticket ? TICKET : GRID) : name(after.doc, after.page),
      artefact,
      title: ttnTitle(artefact, doc, expected),
      hint: HINT.TTN_FRONT,
      doc_index: doc,
      page_no: page,
      row2: [noMore ? 'NO_MORE_TTN' : 'NO_DOC', 'AT_PARKING'],
      count: { index: i, total },
    };
  });
  if (!ticket) return shots;
  return [...shots, { step: TICKET, next: GRID, artefact: 'WEIGH_TICKET', title: TICKET_TITLE,
    hint: HINT.WEIGH_TICKET, doc_index: 1, page_no: 1, row2: ['NO_TICKET'],
    count: { index: sides.length, total } }];
}

/** The one-off shot the grid asked for: a page retaken in place, or a document the plan did not expect. */
function extraShot(data: Record<string, unknown>, pages: readonly CapturedPage[], expected: number): Shot[] {
  const at = readRetake(data);
  if (at !== null) {
    const page = pages[at];
    if (page === undefined) return [];
    return [{ step: EXTRA, next: GRID, artefact: page.artefact, doc_index: page.doc_index, page_no: page.page_no,
      title: titleOf(page.artefact, page.doc_index, expected), hint: HINT[page.artefact], row2: [], replaces: at }];
  }
  const kind = readAdd(data);
  if (kind === null) return [];
  const ttn = pages.filter(isTtn);
  const lastDoc = ttn.reduce((most, p) => Math.max(most, p.doc_index), 0);
  const lastPage = ttn.filter((p) => p.doc_index === lastDoc).reduce((most, p) => Math.max(most, p.page_no), 0);
  const spec: { artefact: ArtefactKind; doc_index: number; page_no: number } = kind === 'MORE_TTN'
    ? { artefact: 'TTN_FRONT', doc_index: lastDoc + 1, page_no: 1 }
    : kind === 'PAGE'
      ? { artefact: 'TTN_BACK', doc_index: Math.max(lastDoc, 1), page_no: lastPage + 1 }
      : kind === 'TICKET'
        ? { artefact: 'WEIGH_TICKET', doc_index: 1, page_no: 1 }
        : { artefact: 'ACT', doc_index: 1, page_no: 1 };
  return [{ step: EXTRA, next: GRID, ...spec, title: titleOf(spec.artefact, spec.doc_index, expected),
    hint: HINT[spec.artefact], row2: [] }];
}

export function LoadedPage(): JSX.Element {
  const params = useParams();
  const today = useToday();
  const data = today.data;
  if (data === undefined) return <DriverSkeleton />;
  const stop = data.plan?.stops.find((s) => s.stop_id === params['stopId']) ?? null;
  if (stop === null) return <Navigate to="/" replace />;
  return <Loading today={data} stop={stop} />;
}

/** «Немає документа» on the arrival's pre-step (§3.3 D-04) is a full answer already, so it hands the loading
 *  `state: { noDoc: true }` and the flow opens on «Чому немає документа?» instead of the camera — the Wave 2
 *  cross-page contract, and the tap that pre-step exists to save. */
const openedOnNoDoc = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && (state as { noDoc?: unknown }).noDoc === true;

function Loading({ today, stop }: { today: DriverToday; stop: PlannedStopView }): JSX.Element {
  const shots = loadingShots(stop);
  const flow = useFlow({ flow: 'loaded', steps: [...shots.map((s) => s.step), GRID, NO_DOC, EXTRA],
    stopId: stop.stop_id, label: DC.primary.loaded });
  const guard = useDriverGuard();
  const justUnlocked = useJustUnlocked();
  const once = useCommitOnce();
  // Read on the FIRST render only: `useFlow`'s mount effect replaces this entry's state with the flow's own. The
  // flag is CONSUMED as it fires — `flow.go` is a fresh function on every render, so an effect that depended on it
  // would push «Чому немає документа?» again on every one of them.
  const noDocOnOpen = useRef(openedOnNoDoc(useLocation().state));
  const { go } = flow;
  useEffect(() => {
    if (!noDocOnOpen.current) return;
    noDocOnOpen.current = false;
    go(NO_DOC);
  }, [go]);
  const expected = Math.max(stop.ttn_expected, 1);
  const drawn = drawnFor({ deviceId: DEVICE_ID, flow: 'loaded', stopPlanKey: stop.plan_key, expectedKm: null,
    retake: null });
  const next = stopAfter(today.plan?.stops ?? [], stop.stop_id);
  const canKm = today.truck?.has_can === true ? today.truck.can_km : null;

  const commit = (p: { pages: readonly CapturedPage[]; deferred: Deferred | null; noDoc: NoDocReason | null }): void => {
    once.run(() => {
      const wire = buildPages(flow.draft.key, [...p.pages]);
      const ttn = new Set(p.pages.filter(isTtn).map((x) => x.doc_index)).size;
      const record = buildRecord(
        { deviceId: DEVICE_ID, seq: flow.draft.seq, occurredAt: flow.draft.occurred_at,
          committedAt: server.clock.nowIso(), stopId: stop.stop_id, placeId: stop.place_id },
        'LOADED',
        { ttn_count: ttn, pages: wire.map((x) => x.key), no_doc_reason: p.noDoc, deferred: p.deferred },
      );
      flow.commit({ record, pages: wire, receipt: {
        title: loadedTitle(flow.draft.occurred_at,
          { ttn, pages: wire.length, deferred: p.deferred, noDoc: p.noDoc, canKm }),
        next: nextLine(next),
      } });
    });
  };

  if (flow.step === NO_DOC) {
    return (
      <NoDocumentPage
        artefact="TTN_FRONT"
        onCall={today.on_call}
        onBack={() => { flow.back(); }}
        onReason={(reason) => {
          // «ТТН ще друкують» is the one reason that commits nothing: the draft stays, and home shows it as
          // «ТТН ще друкують — сфотографуйте, щойно дадуть» until the paper is in his hand (Wave 2 preamble).
          if (reason === 'PRINTING') { flow.patch({ printing: true }); flow.leave(); return; }
          commit({ pages: [], deferred: null, noDoc: reason });
        }}
      />
    );
  }

  return (
    <CaptureSequence
      shots={[...shots, ...extraShot(flow.draft.data, flow.draft.pages, expected)]}
      step={flow.step}
      gridStep={GRID}
      pages={flow.draft.pages}
      add={ADD_CHIPS}
      engine={chooseEngine()}
      drawn={drawn}
      examplesSeen={today.first_time.examples_seen}
      deferred={null}
      busy={once.busy}
      justUnlocked={justUnlocked}
      guard={guard}
      onPage={(page, replaces) => {
        if (replaces === null) flow.addPage(page);
        else flow.replacePage(replaces, page);
        flow.patch({ retake: null, addKind: null });
      }}
      onGo={(step) => { flow.go(step); }}
      onBack={() => { flow.back(); }}
      onRetake={(at) => { flow.patch({ retake: at, addKind: null }); flow.go(EXTRA); }}
      onAdd={(kind) => { flow.patch({ addKind: kind, retake: null }); flow.go(EXTRA); }}
      onDone={() => { commit({ pages: flow.draft.pages, deferred: null, noDoc: null }); }}
      onRow2={(kind: Row2Kind) => {
        if (kind === 'NO_DOC') { flow.go(NO_DOC); return; }
        if (kind === 'NO_MORE_TTN' || kind === 'NO_TICKET') { flow.go(GRID); return; }
        if (kind === 'AT_PARKING') commit({ pages: flow.draft.pages, deferred: 'AT_PARKING', noDoc: null });
      }}
    />
  );
}
