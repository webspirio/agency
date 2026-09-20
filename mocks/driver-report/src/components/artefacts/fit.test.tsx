// mocks/driver-report/src/components/artefacts/fit.test.tsx
/**
 * A DRAWN ARTEFACT MUST HAVE A BOX TO BE DRAWN IN, AND THE WAVE 2 GATE FOUND IT HAD NONE.
 *
 * MEASURED IN CHROME at the Wave 2 exit gate, on the built mock at 390×844, `#/stop/stop-000002/arrive` step 2
 * («Поки стоїте — сфотографуйте щиток»). The dashboard cluster's `<svg>` laid out at **0×0** inside a 500×650
 * viewfinder, so the camera screen showed an empty frame. The a11y tree still carried
 * `img "Панель приладів, одометр 412443"`, which is why every jsdom test in this repo was green over it: jsdom has no
 * layout engine, `getByRole('img', …)` finds a zero-sized element exactly as it finds a painted one, and CLAUDE.md's
 * own fast-tier blind spot says it — «It does not run a browser. No Playwright, no viewport … Nobody has looked at a
 * pixel.» Three surfaces were blank at once: the capture viewfinder (D-06/D-07), `ReviewSingle`, and the «Ось так»
 * `ExampleCard` — i.e. the whole photographic half of the driver demo.
 *
 * THE COLLAPSE, as the measurement read it (`getBoundingClientRect` down the chain):
 *
 *     SeatBackdrop outer   flex h-full w-full … p-[6%]        500×650   definite
 *     SeatBackdrop inner   flex max-h-full max-w-full             0×0   ← the break
 *     Artefact FIT.view    flex h-full w-full                     0×0
 *     drawing <svg>        block h-full max-h-full w-auto         0×0
 *
 * `max-*` only caps, it never stretches, and the outer is `items-center`, which suppresses the flex default stretch.
 * So the inner had no definite size; `h-full`/`w-full` beneath it were percentages of an indefinite box, which
 * resolve to auto, which resolves back to the content — a cycle whose fixed point is zero.
 *
 * THE CONTRACT THIS FILE PINS, both halves measured in the same session:
 *
 *  1. `SeatBackdrop`'s inner wrapper carries a DEFINITE box (`h-full w-full`), so the chain beneath it has something
 *     to be a percentage OF.
 *  2. Every drawing SIZES ITSELF BY THE CSS CONTAIN RULE, and it takes all three parts to work: an explicit intrinsic
 *     size (the `width`/`height` attributes, `viewBox × FIT_SCALE`), `w-auto h-auto` so neither axis is pinned, and
 *     `max-h-full max-w-full` to cap it. An `<svg>` with a `viewBox` is a replaced element, so CSS's min/max
 *     constraint table shrinks it to fit PRESERVING ITS RATIO, in whichever axis binds. That is what makes the box
 *     HUG the drawing rather than letterbox it.
 *
 *     Two spellings that do not work, both measured here rather than reasoned about:
 *       · `h-full … w-auto` (the original) — height pinned, so a `max-width` violation is not transferred back.
 *       · `w-full h-auto …` (this gate's first attempt) — width pinned, so a `max-height` violation is not
 *         transferred back. It hugs a landscape drawing in a portrait box and NOTHING else: the «Ось так» card gave
 *         the 80×220 ОККО receipt an 868×340 box, and the tilt shadow drew a rectangle seven times its width.
 *     Measured with the contain rule, the same receipt is 124×340 and the cluster 445×202 — each its exact ratio,
 *     in a wide box, a tall box and the 4 rem thumb alike.
 *
 * Why an assertion about CLASS NAMES rather than about pixels: jsdom cannot measure, and a browser is not available
 * in the fast tier. So the browser is the instrument and this file is the record — it cannot re-derive the verdict,
 * but it does go red the moment somebody writes the collapsing spelling back, which is the failure that actually
 * happened. The pixels themselves remain W3-05's to confirm.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FIT_SCALE } from './catalogue';
import { Artefact, SeatBackdrop } from './index';

afterEach(cleanup);

/** The class list as TOKENS. A substring test cannot do this job: `max-h-full` contains `h-full`, so
 *  `expect(cls).not.toContain('h-full')` is red on the correct spelling and `toContain('h-full')` is green on the
 *  broken one — measured here, where it passed one assertion it should have failed. */
