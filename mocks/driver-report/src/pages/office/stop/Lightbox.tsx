// mocks/driver-report/src/pages/office/stop/Lightbox.tsx
/**
 * «Збільшити» (§4.2 C-04): the page at viewport height on a dark surface, Esc closes.
 *
 * DARK, LIKE EVERY OTHER SURFACE THAT EXISTS TO BE LOOKED AT. The camera, the photo review and the motion lock are
 * always dark whatever the theme (§0.1 «Theme»), for the same reason a lightbox is: white chrome around a white
 * sheet of paper hides the edges of the paper, and the edge is where «обрізано» lives. `data-surface="dark"` swaps
 * the `--cam-*` tokens in either theme rather than pretending the whole console went dark.
 *
 * ESC AND THE BACKDROP BOTH CLOSE IT, and the sheet itself does not: the operator enlarges a page to look at ONE
 * corner of it, and a click that lands on the paper while they are deciding must not throw the paper away.
 *
 * It is not a radix Dialog. A Dialog moves focus into itself and traps it, and this thing has nothing inside worth
 * focusing except «Закрити» — the value is the picture. `role="dialog"` + `aria-modal` says what it is; the keydown
 * listener is on `window` so Esc works before anything has been focused at all.
 */
import { useEffect, type JSX } from 'react';
import { X } from 'lucide-react';
import { Artefact } from '../../../components/artefacts';
import type { PageView } from '../../../domain/dto';

export function Lightbox({ page, onClose }: { page: PageView; onClose(): void }): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-surface="dark"
      role="dialog"
      aria-modal="true"
      aria-label={page.caption}
      className="fixed inset-0 z-50 flex h-dvh flex-col gap-[12px] bg-cam-bg p-[16px] text-cam-ink"
      onClick={onClose}
    >
      <header className="flex shrink-0 items-start justify-between gap-[16px]">
        <div className="min-w-0">
          <p className="text-[14px] leading-[1.35] font-semibold">{page.caption}</p>
          <p className="text-[13px] leading-[1.4] text-cam-text-2">{page.provenance}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-[36px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] border border-cam-text-2 px-[12px] text-[14px] leading-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-cam-accent"
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
          Закрити
        </button>
      </header>
      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {page.drawn_variant === null
          ? <p className="text-[14px] leading-[1.45] text-cam-text-2">{page.caption}</p>
          : <Artefact variant={page.drawn_variant} size="full" />}
      </div>
    </div>
  );
}
