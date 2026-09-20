// mocks/driver-report/src/pages/office/stop/PhotoColumn.tsx
/**
 * The right half of the paper-mirror (§4.2 C-04): one Panel per page, in the same order as the fields beside them,
 * each carrying what the page IS, where it came from, and the two things the operator can do about it.
 *
 * SAME ORDER IS THE WHOLE DESIGN. The operator is copying a handwritten time off a photograph into a field; the
 * moment the eye has to search for which photograph, the copying stops being «confirm» and becomes «remember»
 * [R01 §14.10]. So this column renders `view.pages` untouched — the order the server put them in — and never sorts
 * or groups them by ТТН, even though the fields column shows one ТТН at a time.
 *
 * PROVENANCE IS RENDERED, NOT RE-WORDED. «знято в застосунку 08:39 · 0,7 МБ» · «на стоянці 09:02» · «після виїзду
 * 15:16» · «з галереї, файл від 12.09» are four different answers to «can I trust this photo», and which one a page
 * gets is a rule of `src/domain/views/office.ts`. A page that paraphrased it would be a second copy of that rule.
 *
 * A PAGE THAT HAS NOT ARRIVED IS A SLOT, NOT AN ABSENCE. The completion record names its pages before the phone has
 * passed them on, so the office can see that four pages are coming and only three are here — «Фото ще в телефоні —
 * з'явиться, щойно телефон передасть», in hold, with no actions on it: there is nothing to ask about a photograph
 * nobody has seen, and «Попросити перезняти» on one would send the driver back for a photo he already took.
 *
 * «БУЛО» / «СТАЛО», BOTH KEPT. A retaken page does not replace its predecessor: it is rendered beside it inside the
 * predecessor's Panel, and its own Panel is suppressed (`supersedes !== null`), so the pair reads as one page with
 * two versions rather than as two pages — and the original stays on screen, which is the same reason a correction
 * keeps the struck value (ст.9 ч.7).
 */
import { useEffect, useRef, type JSX } from 'react';
import { RefreshCcw, Smartphone, ZoomIn } from 'lucide-react';
import { Panel } from '../../../components/office';
import { RequestPopover, RequestTrack } from '../../../components/office/review';
import { Artefact } from '../../../components/artefacts';
import type { PageView, RequestView } from '../../../domain/dto';

const ACTION = 'inline-flex h-[32px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] px-[12px] '
  + 'text-[13px] leading-none font-medium whitespace-nowrap transition-colors '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';
const OUTLINE = `${ACTION} border border-line-strong bg-label text-ink hover:bg-bench`;
const GHOST = `${ACTION} text-text-2 hover:bg-bench hover:text-ink`;

/** The paper itself: a drawn artefact, an uploaded image, or the dashed slot of a page still in the phone. */
function Paper({ page }: { page: PageView }): JSX.Element {
  if (!page.received) {
    return (
      <div className="empty-slot flex flex-col items-center justify-center gap-[8px] px-[20px] py-[32px] text-center">
        <Smartphone size={20} strokeWidth={2} aria-hidden="true" className="text-hold" />
        <p className="max-w-[40ch] text-[13px] leading-[1.5] text-hold">
          {"Фото ще в телефоні — з'явиться, щойно телефон передасть"}
        </p>
      </div>
    );
  }
  if (page.image !== null) {
    return <img src={page.image} alt={page.caption} className="block h-full max-h-[420px] w-auto max-w-full" />;
  }
  if (page.drawn_variant !== null) {
    return (
      <div className="flex h-[420px] items-center justify-center">
        <Artefact variant={page.drawn_variant} size="view" />
      </div>
    );
  }
  return <p className="px-[20px] py-[32px] text-center text-[13px] leading-[1.4] text-text-2">—</p>;
}

export function PhotoColumn({ pages, context, sent, scrollTo, onSent, onEnlarge }: {
  pages: PageView[];
  /** The stop's place. C-06's target line is `<caption> · <context> · <provenance>`, so it is built per page here. */
  context: string;
  /** Requests created in this session, by page key: the track appears before the refetch answers. */
  sent: Record<string, RequestView>;
  /** The page key the fields column asked to be brought into view (a focused time input, «Показати на фото»). */
  scrollTo: string | null;
  onSent(pageKey: string, request: RequestView): void;
  onEnlarge(page: PageView): void;
}): JSX.Element {
  const slots = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (scrollTo === null) return;
    const el = slots.current[scrollTo];
    // jsdom implements no scrolling at all; the guard is what keeps a focus from throwing under the page tests.
    if (el !== null && el !== undefined && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
  }, [scrollTo]);

  return (
    <div className="flex flex-col gap-[16px]">
      {pages.filter((p) => p.supersedes === null).map((page) => {
        const replacement = page.superseded_by === null
          ? null
          : pages.find((x) => x.key === page.superseded_by) ?? null;
        const request = page.request ?? sent[page.key] ?? null;
        return (
          <div
            key={page.key}
            data-page={page.key}
            ref={(el) => {
              slots.current[page.key] = el;
            }}
          >
            <Panel>
              <div className="flex flex-col gap-[12px] p-[16px]">
                {replacement === null ? <Paper page={page} /> : (
                  <div className="grid grid-cols-2 gap-[12px]">
                    <figure className="flex flex-col gap-[6px]">
                      <figcaption className="text-[12px] leading-[1.3] font-medium text-text-2">Було</figcaption>
                      <Paper page={page} />
                    </figure>
                    <figure className="flex flex-col gap-[6px]">
                      <figcaption className="text-[12px] leading-[1.3] font-medium text-ink">Стало</figcaption>
                      <Paper page={replacement} />
                    </figure>
                  </div>
                )}

                <div className="flex flex-col gap-[2px]">
                  <p className="text-[14px] leading-[1.35] font-semibold text-ink">{page.caption}</p>
                  <p className="text-[13px] leading-[1.4] text-text-2">
                    {replacement === null ? page.provenance : `${page.provenance} → ${replacement.provenance}`}
                  </p>
                </div>

                {request === null ? null : <RequestTrack request={request} />}

                {page.received ? (
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <RequestPopover
                      page={page}
                      // §4.2 C-06's target line is «… · Вільнянськ · знято 08:39» — the town and WHEN it was taken.
                      // The megabytes belong under the photo, where they say whether it uploaded, not in a request.
                      context={`${context} · ${page.provenance.split(' · ')[0] ?? page.provenance}`}
                      onSent={(r) => onSent(page.key, r)}
                    >
                      <button type="button" className={OUTLINE}>
                        <RefreshCcw size={14} strokeWidth={2} aria-hidden="true" />
                        Попросити перезняти
                      </button>
                    </RequestPopover>
                    <button type="button" className={GHOST} onClick={() => onEnlarge(replacement ?? page)}>
                      <ZoomIn size={14} strokeWidth={2} aria-hidden="true" />
                      Збільшити
                    </button>
                  </div>
                ) : null}
              </div>
            </Panel>
          </div>
        );
      })}
    </div>
  );
}
