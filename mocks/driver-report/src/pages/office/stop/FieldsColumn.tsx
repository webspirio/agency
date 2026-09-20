// mocks/driver-report/src/pages/office/stop/FieldsColumn.tsx
/**
 * The left half of the paper-mirror (§4.2 C-04): the printed side the operator CONFIRMS, and the handwritten side
 * the operator TYPES — two panels, because they are two different jobs and mixing them is what makes an operator
 * re-type a number a machine had already read correctly.
 *
 * A SUGGESTION IS NOT A VALUE. Before «Прийняти друковані» every printed field is an `OcrSuggestion` chip — «OCR:
 * 004517 · з фото — перевірте» beside «імітація» — and afterwards it is a mono value with its provenance under it,
 * «OCR · підтвердила Н. Шевчук 08:42». The two states look nothing like each other on purpose: the day they look
 * similar is the day «підтверджуєте ви» stops being true, and the whole of C-04 rests on that sentence.
 *
 * THE COUNTER APPEARS ONLY WHEN IT IS DONE. «3 з 3 обов'язкових» is the panel's right slot once №, дата and маса
 * carry values (§4.2 C-04), not a running «0 з 3»: a progress number beside eight rows invites the operator to
 * chase the number rather than read the paper, and the three required fields are already the only ones the panel
 * marks.
 *
 * THE REVERSE IS FOUR DIGITS AND NOTHING ELSE. `TimeInput` commits «0748», never «07:48» — `reviewStop`'s
 * `VALUE_INVALID` is worded «Час — чотири цифри, наприклад 0748.» and the wire carries exactly what that sentence
 * describes (I-15). Focusing one of them is what raises the `ZoomInset` and scrolls the photo column to the page
 * the number is written on; the inset sits HERE, under the hint, rather than in the photo column, because «лише
 * час» only works if the crop and the field are one glance apart. On a confirmed day the times are `disabled` like
 * every other control in this column: §4.2 C-04 makes the fields read-only, and a field that took the keystrokes
 * and let `reviewStop` answer `DAY_CONFIRMED` would be asking the operator to find out by being refused.
 *
 * «НА ЗВОРОТІ НЕ ЗАПОВНЕНО» IS A TOGGLE, NOT A REFUSAL. A ТТН whose reverse the loading point never filled in is
 * ordinary, and the answer is the derived Reading's hold variant — «У ТТН часу немає — рахується за записом водія,
 * без відмітки» — which the server derives. This panel only says which it is.
 */
