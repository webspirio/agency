// mocks/driver-report/src/components/driver/capture/index.ts
/** The capture kit (I-15 «components/driver/capture», W1-03): one camera, two reviews, the two screens that replace
 *  a photo, and the example card.
 *
 *  It is a barrel of its OWN, separate from `../index.ts`, so a flow that only needs a header does not pull the
 *  camera, the drawn artefacts and every SVG behind them into its bundle.
 *
 *  It deliberately does NOT re-export the odometer step, the digit strip or the keypad (W1-07): those live in the
 *  same directory behind `./odometer`, because the odometer is a question about a NUMBER that happens to follow a
 *  photograph, and a screen that asks it may not need a camera at all (§3.3 D-09). */
export { CameraScreen, type Row2Kind } from './CameraScreen';
export { ExampleCard } from './ExampleCard';
export { FrameGuide, frameFor, type FrameKind } from './FrameGuide';
export { NoDocumentPage } from './NoDocumentPage';
export { NoPhotoScreen } from './NoPhotoScreen';
export { QualityChips, type QualityReason } from './QualityChips';
export { ReviewGrid, type AddKind } from './ReviewGrid';
export { ReviewSingle } from './ReviewSingle';
/** The spec a viewfinder draws, declared where it is decided (`src/app/capture/drawnPlan.ts`) and re-exported here
 *  because every consumer of the camera needs it and none of them should reach into `app/` for a prop type. */
export type { DrawnSpec } from '../../../app/capture/drawnPlan';
