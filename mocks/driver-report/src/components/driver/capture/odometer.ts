// mocks/driver-report/src/components/driver/capture/odometer.ts
/** The odometer kit (I-15 «capture/odometer», W1-07): the step of §3.3 D-09, its digit strip and its keypad.
 *
 *  A BARREL OF ITS OWN, deliberately, and `capture/index.ts` does NOT re-export it. The odometer step appears in five
 *  flows (D-03, D-04, D-08 later, D-10, D-14), and three of them never open the camera; pulling the capture kit in
 *  behind an import of `OdometerStep` would put the camera engine, the review screens and every drawn artefact into a
 *  screen that only ever asks for one number. Same reason `./day` is separate from the chrome kit.
 *
 *  Everything it decides about the NUMBER comes from `src/domain/odometer.ts` (`expectedOdometer`, `readVerdict`,
 *  `storedSource`, `typedWarning`). Nothing here computes a kilometre. */
export { OdometerStep } from './OdometerStep';
export { DigitStrip } from './DigitStrip';
export { Keypad } from './Keypad';
