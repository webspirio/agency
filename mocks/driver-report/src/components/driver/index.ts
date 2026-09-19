// mocks/driver-report/src/components/driver/index.ts
/** The driver chrome kit (I-15 «components/driver», W1-01): the nineteen pieces every driver screen is assembled
 *  from. A screen imports from HERE and never from a file inside, so the kit's shape is one import list rather than
 *  nineteen paths that each page spells differently.
 *
 *  The day kit — `TripRail`, `StopCard`, `RoadStopCard`, `TodayCard`, `DayDoneCard`, `TripRailCard` — is a separate
 *  barrel (`./day`, W1-02), and the capture kit another (`./capture`, W1-03): a flow that only needs a header must
 *  not pull the camera in behind it.
 *
 *  WHY THESE ARE NATIVE `<button>`s AND NOT THE KIT'S `Button`. Two of the kit's own base classes contradict the
 *  driver route's acceptance criteria, and overriding both leaves nothing of it. Its cva string opens with
 *  `outline-none`, which switches off the 3 px `--ring` outline at offset 2 px that `index.css` gives every
 *  `:focus-visible` element — §8.5 asks for that outline by name. Its `outline` variant draws `border-border`,
 *  which is `--line` at 1.41:1, and §8.5 asks for every interactive boundary at ≥ 3:1 — which is what `tap-ring`
 *  (an inset `--line-strong`, 3.67:1) is for. Its sizes are px (`h-9`, `h-11`) where every driver target is rem, so
 *  they would not follow the OS text size. The kit's `Drawer` IS used, by `BottomSheet`, and no kit file is edited
 *  (§6.5). */
export { ActionBar } from './ActionBar';
export { AppHeader } from './AppHeader';
export { BottomSheet } from './BottomSheet';
export { CallButton } from './CallButton';
export { ChipRow } from './ChipRow';
export { DriverScreen } from './DriverScreen';
export { DriverSkeleton } from './DriverSkeleton';
export { FlowHeader } from './FlowHeader';
export { HoldCard } from './HoldCard';
export { InlineStartSheet, type StartChip } from './InlineStartSheet';
export { LightPage } from './LightPage';
export { MotionLock } from './MotionLock';
export { PrimaryAction } from './PrimaryAction';
export { QuietButton } from './QuietButton';
export { ReceiptCard } from './ReceiptCard';
export { StatusLine } from './StatusLine';
export { SyncStrip } from './SyncStrip';
export { TimeChips, type TimeChip } from './TimeChips';
export { Tile } from './Tile';
