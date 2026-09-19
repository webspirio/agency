// mocks/driver-report/src/components/driver/capture/ReviewGrid.tsx
/**
 * «Перевірте: 4 сторінки» — the whole set before it is committed (§3.3 D-06).
 *
 * Two columns, and under each tile its own «Перезняти», because the alternative — select a tile, then act — is two
 * taps and a mode. The count in the title is DECLINED («4 сторінки», «1 сторінка», «5 сторінок»): a driver reads a
 * sentence, and «4 сторінка» is the sound of software.
 *
 * The duplicate chip is the one thing here the driver could not see for himself: two shots of the same page look
 * identical in a 2 cm tile, and the office would get one ТТН twice and one not at all (EC-137). It is a HINT in
 * ochre, never a refusal — «Добре, все видно» stays live under it (§8.6 #11).
 */
import type { JSX } from 'react';
import { Check, FileText, Files, RefreshCcw, Scale, Weight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { looksDuplicate } from '../../../app/capture/similarity';
import { pluralN } from '../../../app/format';
import type { CapturedPage } from '../../../app/records';
import { DC } from '../../../copy/driver';
import { ActionBar } from '../ActionBar';
import { PrimaryAction } from '../PrimaryAction';
import { QuietButton } from '../QuietButton';
import { captionOf, PageThumb } from './ReviewSingle';

export type AddKind = 'MORE_TTN' | 'PAGE' | 'TICKET' | 'ACT';

const ADD: Record<AddKind, { word: string; icon: LucideIcon }> = {
  MORE_TTN: { word: '+ Ще ТТН', icon: Files },
  PAGE: { word: '+ Сторінка', icon: FileText },
  TICKET: { word: '+ Талон з ваг', icon: Weight },
  // P1: an акт is added from «Є розбіжність», which is a Wave 2 flow of its own (§3.3 D-11).
  ACT: { word: '+ Акт', icon: Scale },
};

const DUPLICATE = 'Схоже, та сама сторінка двічі';
const LOW = 'Нечітко видно';

const holdChip = (text: string): JSX.Element => (
  <span
    className="inline-flex items-center rounded-[6px] px-[0.375rem] py-[2px] text-[0.875rem] leading-[1.125rem] font-medium"
    style={{ background: 'var(--cam-hold-bg)', color: 'var(--cam-hold)' }}
  >
    {text}
  </span>
);

export function ReviewGrid({ pages, add, onOk, onRetake, onAdd }: {
  pages: CapturedPage[];
  add: AddKind[];
  onOk(): void;
  onRetake(i: number): void;
  onAdd(k: AddKind): void;
}): JSX.Element {
  // Paired by POSITION, so a list that holds one object twice is still two shots that look alike.
  const twinned = pages.map((page, i) => pages.some((other, j) => j !== i && looksDuplicate(page, other)));
  return (
    <div data-surface="dark" className="flex min-h-dvh flex-col bg-cam-bg text-cam-ink">
      <div className="mx-auto flex w-full max-w-[35rem] flex-1 flex-col gap-3 px-gutter pt-3 pb-4">
        <h1 className="text-[1.25rem] leading-[1.75rem] font-semibold">
          Перевірте: {pluralN(pages.length, DC.plurals.page)}
        </h1>
        <ul className="grid grid-cols-2 gap-3">
          {pages.map((page, i) => (
            <li key={`${page.artefact}-${String(page.doc_index)}-${String(page.page_no)}-${String(i)}`}
              className="flex flex-col gap-2">
              <span className="relative block aspect-[3/4] overflow-hidden rounded-[10px]">
                <PageThumb page={page} />
              </span>
              <span className="text-[0.875rem] leading-[1.125rem]" style={{ color: 'var(--cam-text-2)' }}>
                {captionOf(page, pages)}
              </span>
              {twinned[i] === true ? holdChip(DUPLICATE) : null}
              {page.quality === 'LOW' ? holdChip(LOW) : null}
              <QuietButton dark icon={RefreshCcw} label="Перезняти" onPress={() => { onRetake(i); }} />
            </li>
          ))}
        </ul>
        {add.length === 0 ? null : (
          <div className="grid grid-cols-2 gap-2">
            {add.map((kind) => (
              <QuietButton key={kind} dark half icon={ADD[kind].icon} label={ADD[kind].word}
                onPress={() => { onAdd(kind); }} />
            ))}
          </div>
        )}
      </div>
      <ActionBar dark>
        <PrimaryAction icon={Check} verb="Добре, все видно" dark onPress={onOk} />
      </ActionBar>
    </div>
  );
}
