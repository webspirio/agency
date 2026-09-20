// mocks/driver-report/src/components/office/review/OcrSuggestion.tsx
/** A printed ТТН field before the operator confirms it (§4.2 C-04): «OCR: 004517 · з фото — перевірте» + «імітація».
 *
 *  The chip is deliberately NOT a value. It says three things in one line — what was read, where it came from, and
 *  that it is a suggestion — because the whole of C-04 rests on «confirm instead of re-type», and a suggestion that
 *  LOOKS like a confirmed value is the one way that design silently becomes «the machine typed it for you».
 *
 *  The `SimChip` beside it is not decoration either: nothing in this mock reads a photo, so every "OCR" value here is
 *  invented and §6.5 requires it to say so. It is a sibling, not a child, so the sentence stays one text node and the
 *  confession stays its own element.
 *
 *  THE CHIP WRAPS. It used to be `h-[28px] … whitespace-nowrap`, and the fields column of C-04 is a 520 px card
 *  with `overflow-hidden`: measured in Chrome at 1 440 px, «OCR: ТОВ «Дніпро-Корм» · ЄДРПОУ 31785062» ended 101 px
 *  outside it, «OCR: ПП «Птахофабрика «Злагода» · ЄДРПОУ …» 162 px and «Вантаж» 8 px — three printed values the
 *  operator was asked to confirm and could not read (§8.3 C-04 #1, W3-05). A field's name is short and an
 *  organisation's is not, so the height is a MINIMUM and the line breaks. */
import type { JSX } from 'react';
import { SimChip } from '../../shared';

export function OcrSuggestion({ value }: { value: string }): JSX.Element {
  return (
    <span className="inline-flex flex-wrap items-center gap-[8px] align-middle">
      <span className="inline-flex min-h-[28px] min-w-0 items-center rounded-[8px] bg-hold-wash px-[10px] py-[5px] text-[13px] leading-[1.35] font-medium break-words text-hold">
        {`OCR: ${value} · з фото — перевірте`}
      </span>
      <SimChip />
    </span>
  );
}