const classesOf = (el: Element | null | undefined): Set<string> =>
  new Set((el?.getAttribute('class') ?? '').split(/\s+/).filter((t) => t !== ''));

/** One variant per drawing component, so all seven `ArtefactPlan` arms are exercised. */
const ONE_OF_EACH = [
  'cluster:412443',        // ClusterArt   — landscape, 220×100
  'ttn-004517-front',      // TtnFront     — portrait
  'ttn-004518-back',       // TtnBack      — portrait
  'ttn-004517-signed',     // TtnSigned    — portrait
  'receipt-okko-58213',    // ReceiptArt   — a tall narrow strip
  'weigh-ticket-3317',     // WeighTicket
  'act-214',               // ActArt
] as const;

describe('a drawn artefact is given a box it can fill (§6.11)', () => {
  it.each(ONE_OF_EACH)('%s hugs its box by the contain rule, in either orientation', (variant) => {
    const { container } = render(<Artefact variant={variant} size="view" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const cls = classesOf(svg);

    // Neither axis pinned, both capped — so the binding axis shrinks the drawing and the other follows the ratio.
    expect(cls).toContain('w-auto');
    expect(cls).toContain('h-auto');
    expect(cls).toContain('max-h-full');
    expect(cls).toContain('max-w-full');
    // Pinning either axis is what letterboxes: `h-full` was the original defect, `w-full` this gate's first attempt.
    expect(cls).not.toContain('h-full');
    expect(cls).not.toContain('w-full');

    // The contain rule needs an INTRINSIC size to shrink FROM, and `viewBox` alone is only a ratio: with
    // width/height absent, `w-auto h-auto` falls back to the 300×150 default object size and the drawing renders
    // tiny instead of filling its box. The attributes must therefore exceed any box the app can give it.
    // The expectation is built and compared as a STRING, because the attribute the browser reads is a string.
    // The two viewBox tokens in between are SVG user units — a pixel count, never a decimal amount — so the one
    // conversion here is not the thing `agency/no-numeric-coercion` exists to stop, and it does not fire on it.
    const box = (svg?.getAttribute('viewBox') ?? '').split(/\s+/);
    expect(box).toHaveLength(4);
    const [vw, vh] = [box[2] ?? '', box[3] ?? ''].map(Number);
    expect(svg?.getAttribute('width')).toBe(`${(vw ?? 0) * FIT_SCALE}`);
    expect(svg?.getAttribute('height')).toBe(`${(vh ?? 0) * FIT_SCALE}`);
  });

  it('seats the artefact in a DEFINITE box, not a pair of caps', () => {
    const { container } = render(
      <SeatBackdrop><Artefact variant="cluster:412443" size="view" /></SeatBackdrop>,
    );
    const outer = container.firstElementChild;
    const inner = outer?.firstElementChild;
    expect(inner).not.toBeNull();
    const cls = classesOf(inner);
    // `max-h-full max-w-full` alone is what collapsed; the wrapper must carry a size of its own.
    expect(cls).toContain('h-full');
    expect(cls).toContain('w-full');
  });

  it('shadows the PAPER, and keeps the tilt on the box', () => {
    const { container } = render(
      <SeatBackdrop><Artefact variant="cluster:412443" size="view" /></SeatBackdrop>,
    );
    const inner = container.firstElementChild?.firstElementChild;

    // The shadow follows the hugging element. On the full-size wrapper it outlined a 455×601 rectangle around a
    // 445×202 cluster — three times the height of the dashboard it is supposed to sit under, on a dark seat.
    expect(classesOf(inner)).toContain('[&_svg]:[box-shadow:0_0.75rem_2rem_rgb(0_0_0/0.45)]');
    expect(inner?.getAttribute('style') ?? '').not.toContain('box-shadow');

    // The tilt stays on the wrapper: it turns about the same centre as the drawing centred inside it, so the picture
    // is identical, and `artefacts.test.tsx` goes on reading it as an inline style.
    expect(inner?.getAttribute('style') ?? '').toContain('rotate(-1.5deg)');
  });
});
