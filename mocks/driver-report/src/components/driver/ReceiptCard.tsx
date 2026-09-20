// mocks/driver-report/src/components/driver/ReceiptCard.tsx
/** What the driver sees for fifteen seconds after a commit (§3.3 D-02): the title of what was recorded, the status
 *  line as it walks «Збережено в телефоні» → «В офісі ✓», the «Далі: …» line, and one outline «Скасувати» with a bar
 *  that depletes linearly over `UNDO_MS`.
 *
 *  Three things are load-bearing here.
 *
 *  1. The window is WALL CLOCK from `createdWall`, not a countdown started at mount. A card that re-mounts (a
 *     re-render, a route change back to home) must not hand the driver a fresh fifteen seconds over a record the
 *     office already has — so both the bar and the expiry are computed from `Date.now() - createdWall`.
 *  2. After «Скасувати» the line reads «Скасовано · Повернути» and the «Повернути» part is a BUTTON, not a word:
 *     undo has to be undoable in one touch or it is a trap. The split is by name so the copy stays one string in
 *     `DC.status.undone` (I-14) rather than two halves that can drift apart.
 *  3. At the end of the window the card COLLAPSES rather than vanishing: for 200 ms it is `aria-hidden` and inert —
 *     out of the accessibility tree, out of reach of a tap and out of reach of a test's `getByRole` — while its box
 *     shrinks. The record's state lives on in the TripRail row and «Мій день», so nothing is lost with it.
 *
 *  The `cl-stem` under the title is the one animated accent in the product (§6.8, D10): 2 px, 180 ms linear, drawn
 *  once when the record AND its photos are acknowledged. «Прийнято» is never blue. */
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { ReceiptState } from '../../app/outbox';
import { UNDO_MS } from '../../app/outbox';
import { DC } from '../../copy/driver';
import { STATUS_ICON, StatusLine } from './StatusLine';

const COLLAPSE_MS = 200;
/** The tail of `DC.status.undone` that becomes the button. */
const REDO = 'Повернути';

type Phase = 'open' | 'closing' | 'gone';

export function ReceiptCard({ title, status, next, createdWall, onUndo, onRedo, undone }: {
  title: string;
  status: ReceiptState;
  next: string | null;
  createdWall: number;
  onUndo(): void;
  onRedo(): void;
  undone: boolean;
}): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('open');
  const [shownFor, setShownFor] = useState(createdWall);
  const barRef = useRef<HTMLSpanElement>(null);

  // A NEW commit reuses this component instance: reset the window rather than inheriting the previous card's.
  if (shownFor !== createdWall) {
    setShownFor(createdWall);
    setPhase('open');
  }

  useEffect(() => {
    if (phase !== 'open') return undefined;
    const left = UNDO_MS - (Date.now() - createdWall);
    const id = setTimeout(() => { setPhase('closing'); }, left > 0 ? left : 0);
    return () => { clearTimeout(id); };
  }, [createdWall, phase]);

  useEffect(() => {
    if (phase !== 'closing') return undefined;
    const id = setTimeout(() => { setPhase('gone'); }, COLLAPSE_MS);
    return () => { clearTimeout(id); };
  }, [phase]);

  // The undo bar: one transition from wherever the window already stands to empty, so a late mount is honest about
  // how much time is actually left.
  useEffect(() => {
    const bar = barRef.current;
    if (bar === null) return;
    const left = UNDO_MS - (Date.now() - createdWall);
    if (left <= 0) return;
    bar.style.transition = 'none';
    bar.style.transform = `scaleX(${left / UNDO_MS})`;
    bar.style.transition = `transform ${left}ms linear`;
    bar.style.transform = 'scaleX(0)';
  }, [createdWall, undone]);

  if (phase === 'gone') return null;

  const cut = undone ? status.text.lastIndexOf(REDO) : -1;
  const head = cut === -1 ? status.text : status.text.slice(0, cut);
  const closing = phase === 'closing';

  return (
    <div
      {...(closing ? { 'aria-hidden': true, inert: true } : {})}
      className={`grid ${closing ? 'pointer-events-none opacity-0' : ''}`}
      style={{
        // `1fr` → `0fr` rather than a max-height: the card's real height at 130 % text is not a number this file can
        // know, and a max-height guess either clips the card or makes the collapse start late.
        gridTemplateRows: closing ? '0fr' : '1fr',
        transition: `grid-template-rows ${COLLAPSE_MS}ms cubic-bezier(.16,1,.3,1), opacity ${COLLAPSE_MS}ms linear`,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="card-ring flex items-start gap-3 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-[1.125rem] leading-[1.5rem] font-semibold">{title}</span>
            {status.acknowledged ? <span className="cl-stem block w-full" /> : null}
            <StatusLine
              live
              tone={status.tone}
              icon={STATUS_ICON[status.icon]}
              text={head}
              extra={
                cut === -1
                  ? status.photo_hold === null
                    ? undefined
                    : <span style={{ color: 'var(--hold)' }}>{` · ${status.photo_hold}`}</span>
                  : (
                    <button
                      type="button"
                      onClick={onRedo}
                      className="underline underline-offset-4"
                      style={{ color: 'var(--ink)' }}
                    >
                      {REDO}
                    </button>
                  )
              }
            />
            {next === null ? null : (
              <span className="text-[1rem] leading-[1.5rem]" style={{ color: 'var(--text-2)' }}>{next}</span>
            )}
          </div>
          {undone ? null : (
            <button
              type="button"
              onClick={onUndo}
              className="tap-ring relative flex min-h-tap shrink-0 flex-col items-center justify-center gap-[2px] overflow-hidden rounded-[12px] px-3"
            >
              <Undo2 aria-hidden="true" className="size-[1.25rem]" />
              <span className="text-[0.875rem] leading-[1rem] font-medium">{DC.undo}</span>
              <span
                ref={barRef}
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[2px] origin-left"
                style={{ background: 'var(--line-strong)' }}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
