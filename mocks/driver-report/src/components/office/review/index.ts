// mocks/driver-report/src/components/office/review/index.ts
/** The office review kit (I-15 «review», W1-05): the exception rows of «Зараз» and «Перевірка», the two write
 *  surfaces that change what a driver sent — «Виправити» and «Попросити перезняти» — and the three read surfaces of
 *  the truck-day: its requisites, its summary cells and its timeline.
 *
 *  Wave 2 consumes these names and nothing deeper. The two that WRITE (`CorrectionDialog`, `RequestPopover`) own
 *  their own mutation, their own refusal sentence and their own «Водій побачить» Reading, so a page that mounts one
 *  cannot forget the reason chip, the `SAYS_*` table or the promise made to the driver. */
export { CallPopover } from './CallPopover';
export { CorrectionDialog } from './CorrectionDialog';
export { ExceptionRow } from './ExceptionRow';
export { FactGrid } from './FactGrid';
export { OcrSuggestion } from './OcrSuggestion';
export { ReasonChips } from './ReasonChips';
export { RequestPopover } from './RequestPopover';
export { RequestTrack } from './RequestTrack';
export { SummaryCell } from './SummaryCell';
export { TimeInput } from './TimeInput';
export { Timeline } from './Timeline';