import type { JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { Check, Clock, Image as ImageIcon } from 'lucide-react';
import { OcrSuggestion, TimeInput } from '../../../components/office/review';
import { Panel } from '../../../components/office';
import type { TtnDocView, TtnFieldView } from '../../../domain/dto';
import { TIME_FIELDS } from '../../../domain/views/office';
import type { TtnField } from '../../../domain/types';
import { ZoomInset, type ZoomCell } from './ZoomInset';

const BUTTON = 'inline-flex h-[36px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[14px] '
  + 'text-[14px] leading-none font-medium whitespace-nowrap transition-colors '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring '
  + 'disabled:cursor-default disabled:opacity-50';
const OUTLINE = `${BUTTON} border border-line-strong bg-label text-ink hover:bg-bench`;
const CHIP = 'inline-flex h-[32px] shrink-0 cursor-pointer items-center rounded-[8px] border px-[12px] '
  + 'text-[13px] leading-none font-medium whitespace-nowrap transition-colors '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring '
  + 'disabled:cursor-default disabled:opacity-50';
const SHOW = 'inline-flex h-[24px] cursor-pointer items-center gap-[4px] rounded-[6px] text-[13px] leading-none '
  + 'text-text-2 underline underline-offset-2 hover:text-ink '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** A field row: 48 px tall, label column 150 px (§4.2 C-04). */
function Row({ field, stacked, onShow, children }: {
  field: TtnFieldView;
  stacked: boolean;
  onShow(): void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <div className="flex min-h-[48px] items-center gap-[12px] border-b border-line/70 px-[20px] py-[8px] last:border-b-0">
      <div className="flex w-[150px] shrink-0 flex-col gap-[2px]">
        <span className="text-[13px] leading-[1.4] text-text-2">{field.label}</span>
        {field.required
          ? <span className="text-[11px] leading-[1.3] text-hold">{"обов'язкове"}</span>
          : null}
        {stacked ? (
          <button type="button" className={SHOW} onClick={onShow}>
            <ImageIcon size={13} strokeWidth={2} aria-hidden="true" />
            Показати на фото
          </button>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function FieldsColumn({
  doc, locked, stacked, zoom, backVariant, timeError, printedRefusal, reverseRefusal,
  onAcceptPrinted, onSetField, onBlankReverse, onFocusField, onShowPhoto,
}: {
  doc: TtnDocView;
  /** A confirmed day is read-only: «День підтверджено — щоб змінити, його треба відкрити для виправлення.» */
  locked: boolean;
  /** rail and mobile stack the columns, so every field grows a «Показати на фото» link. */
  stacked: boolean;
  zoom: ZoomCell | null;
  backVariant: string | null;
  timeError: { field: TtnField; text: string } | null;
  printedRefusal: string | null;
  reverseRefusal: string | null;
  onAcceptPrinted(): void;
  onSetField(field: TtnField, value: string): void;
  onBlankReverse(): void;
  onFocusField(field: TtnField): void;
  onShowPhoto(field: TtnField): void;
}): JSX.Element {
  const complete = doc.printed_required > 0 && doc.printed_confirmed === doc.printed_required;

  return (
    <div className="flex flex-col gap-[16px]">
      <Panel
        title="Лицьовий бік · друковане"
        hint="OCR — лише підказка поруч із фото; підтверджуєте ви"
        right={complete ? (
          <span className="font-mono text-[12px] leading-none text-text-2">
            {`${doc.printed_confirmed} з ${doc.printed_required} обов'язкових`}
          </span>
        ) : undefined}
      >
        <div className="flex flex-col">
          {doc.printed.map((f) => (
            <Row key={f.field} field={f} stacked={stacked} onShow={() => onShowPhoto(f.field)}>
              {f.value === null ? (
                f.ocr === null
                  ? <span className="text-[14px] leading-[1.4] text-text-2">—</span>
                  : <OcrSuggestion value={f.ocr} />
              ) : (
                <div className="flex flex-col gap-[2px]">
                  <span className="font-mono text-[14px] leading-[1.4] text-ink">{f.value}</span>
                  {f.source_line === null
                    ? null
                    : <span className="text-[12px] leading-[1.4] text-text-2">{f.source_line}</span>}
                </div>
              )}
            </Row>
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-[6px]">
        <button type="button" className={OUTLINE} disabled={locked} onClick={onAcceptPrinted}>
          <Check size={16} strokeWidth={2} aria-hidden="true" />
          Прийняти друковані
          <kbd className="rounded-[4px] border border-line-strong px-[5px] py-[2px] font-mono text-[11px] leading-none text-text-2">
            Enter
          </kbd>
        </button>
        {printedRefusal === null
          ? null
          : <p className="text-[13px] leading-[1.45] text-reject">{printedRefusal}</p>}
      </div>

      <Panel
        title="Зворотний бік · вантажно-розвантажувальні операції"
        hint="Рукописне — вводите з фото поруч, лише час"
      >
        <div className="flex flex-col gap-[14px] p-[20px]">
          {zoom === null || backVariant === null ? null : (
            <ZoomInset
              variant={backVariant}
              cell={zoom}
              caption={`${doc.switch_label} · зворотний бік, 2×`}
            />
          )}

          <div className="flex flex-wrap items-end gap-[16px]">
            {doc.reverse.map((f) => (
              <div key={f.field} className="flex flex-col gap-[6px]">
                {TIME_FIELDS.includes(f.field) ? (
                  <TimeInput
                    label={f.label}
                    value={f.value}
                    disabled={locked}
                    error={timeError !== null && timeError.field === f.field ? timeError.text : null}
                    onFocus={() => onFocusField(f.field)}
                    onCommit={(v) => onSetField(f.field, v)}
                  />
                ) : (
                  <label className="flex flex-col gap-[4px]">
                    <span className="text-[13px] leading-[1.3] text-text-2">{f.label}</span>
                    <input
                      key={f.value ?? ''}
                      defaultValue={f.value ?? ''}
                      autoComplete="off"
                      disabled={locked}
                      onFocus={() => onFocusField(f.field)}
                      onBlur={(e) => {
                        if ((e.target.value.trim()) !== (f.value ?? '')) onSetField(f.field, e.target.value.trim());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className="h-[40px] w-[120px] rounded-[8px] border border-line-strong bg-label px-[10px] font-mono text-[16px] leading-none text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                  </label>
                )}
                {f.field === doc.reverse[0]?.field ? (
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={doc.blank_reverse}
                    onClick={onBlankReverse}
                    className={cn(CHIP, doc.blank_reverse
                      ? 'border-ink bg-ink text-label'
                      : 'border-line-strong bg-label text-ink hover:bg-bench')}
                  >
                    На звороті не заповнено
                  </button>
                ) : null}
                {stacked ? (
                  <button type="button" className={SHOW} onClick={() => onShowPhoto(f.field)}>
                    <ImageIcon size={13} strokeWidth={2} aria-hidden="true" />
                    Показати на фото
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {doc.derived === null ? null : (
            <div className="flex items-start gap-[8px]">
              <Clock
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className={cn('mt-[2px] shrink-0', doc.derived.tone === 'hold' ? 'text-hold' : 'text-ink')}
              />
              <p className={cn('text-[14px] leading-[1.45]', doc.derived.tone === 'hold' ? 'text-hold' : 'text-ink')}>
                {doc.derived.text}
              </p>
            </div>
          )}

          {reverseRefusal === null
            ? null
            : <p className="text-[13px] leading-[1.45] text-reject">{reverseRefusal}</p>}
        </div>
      </Panel>
    </div>
  );
}
