// mocks/driver-report/src/pages/driver/flows/CaptureSequence.tsx
/**
 * The shooting half of a document flow (§3.3 D-06, D-07, D-08): N drawn pages in the order the plan names them, then
 * the grid that shows them all back.
 *
 * ONE COMPONENT FOR THREE FLOWS, because the difference between them is DATA. A loading shoots four ТТН pages and
 * ends in the grid; an unloading shoots one signed copy and ends in a single review; a deferred capture shoots the
 * signed copy and then the dash. Each of those is a list of `Shot`s whose `next` names the step after it, so the
 * sequence is declared by the page and walked here — and no page repeats the eighty lines that put a `CapturedPage`
 * together, stamp its deferral on it and decide which drawn artefact the viewfinder shows.
 *
 * NOTHING IS KEPT HERE. The pages taken so far live in the flow's draft, the step in history state; this component
 * holds no state of its own except which «Ось так» cards this phone has already read, which is a per-viewer
 * convenience in `localStorage` beside the server's own `first_time` flags (I-10 `examplesKey`). That is what lets a
 * step be re-entered — by Back, by a retake from the grid, by a rebuilt phone — with its answers intact.
 *
 * WHICH DRAWN PAGE A SHOT SHOWS is matched on the artefact and its numbering, never on position: `drawnFor` returns
 * the scripted pages of the whole record, and a retake of page 2 must redraw page 2 rather than whatever sits second
 * in a one-shot list.
 */
import { type JSX, useState } from 'react';
import { CameraScreen, ExampleCard, ReviewGrid, type AddKind, type DrawnSpec, type Row2Kind }
  from '../../../components/driver/capture';
import { DEVICE_ID, examplesKey } from '../../../app/device';
import type { CapturedPage } from '../../../app/records';
import type { ArtefactKind, Deferred } from '../../../domain/types';

/** One photograph a flow asks for: what it is, what the driver is told, and where the flow goes once it is taken. */
export type Shot = {
  step: string;
  /** The step after this one — the next shot, the review, the grid, the dash question. */
  next: string;
  artefact: ArtefactKind;
  title: string;
  hint: string;
  doc_index: number;
  page_no: number;
  row2: readonly Row2Kind[];
  /** The FlowHeader count, when this shot is part of the flow's own step rail (§3.3 D-07 «2 з 5»). */
  count?: { index: number; total: number };
  /** The position in the draft's pages this shot replaces: a «Перезняти» from the grid. */
  replaces?: number;
};

type Guard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void;

/** What the driver is told to put in the frame, by artefact (§3.3 D-06, D-07, D-08, D-10). One table, because the
 *  same sentence has to appear over the camera and on the «Ось так» card that precedes it. */
export const HINT: Record<ArtefactKind, string> = {
  TTN_FRONT: 'ТТН на сидіння, весь аркуш у рамці',
  TTN_BACK: 'ТТН на сидіння, весь аркуш у рамці',
  TTN_SIGNED: 'Примірник 3 — той, що повертається в КТЛ',
  CLUSTER: 'Щиток цілком — цифри і паливо',
  RECEIPT: 'Чек цілком у рамці',
  WEIGH_TICKET: 'Весь талон у рамці',
  ACT: 'Весь аркуш у рамці',
};

/** «ТТН 1 з 2 — лицьовий бік» · «ТТН 1 з 2 — зворотний бік, з часом і підписом» (§3.3 D-07). Only the reverse of the FIRST
 *  ТТН names what must be visible on it: that page is where the arrival time and the signature go. */
export function ttnTitle(artefact: 'TTN_FRONT' | 'TTN_BACK', doc: number, total: number): string {
  const head = `ТТН ${String(doc)} з ${String(total)} — `;
  if (artefact === 'TTN_FRONT') return `${head}лицьовий бік`;
  return `${head}зворотний бік${doc === 1 ? ', з часом і підписом' : ''}`;
}

/** The «Ось так» cards this phone has already read. A blocked or private store reads as none, which shows the card
 *  again — the harmless direction (I-10). */
