// mocks/driver-report/src/components/driver/capture/ReviewSingle.tsx
/**
 * «Це те, що треба?» — one page, shown back before it is committed (§3.3 D-06).
 *
 * Dark in both themes, like the camera it came from: the photo is the subject, and a paper-white page around a
 * photograph is a second light source in the cab (D15).
 *
 * The LOW branch is the screen's whole reason to exist. A page the app cannot read is not refused — nothing on the
 * driver route is (§8.6 #11) — so the two buttons SWAP: «Перезняти» takes the accent and «Залишити так» stays as a
 * quiet way through, which commits the page with `IMAGE_QUALITY_LOW` for the office. The accent is what the driver
 * reads instead of the sentence, so it must point at the better outcome without forbidding the other.
 *
 * `PageThumb` and `captionOf` live here rather than in a file of their own because the grid shows the same page in
 * the same way: one definition, imported by its sibling, so a drawn page and a real frame cannot be drawn one way
 * here and another way there.
 */
import type { JSX, ReactNode } from 'react';
import { Check, RefreshCcw } from 'lucide-react';
import { fmtBytes, fmtTime } from '../../../app/format';
import type { CapturedPage } from '../../../app/records';
import type { ArtefactKind } from '../../../domain/types';
import { Artefact, SeatBackdrop } from '../../artefacts';
import { ActionBar } from '../ActionBar';
import { PrimaryAction } from '../PrimaryAction';
import { QuietButton } from '../QuietButton';

const LOW = 'Нечітко видно';

/** One photographed page as a picture: a drawn artefact on its seat, or the real frame. Absolutely placed, because
 *  the artefacts are SVGs sized `h-full` and need a box with a definite height. */
export function PageThumb({ page, fit = 'view' }: { page: CapturedPage; fit?: 'view' | 'full' }): JSX.Element {
  if (page.image !== null) {
    return <img src={page.image} alt="" className="absolute inset-0 size-full object-contain" />;
  }
  return (
    <div className="absolute inset-0">
      <SeatBackdrop>
        {page.drawn === null
          ? <span />
          : <Artefact variant={page.drawn.variant} value={page.drawn.value} size={fit} />}
      </SeatBackdrop>
    </div>
  );
}

const SIDE: Partial<Record<ArtefactKind, string>> = { TTN_FRONT: 'лицьовий', TTN_BACK: 'зворотний' };
const NAMED: Partial<Record<ArtefactKind, string>> = {
  TTN_SIGNED: 'ТТН з підписом', RECEIPT: 'Чек', CLUSTER: 'Щиток', WEIGH_TICKET: 'Талон з ваг', ACT: 'Акт',
};

/** «ТТН 1 з 2 · лицьовий» — built from the page's own `doc_index`, never from where it sits in the list, so a page
 *  retaken out of order keeps its name. `total` is how many ТТН the set holds. */
export function captionOf(page: CapturedPage, pages: CapturedPage[]): string {
  const named = NAMED[page.artefact];
  if (named !== undefined) return named;
  const total = pages
    .filter((p) => SIDE[p.artefact] !== undefined)
    .reduce((most, p) => (p.doc_index > most ? p.doc_index : most), 1);
  return `ТТН ${page.doc_index} з ${total} · ${SIDE[page.artefact] ?? ''}`;
}

/** «знято 08:57 · 0,3 МБ» — when it was taken and what it weighs, in the driver's own units (§3.3 D-06). */
export const provenanceOf = (page: CapturedPage): string => `знято ${fmtTime(page.captured_at)} · ${fmtBytes(page.bytes)}`;

export function ReviewSingle({ page, title, onOk, onRetake, onKeep, decoded }: {
  page: CapturedPage;
  title?: string;
  onOk(): void;
  onRetake(): void;
  /** Present only where a low page may be kept as it is: «Залишити так» (§3.3 D-06). */
  onKeep?(): void;
  /** The refuel's decoded card — «ОККО · 21.09 08:57 · 22 800,00 грн …» with «імітація» (§3.3 D-10, D9). */
  decoded?: ReactNode;
}): JSX.Element {
  const low = page.quality === 'LOW';
  return (
    <div data-surface="dark" className="flex min-h-dvh flex-col bg-cam-bg text-cam-ink">
      {title === undefined ? null : (
        <p className="mx-auto w-full max-w-[35rem] px-gutter pt-3 text-[1.125rem] leading-[1.5rem] font-semibold">
          {title}
        </p>
      )}
      <div className="relative mt-2 min-h-[16rem] flex-1 overflow-hidden">
        <PageThumb page={page} />
        {low ? (
          <p
            className="absolute inset-x-0 top-0 px-gutter py-3 text-center text-[1.125rem] leading-[1.5rem] font-semibold"
            style={{ background: 'var(--cam-hold-bg)', color: 'var(--cam-hold)' }}
          >
            {LOW}
          </p>
        ) : null}
      </div>
      <div className="mx-auto flex w-full max-w-[35rem] flex-col gap-2 px-gutter pt-2">
        <p className="text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--cam-text-2)' }}>
          {provenanceOf(page)}
        </p>
        {decoded}
      </div>
      <ActionBar dark>
        {low ? (
          <>
            <PrimaryAction icon={RefreshCcw} verb="Перезняти" dark onPress={onRetake} />
            {onKeep === undefined ? null : <QuietButton dark label="Залишити так" onPress={onKeep} />}
          </>
        ) : (
          <>
            <PrimaryAction icon={Check} verb="Добре" dark onPress={onOk} />
            <QuietButton dark icon={RefreshCcw} label="Перезняти" onPress={onRetake} />
          </>
        )}
      </ActionBar>
    </div>
  );
}
