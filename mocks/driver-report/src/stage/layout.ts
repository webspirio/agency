// mocks/driver-report/src/stage/layout.ts
/** Where the four panes sit (§5.2, §8.4 #1–#3, I-13). One pure function over the window size, so the three sizes the
 *  demo is ever shown at are a table of assertions rather than a browser somebody has to resize.
 *
 *  THREE MODES, and the difference is what scales:
 *  - `canvas` (W ≥ 1440 and H ≥ 900): a fixed 1 440 × 900 stage scaled AS A WHOLE by `k`, so 1 920 × 1 080 is the
 *    rehearsed layout enlarged for the video codec and nothing reflows on the way. The coordinates this returns are
 *    therefore CANVAS coordinates — the page applies `k` once, as a CSS transform on the canvas box, and never
 *    multiplies a rect by it here.
 *  - `reflow`: `k` is 1 and every number is a real CSS pixel. The phone scales to the available height; the console
 *    takes the width that is left AT ITS NATIVE SIZE, so console text stays 14 px and its own breakpoints (§4.1) are
 *    what decide between the wide, compact and rail layouts.
 *  - `single`: the reflow would put the phone below 0.8 or the console below 720 px, or the presenter asked for one
 *    pane («1» / «2» / «3»). The phone gets the whole canvas, centred, at the largest scale ≤ 1.6 that fits. The
 *    console pane is still LAID OUT — the page keeps its iframe mounted and merely invisible, because a reload is the
 *    one thing the stage must never do to a pane (§5.1).
 *
 *  The phone's scale is left fractional (the page applies it as a transform); every RECT is rounded, because the
 *  console's width is the remainder of a subtraction and 1 078,956 px is not a number anybody pinned.
 *
 *  Every comparison goes through `num.ts` — `gte`, `lt`, `lte` are `Math.sign(a - b)` and work on the fractional
 *  scales here exactly as they do on integers. The two pixel helpers below are the module's only `*` and `/`. */
import { gte, lt, lte } from '../domain/num';

export type StageLayout = { mode: 'canvas' | 'reflow' | 'single'; k: number; bar: 36 | 40;
  phone: { x: number; y: number; scale: number }; console: { x: number; y: number; w: number; h: number };
  captionsY: number; scaleLabel: string | null };

export type StageLayoutInput = { W: number; H: number; viewport: '360x670' | '390x844';
  focus: 'both' | 'phone' | 'console'; single: 'both' | 'phone' | 'console'; barHidden: boolean };

/** The rehearsal canvas (§5.2). Exported because the page draws the box this function measures against: two
 *  copies of 1 440 × 900 is exactly the drift the whole module exists to keep out of the layout. */
export const STAGE_CANVAS = { w: 1440, h: 900 } as const;
const CANVAS = STAGE_CANVAS;
/** The phone frame at scale 1 (§5.3): the viewport inside a 12 px bezel, and the 390 × 844 variant (D1). */
const FRAMES = { '360x670': { w: 384, h: 736 }, '390x844': { w: 414, h: 910 } } as const;
/** Above 1.35 the canvas stops being a demo and starts being a slideshow (§5.2). */
const MAX_K = 1.35;
/** Below these the two panes stop being worth showing side by side (§5.2). */
const MIN_PHONE = 0.8;
const MIN_CONSOLE = 720;
/** A single phone pane never goes past this, whatever the window (§5.2). */
const SINGLE_MAX = 1.6;
const GUTTER = 16;
/** Bar → captions → panes, in the reflow (§5.2: captions 20 px at y = 40 with a 36 px bar). */
const CAPTIONS_GAP = 4;
const PANES_GAP = 28;
/** The air above and below the phone that its scale is computed against (§5.2). */
const PAD = 20;

// oxlint-disable-next-line agency/no-float-arithmetic -- stage canvas geometry in CSS px, not money
const ratio = (a: number, b: number): number => a / b;
// oxlint-disable-next-line agency/no-float-arithmetic -- stage canvas geometry in CSS px, not money
const times = (a: number, k: number): number => a * k;

const px = (v: number): number => Math.round(v);

/** «Масштаб 88 %» whenever what the audience sees is smaller than what was rehearsed, else nothing (§5.4 #13).
 *  A plain space before the «%», not the NBSP §0.1 asks of a NUMBER: the spec pins this label three times and the
 *  W2-10 test compares it as a raw string, so the byte is not ours to improve. */
const label = (scale: number): string | null => (lt(scale, 1) ? `Масштаб ${Math.round(times(scale, 100))} %` : null);

export function stageLayout(i: StageLayoutInput): StageLayout {
  const frame = FRAMES[i.viewport];
  const bar: 36 | 40 = gte(i.W, CANVAS.w) ? 40 : 36;
  /** A hidden bar gives its height back to the panes (§5.4: «P» hides it, the canvas gains 40 px). `bar` still
   *  reports the height the bar HAS, because that is what the page draws when it comes back. */
  const barH = i.barHidden ? 0 : bar;
  const solo = i.single !== 'both';

  if (!solo && i.focus === 'both' && gte(i.W, CANVAS.w) && gte(i.H, CANVAS.h)) {
    const fit = Math.min(ratio(i.W, CANVAS.w), ratio(i.H, CANVAS.h));
    const k = lte(fit, MAX_K) ? fit : MAX_K;
    return { mode: 'canvas', k, bar: 40, phone: { x: 24, y: 80, scale: 1.1 },
      console: { x: 470, y: 80, w: 946, h: 810 }, captionsY: 48,
      // The phone rides at 1.1 × k, so the canvas is always the smaller of the two and the only one worth naming.
      scaleLabel: label(k) };
  }

  const y = barH + PANES_GAP;
  const captionsY = barH + CAPTIONS_GAP;
  const fitH = ratio(i.H - barH - PAD - PAD, frame.h);
  const scale = reflowScale(i, frame, fitH);
  const phoneW = px(times(frame.w, scale));
  const phoneH = px(times(frame.h, scale));
  const cx = GUTTER + phoneW + GUTTER;
  const cw = i.W - cx - GUTTER;

  if (solo || lt(scale, MIN_PHONE) || lt(cw, MIN_CONSOLE)) {
    const one = Math.min(SINGLE_MAX, fitH, ratio(i.W - GUTTER - GUTTER, frame.w));
    return { mode: 'single', k: 1, bar,
      phone: { x: px(ratio(i.W - px(times(frame.w, one)), 2)), y, scale: one },
      // Laid out at full width and merely invisible: the hidden pane stays live and is never reloaded (§5.2).
      console: { x: GUTTER, y, w: i.W - GUTTER - GUTTER, h: i.H - y - PAD },
      captionsY, scaleLabel: label(one) };
  }

  return { mode: 'reflow', k: 1, bar, phone: { x: GUTTER, y, scale },
    console: { x: cx, y, w: cw, h: phoneH }, captionsY, scaleLabel: label(scale) };
}

/** The phone's scale in the reflow. «F» (§5.2) weights the two panes: phone large takes 40 % of the width at up to
 *  1.5, console large leaves the phone whatever 28 % of the width allows and never less than 0.7. */
function reflowScale(i: StageLayoutInput, frame: { w: number; h: number }, fitH: number): number {
  if (i.focus === 'phone') return Math.min(1.5, fitH, ratio(times(i.W, 0.4), frame.w));
  if (i.focus === 'console') {
    const rest = i.W - px(times(i.W, 0.72)) - GUTTER - GUTTER - GUTTER;
    const fit = Math.min(fitH, ratio(rest, frame.w));
    return gte(fit, 0.7) ? fit : 0.7;
  }
  return fitH;
}
