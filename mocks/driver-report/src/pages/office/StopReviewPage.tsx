// mocks/driver-report/src/pages/office/StopReviewPage.tsx
/**
 * «Перевірити зупинку» — the paper-mirror (§4.2 C-04, §8.3 C-04, beat 5).
 *
 * CONFIRM INSTEAD OF RE-TYPING. That sentence is the whole screen and every decision below is downstream of it: the
 * printed side of a ТТН arrives as OCR suggestions the operator accepts in one click, the handwritten side is typed
 * — four digits, beside the photograph it is written on — and nothing else on this page is an input at all. The
 * measured failure it answers is an operator with a stack of paper and a form, keying eight fields per document
 * that a photograph already carries (02 UC-O04).
 *
 * FIELDS LEFT, PHOTOS RIGHT, THE SAME ORDER. The two columns are one instrument, not two panes [R01 §14.10]. Below
 * 900 px they stack, fields first, and every field grows a «Показати на фото» link — because a stacked layout has
 * broken the adjacency the design rests on and the link is the cheapest way to hand it back. The photo column shows
 * EVERY page of the stop while the fields column shows ONE ТТН, which is deliberate: a retake request is about a
 * photograph, and the operator asking for one has usually just noticed it while reading a different document.
 *
 * THE FOUR WRITES ARE ONE OPERATION. `reviewStop` takes an `action`, so «Прийняти друковані», a typed time, «На
 * звороті не заповнено» and «Прийняти зупинку» are one audit line each, one version each, one highlight each — and
 * the refusals are the operation's own closed set, rendered through `SAYS_STOP_REVIEW` under whichever control
 * asked for them. `VALUE_INVALID` is the exception that proves the rule: it is a refusal ABOUT A FIELD, so it goes
 * to that field's own `error` slot rather than under the panel, where it would be a sentence about nothing.
 *
 * A REFUSAL IS BRANCHED ON `code` AND NOTHING ELSE (HARD RULE 5). `codeOf` reads it from either side of the seam and
 * answers `undefined` for a transport failure, which is why every branch here has a sentence for that case too.
 *
 * WHAT THIS PAGE DOES NOT DECIDE. Whether a mark is late, whether the wait counts as простій, whether a day is
 * still open — all three are `src/domain`'s, and arrive already worded (`docs[].derived`, `day_status`). A page that
 * re-derived one of them would be a second copy of a rule nobody would remember to change twice.
 */
