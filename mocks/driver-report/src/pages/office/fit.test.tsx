// mocks/driver-report/src/pages/office/fit.test.tsx
/** §8.6 #22 — «A horizontal scroll in the console at 946 px or 390 px» — and §4.1's first promise about a table:
 *  «Never a horizontal scroll: each page lists which columns merge at compact and rail.»
 *
 *  WHY THIS FILE EXISTS, AND WHAT IT CAN AND CANNOT SEE. jsdom has no layout engine, so nothing here measures a
 *  pixel; W3-05 measured them in a real browser and W3-06 measured them again after the fix. What is written down
 *  here is the MECHANISM those measurements proved correct, so the file goes red if somebody writes the collapsing
 *  spelling back. The measurements, in Chrome, in the stage's own console width:
 *
 *    BEFORE (946 px, «Весь парк», beat 2): the pane is 690 px and `table-layout: auto` let cell content override
 *    every pinned width — «Зв'язок» took 203 px for «42 хв · тоді в телефоні 3», the table grew to 796 px and the
 *    section clipped it, so EVERY row's «…» menu (x 948–984) and its chevron (x 996–1012) were invisible;
 *    `documentElement.scrollWidth` read 995 against a 946 client. «Машини» was worse: 829 px of table in the same
 *    690 px pane. In «Пілот» the table did fit, and failed the other way — auto layout gave «Стан» 92 px, so one
 *    «остання подія: …» line wrapped to one word per line and the row became 299 px tall.
 *
 *    `table-layout: fixed` ALONE MAKES IT WORSE, and that is measured too: forced on «Машини» at 946 px the table
 *    went from 829 px to 1312 px, because fixed layout hands every column the width it declared and the eleven
 *    declared widths add up to 1 312. That is the whole reason the fix is two things and not one.
 *
 *    AFTER: the widths are declared as PERCENTAGES of their own declared total, in a `<colgroup>`, under
 *    `table-layout: fixed`. The table is then exactly its container at every width — it cannot overflow and it
 *    cannot be pushed by content — and the pinned widths survive as RATIOS. Where their total already fits the
 *    pane, the ratio and the pixel are the same number.
 *
 *  So two things are pinned below, and the second is what keeps the first honest:
 *
 *  1. THE MECHANISM: every console table carries the `table-fixed` class TOKEN and a `<colgroup>` with one `<col>`
 *     per rendered column, each a percentage, and the declared widths on those cols add up to the table's own
 *     `data-fit`. (Class TOKENS, never substrings: the gate measured one of its own assertions passing spuriously
 *     because `max-h-full` contains `h-full`.)
 *  2. THE BUDGET: at each of the three widths §8.3's Shell criteria name — 1 440, 946 and 890 — the declared
 *     widths of the columns that SURVIVE that mode add up to no more than the pane at that width. That is what
 *     decides «which columns survive compact», and it is the half a percentage cannot check: a table whose columns
 *     total twice its pane still fits, by being squeezed to half of everything, and a 92 px «Стан» is how that
 *     looks. Under the budget the compression factor at the demo width is exactly 1.
 *
 *  The pane is the console width minus the sidebar and minus the page padding of §4.1: 1 440 − 240 − 64 = 1 136 ·
 *  946 − 208 − 48 = 690 · 890 − 76 − 48 = 766. Every one of the three is measured in the browser, not derived here.
 *
 *  KNOWN RESIDUAL, deliberate: the bands are wider than their reference widths (wide is ≥ 1 200, compact 900–1 199,
 *  rail 720–899), so at the FLOOR of a band the pane is smaller than the budget — 896, 644 and 596 — and the
 *  percentages compress everything proportionally. That is a smaller table, never a scrollbar, which is what §8.6
 *  #22 forbids; nothing here asserts readability at 1 200 or at 900.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { act, cleanup, screen } from '@testing-library/react';
import { toInt } from '../../domain/num';
import { atBeat, renderAt } from '../../test/harness';

afterEach(cleanup);   // no globals here: Testing Library would not unmount by itself (src/app/speed.test.ts)

const width = (w: number) => act(() => { window.innerWidth = w; window.dispatchEvent(new Event('resize')); });

/** The console routes of §2.3 that render a list. `/inbox/*`, `/pilot`, `/stop/:id` and `/day/:id` are not tables. */
const ROUTES = ['/', '/days', '/key-points', '/bas', '/trucks', '/originals', '/worktime', '/drivers'] as const;

/** Console width → the pane a table is laid out in, measured in Chrome (see the header). */
const PANE = [
  { at: 1440, mode: 'wide', pane: 1136 },
  { at: 946, mode: 'compact', pane: 690 },
  { at: 890, mode: 'rail', pane: 766 },
] as const;

/** Every `<table>` on screen, with what it declared about itself. A table is named by its first header, which is
 *  what a failure has to print to be actionable when a route renders four of them (the sheets of «В BAS»). */
function tables(): { el: HTMLElement; name: string; fit: number; cols: HTMLTableColElement[] }[] {
  return screen.queryAllByRole('table').map((el) => {
    const name = el.querySelector('thead th')?.textContent ?? '?';
    const fit = el.getAttribute('data-fit');
    expect(fit, `«${name}»: a console table declares its own width budget`).not.toBeNull();
    return { el, name, fit: toInt(fit ?? ''), cols: [...el.querySelectorAll('col')] };
  });
}

describe('§8.6 #22 — the console never scrolls sideways', () => {
  for (const { at, mode, pane } of PANE) {
    it(`fits every list inside the ${mode} pane (${String(at)} px → ${String(pane)} px)`, async () => {
      await atBeat(10);
      for (const route of ROUTES) {
        width(at);
        renderAt(route);
        await screen.findAllByRole('table');   // the list, not the skeleton the page paints first
        const found = tables();
        expect(found.length, `${route} renders a list`).toBeGreaterThan(0);
        for (const { el, name: title, fit, cols } of found) {
          const name = `${route} @${String(at)} «${title}»`;
          // 1. the mechanism — the TOKEN, never a substring
          expect(el.className.split(/\s+/), `${name}: table-fixed`).toContain('table-fixed');
          expect(cols.length, `${name}: one <col> per rendered column`)
            .toBe(el.querySelectorAll('thead th').length);
          for (const col of cols) expect(col.style.width, `${name}: a col is a share of the table`).toMatch(/%$/);
          const declared = cols.reduce((sum, col) => sum + toInt(col.getAttribute('data-w') ?? ''), 0);
          expect(declared, `${name}: the cols carry the declared widths`).toBe(fit);
          // 2. the budget — which columns survive this mode
          expect(fit, `${name}: ${String(fit)} px of columns in a ${String(pane)} px pane`).toBeLessThanOrEqual(pane);
        }
        cleanup();
      }
    });
  }

  // §8.3 Shell #4: «At 390 × 844 … every table is a card list.» «В BAS» was the one console route that still
  // rendered a <table> there — 509 px of it inside a 390 px main, so the four-tab strip and «Імпорт у BAS
  // (імітація)» were off screen (W3-05, measured in Chrome).
  it('turns every list into cards at 390 px (§8.3 Shell #4)', async () => {
    await atBeat(10);
    for (const route of ROUTES) {
      // Wide FIRST, so the wait below is for the data rather than for a fold that may never come.
      width(1440);
      renderAt(route);
      await screen.findAllByRole('table');
      width(390);
      expect(screen.queryAllByRole('table'), `${route} @390: no table survives the fold`).toHaveLength(0);
      cleanup();
    }
  });
});
