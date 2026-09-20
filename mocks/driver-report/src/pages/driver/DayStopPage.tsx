// mocks/driver-report/src/pages/driver/DayStopPage.tsx
/**
 * One stop of «Мій день», as pictures (§3.3 D-15 «Stop detail») — what the office actually holds for this stop, in
 * the order he took it.
 *
 * TWO COLUMNS AND A STATE LINE UNDER EACH. The line is the furthest thing that has happened to that page — «В офісі
 * ✓ 08:42», «Прийнято диспетчером 10:09», «Оригінал прийнято в офісі 16:15» — and it is worded by `myDayView`, not
 * here (I-12, `MyPageView.state_line`), so the page and its state can never disagree about which of the three it is.
 *
 * THE FULL VIEW IS DARK. A photograph on a paper-white sheet reads as a document the app owns; on the near-black
 * surface of §6.2 it reads as a photograph, which is what it is. It is a dialog rather than a route because a pasted
 * link may not drop anyone into a lightbox (§2.2), and Back closes it.
 */
import { type JSX, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { X } from 'lucide-react';
import { useMyDay } from '../../api/hooks';
import { DriverSkeleton, LightPage } from '../../components/driver';
import { Artefact } from '../../components/artefacts';
import type { MyPageView } from '../../domain/dto';

const FALLBACK_TITLE = 'Зупинка';
const EMPTY = 'Фотографій цієї зупинки немає';
const CLOSE = 'Закрити';

/** A page as a thumbnail: a real frame when the phone took one, the drawn artefact otherwise (§6.11). */
function Thumb({ page }: { page: MyPageView }): JSX.Element {
  if (page.image !== null) return <img src={page.image} alt="" className="h-[9rem] w-full rounded-[10px] object-cover" />;
  return (
    <span className="flex h-[9rem] w-full items-center justify-center overflow-hidden rounded-[10px]"
      style={{ background: 'var(--bench)' }}>
      {page.drawn_variant === null ? null : <Artefact variant={page.drawn_variant} size="view" />}
    </span>
  );
}

export function DayStopPage(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const date = params.date ?? '';
  const stopId = params.stopId ?? '';
  const view = useMyDay(date).data;
  const [open, setOpen] = useState<MyPageView | null>(null);

  const pages = view === undefined ? [] : view.pages.filter((p) => p.stop_id === stopId);
  const title = view?.rows.find((r) => r.stop_id === stopId)?.title ?? FALLBACK_TITLE;

  if (open !== null) {
    return (
      <div data-surface="dark" className="flex min-h-dvh flex-col bg-cam-bg text-cam-ink">
        <div className="mx-auto flex w-full max-w-[35rem] items-center justify-between gap-2 px-gutter pt-3">
          <span className="tnum min-w-0 truncate text-[1rem] leading-[1.375rem]" style={{ color: 'var(--cam-text-2)' }}>
            {open.state_line}
          </span>
          <button type="button" aria-label={CLOSE} onClick={() => { setOpen(null); }}
            className="grid size-[3rem] shrink-0 place-items-center rounded-[10px]">
            <X aria-hidden="true" className="size-[1.5rem]" />
          </button>
        </div>
        <div className="relative flex-1 overflow-hidden">
          {open.image !== null
            ? <img src={open.image} alt="" className="absolute inset-0 size-full object-contain" />
            : open.drawn_variant === null ? null
              : <div className="absolute inset-0"><Artefact variant={open.drawn_variant} size="full" /></div>}
        </div>
      </div>
    );
  }

  return (
    <LightPage title={title} onBack={() => { navigate(`/day/${date}`); }}>
      {view === undefined ? <DriverSkeleton /> : pages.length === 0 ? (
        <p className="py-6 text-[1.125rem] leading-[1.625rem]" style={{ color: 'var(--text-2)' }}>{EMPTY}</p>
      ) : (
        <div className="grid w-full grid-cols-2 gap-3">
          {pages.map((page) => (
            <button key={page.key} type="button" onClick={() => { setOpen(page); }}
              className="card-ring flex w-full flex-col gap-2 p-2 text-left">
              <Thumb page={page} />
              <span className="tnum text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>
                {page.state_line}
              </span>
            </button>
          ))}
        </div>
      )}
    </LightPage>
  );
}