import { useEffect, useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { CheckCheck, ClipboardCheck, Clock } from 'lucide-react';
import { Segmented } from '@agency/kit/segmented';
import { codeOf } from '../../api/contract';
import { useReviewStop, useStopReview } from '../../api/hooks';
import { SAYS_STOP_REVIEW } from '../../api/says';
import { fmtTime } from '../../app/format';
import { EmptyPanel, PageHead, Panel, SkeletonRows, StatusPill, useConsoleMode } from '../../components/office';
import type { PageView, RequestView, ReviewStopIn } from '../../domain/dto';
import type { TtnField } from '../../domain/types';
import { FieldsColumn } from './stop/FieldsColumn';
import { Lightbox } from './stop/Lightbox';
import { PhotoColumn } from './stop/PhotoColumn';
import type { ZoomCell } from './stop/ZoomInset';

/** A transport failure declares no code, so every refusal branch needs a sentence for «no code at all» too. */
const NO_CODE = 'Не вдалося зберегти — спробуйте ще раз.';
const NOT_READ = 'Не вдалося прочитати зупинку — спробуйте ще раз.';
const CONSEQUENCE = 'Після прийняття водій побачить «Прийнято диспетчером» на цій зупинці.';
const DAY_LOCKED = 'День підтверджено — щоб змінити, його треба відкрити для виправлення.';

/** Which cell of the reverse's operations table a handwritten field is copied out of (§6.11 `TtnBack`). */
const ZOOM_OF: Partial<Record<TtnField, ZoomCell>> = {
  arrival: 'arrival',
  drop_arrival: 'arrival',
  departure: 'departure',
  drop_departure: 'departure',
  gross: 'gross',
};

/** Where in an operator's head a refusal belongs: under the button that asked, or on the field that was wrong. */
type Where = 'printed' | 'reverse' | 'stop';

export function StopReviewPage(): JSX.Element {
  const { stopId = '' } = useParams();
  const mode = useConsoleMode();
  const q = useStopReview(stopId);
  const review = useReviewStop(stopId);

  const [docId, setDocId] = useState<string | null>(null);
  const [zoomField, setZoomField] = useState<TtnField | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<PageView | null>(null);
  const [sent, setSent] = useState<Record<string, RequestView>>({});
  const [refusal, setRefusal] = useState<{ where: Where; text: string } | null>(null);
  const [timeError, setTimeError] = useState<{ field: TtnField; text: string } | null>(null);

  const view = q.data ?? null;
  const doc = view === null ? null : view.docs.find((d) => d.id === docId) ?? view.docs[0] ?? null;
  const locked = view?.day_status === 'CONFIRMED';
  const accepted = view?.status === 'ACCEPTED';

  /** One write, one refusal slot. `field` is set only for a time, which is the one refusal about a VALUE. */
  const send = (body: ReviewStopIn, where: Where, field: TtnField | null): void => {
    setRefusal(null);
    setTimeError(null);
    review.mutate(body, {
      onError: (err) => {
        const code = codeOf('reviewStop', err);
        const text = code === undefined ? NO_CODE : SAYS_STOP_REVIEW[code];
        if (code === 'VALUE_INVALID' && field !== null) setTimeError({ field, text });
        else setRefusal({ where, text });
      },
    });
  };

  const acceptPrinted = (): void => {
    if (doc === null || locked) return;
    send({ action: 'ACCEPT_PRINTED', doc_index: doc.doc_index }, 'printed', null);
  };

  // The panel's «Enter» hint, kept honest: the key accepts the printed side whenever the operator is not inside a
  // control of their own. `TimeInput` commits on the same key, so an input under the cursor must win — which the
  // activeElement test is, and which is also why nothing here calls preventDefault.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el !== null && el.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"]') !== null) return;
      acceptPrinted();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (q.isPending) {
    return (
      <main className="mx-auto w-full max-w-[1400px] p-[24px]" aria-busy="true">
        <PageHead title="Перевірити зупинку" back={{ label: 'Перевірка', to: '/inbox/review' }} />
        <Panel><SkeletonRows rows={6} /></Panel>
      </main>
    );
  }

  if (view === null) {
    const code = q.error === null ? undefined : codeOf('getStopReview', q.error);
    return (
      <main className="mx-auto w-full max-w-[1400px] p-[24px]">
        <PageHead title="Перевірити зупинку" back={{ label: 'Перевірка', to: '/inbox/review' }} />
        <Panel>
          <p className="px-[20px] py-[32px] text-center text-[15px] leading-[1.45] text-ink">
            {code === undefined ? NOT_READ : SAYS_STOP_REVIEW[code]}
          </p>
        </Panel>
      </main>
    );
  }

  const town = view.stop.title.split(' · ')[0] ?? '';
  const index = doc?.doc_index ?? 0;
  /** The page a handwritten field is read off: the reverse of this ТТН, or its signed sheet at an unloading. */
  const backPage = view.pages.find((p) => p.doc_index === index && p.received
    && (p.artefact === 'TTN_BACK' || p.artefact === 'TTN_SIGNED')) ?? null;
  // The inset's geometry is the REVERSE's operations table and nothing else, so an unloading's signed sheet scrolls
  // into view but is never cropped: a crop at coordinates the drawing does not have would outline empty paper.
  const zoomVariant = backPage !== null && backPage.artefact === 'TTN_BACK' ? backPage.drawn_variant : null;
  const frontPage = view.pages.find((p) => p.doc_index === index && p.received
    && p.artefact === 'TTN_FRONT') ?? null;
  const isReverse = (field: TtnField): boolean => doc !== null && doc.reverse.some((f) => f.field === field);
  const stacked = mode === 'rail' || mode === 'mobile';
  const columns = mode === 'wide' ? '520px minmax(0, 1fr)' : 'minmax(0, 46fr) minmax(0, 54fr)';

  return (
    <main className="mx-auto w-full max-w-[1400px] p-[24px]">
      <PageHead
        back={{ label: 'Перевірка', to: '/inbox/review' }}
        title={view.stop.title}
        description={view.stop.line}
        actions={accepted
          ? <StatusPill tone="plain" icon={CheckCheck} word="прийнято" />
          : <StatusPill tone="hold" icon={Clock} word="на перевірці" />}
      />

      {doc === null ? null : (
        <div className="mb-[16px] flex flex-col gap-[6px]">
          <Segmented
            label="Яка ТТН"
            fit="content"
            className="w-auto"
            options={view.docs.map((d) => ({ value: d.id, label: d.switch_label }))}
            value={doc.id}
            onChange={(id) => {
              setDocId(id);
              setZoomField(null);
            }}
          />
          <p className="text-[13px] leading-[1.4] text-text-2">{doc.match_line}</p>
        </div>
      )}

      <div
        className={stacked ? 'flex flex-col gap-[20px]' : 'grid gap-[20px]'}
        style={stacked ? undefined : { gridTemplateColumns: columns }}
      >
        {doc === null ? (
          // A read that SUCCEEDED and carries no ТТН is not a failed read, and must not borrow a refusal's
          // sentence: there is nothing printed to confirm, and the photos and «Прийняти зупинку» still do their job.
          <Panel>
            <EmptyPanel
              title="На цій зупинці немає ТТН"
              hint="Підтверджувати друковані поля нічого — залишаються фото й «Прийняти зупинку»."
            />
          </Panel>
        ) : (
          <FieldsColumn
            doc={doc}
            locked={locked}
            stacked={stacked}
            zoom={zoomField === null ? null : ZOOM_OF[zoomField] ?? null}
            backVariant={zoomVariant}
            timeError={timeError}
            printedRefusal={refusal !== null && refusal.where === 'printed' ? refusal.text : null}
            reverseRefusal={refusal !== null && refusal.where === 'reverse' ? refusal.text : null}
            onAcceptPrinted={acceptPrinted}
            onSetField={(field, value) => send({ action: 'SET_FIELD', doc_index: index, field, value }, 'reverse', field)}
            onBlankReverse={() => send({ action: 'MARK_BLANK_REVERSE', doc_index: index }, 'reverse', null)}
            onFocusField={(field) => {
              setZoomField(field);
              setScrollTo(backPage?.key ?? null);
            }}
            onShowPhoto={(field) => setScrollTo((isReverse(field) ? backPage?.key : frontPage?.key) ?? null)}
          />
        )}

        <PhotoColumn
          pages={view.pages}
          context={town}
          sent={sent}
          scrollTo={scrollTo}
          onSent={(key, request) => setSent((prev) => ({ ...prev, [key]: request }))}
          onEnlarge={setLightbox}
        />
      </div>

      <footer className="card-ring sticky bottom-0 mt-[20px] flex flex-wrap items-center justify-between gap-[12px] p-[16px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <p className="text-[13px] leading-[1.45] text-text-2">{locked ? DAY_LOCKED : CONSEQUENCE}</p>
          {refusal !== null && refusal.where === 'stop'
            ? <p className="text-[13px] leading-[1.45] text-reject">{refusal.text}</p>
            : null}
        </div>
        {accepted && view.accepted !== null ? (
          <p className="text-[14px] leading-[1.35] font-medium text-ink">
            {`Зупинку прийняла ${view.accepted.by} ${fmtTime(view.accepted.at)}`}
          </p>
        ) : (
          <button
            type="button"
            disabled={locked || review.isPending}
            onClick={() => send({ action: 'ACCEPT_STOP' }, 'stop', null)}
            className="inline-flex h-[40px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] bg-accent-ink px-[18px] text-[14px] leading-none font-medium whitespace-nowrap text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50"
          >
            <ClipboardCheck size={16} strokeWidth={2} aria-hidden="true" />
            Прийняти зупинку
          </button>
        )}
      </footer>

      {lightbox === null ? null : <Lightbox page={lightbox} onClose={() => setLightbox(null)} />}
    </main>
  );
}