function storedExamples(): ArtefactKind[] {
  try {
    const raw = window.localStorage.getItem(examplesKey(DEVICE_ID));
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? list.filter((k): k is ArtefactKind => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function rememberExample(kind: ArtefactKind): ArtefactKind[] {
  const next = [...new Set([...storedExamples(), kind])];
  try {
    window.localStorage.setItem(examplesKey(DEVICE_ID), JSON.stringify(next));
  } catch {
    /* a phone with no store still gets through the flow; it simply meets the card again */
  }
  return next;
}

/** The thumbnail beside the shutter: the last page taken, drawn or real (§3.3 D-06). */
const thumbOf = (pages: readonly CapturedPage[]): string | null => {
  const last = pages.at(-1);
  if (last === undefined) return null;
  return last.image ?? last.drawn?.variant ?? null;
};

export function CaptureSequence({ shots, step, gridStep, pages, add = [], engine, drawn, examplesSeen, deferred,
  busy = false, justUnlocked, guard, onPage, onGo, onRow2, onBack, onDone, onRetake, onAdd }: {
  shots: readonly Shot[];
  step: string;
  /** The step at which the whole set is shown back; absent in a flow that reviews one page instead (§3.3 D-08). */
  gridStep?: string;
  pages: readonly CapturedPage[];
  add?: readonly AddKind[];
  engine: 'DRAWN' | 'INPAGE';
  drawn: readonly DrawnSpec[];
  /** The artefact kinds this driver has been shown already (`today.first_time.examples_seen`). */
  examplesSeen: readonly ArtefactKind[];
  /** Stamped on every page a put-off capture takes, so the office knows when it was really photographed. */
  deferred: Deferred | null;
  /** The flow's `useCommitOnce().busy`: the grid's primary says «Записую…» while the commit runs (EC-137). */
  busy?: boolean;
  justUnlocked: boolean;
  guard: Guard;
  onPage(page: CapturedPage, replaces: number | null): void;
  onGo(step: string): void;
  onRow2(kind: Row2Kind, shot: Shot): void;
  onBack(): void;
  onDone(): void;
  onRetake(index: number): void;
  onAdd(kind: AddKind): void;
}): JSX.Element | null {
  const [seen, setSeen] = useState<ArtefactKind[]>(storedExamples);
  const shot = shots.find((s) => s.step === step) ?? null;
  // The count beside the shutter is the SET'S PAGES (§3.3 D-06: «1 з 4»), not the flow's steps (§3.3 D-07: «2 з 5»),
  // so a shot that REPLACES a page — a «Перезняти» from the grid — does not add one to the total.
  const planned = shots.filter((s) => s.replaces === undefined).length;

  if (shot !== null) {
    const spec = drawn.find((d) => d.artefact === shot.artefact && d.doc_index === shot.doc_index
      && d.page_no === shot.page_no) ?? null;
    const showExample = !seen.includes(shot.artefact) && !examplesSeen.includes(shot.artefact);
    return (
      <>
        <CameraScreen
          title={shot.title}
          hint={shot.hint}
          artefact={shot.artefact}
          counter={shot.count}
          taken={{ index: pages.length - 1, total: Math.max(planned, pages.length) }}
          row2={[...shot.row2]}
          engine={engine}
          drawn={spec}
          lastThumb={thumbOf(pages)}
          banner={justUnlocked ? <ResumeBanner title={shot.title} /> : undefined}
          onBack={onBack}
          onShot={guard((page: CapturedPage) => {
            onPage({ ...page, artefact: shot.artefact, doc_index: shot.doc_index, page_no: shot.page_no, deferred },
              shot.replaces ?? null);
            onGo(shot.next);
          })}
          onRow2={guard((kind: Row2Kind) => { onRow2(kind, shot); })}
        />
        {showExample ? (
          <ExampleCard artefact={shot.artefact} hint={shot.hint}
            onOk={() => { setSeen(rememberExample(shot.artefact)); }} />
        ) : null}
      </>
    );
  }

  if (gridStep !== undefined && step === gridStep) {
    return (
      <ReviewGrid pages={[...pages]} add={[...add]} busy={busy} onOk={guard(onDone)} onRetake={guard(onRetake)}
        onAdd={guard(onAdd)} />
    );
  }
  return null;
}

/** «Продовжимо: ТТН 2 з 2 — зворотний бік» — the five seconds after the motion lock lets go (§3.3 D-19). */
function ResumeBanner({ title }: { title: string }): JSX.Element {
  return (
    <p className="rounded-[10px] px-3 py-2 text-[1rem] leading-[1.375rem] font-medium"
      style={{ background: 'var(--cam-hold-bg)', color: 'var(--cam-hold)' }}>
      Продовжимо: {title}
    </p>
  );
}
