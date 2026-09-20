// mocks/driver-report/src/components/office/PageHead.tsx
/** h1 26/600/−0.02em, a description of at most 64 ch in `--text-2`, actions on the right (§4.1 «Page»).
 *
 *  The 64 ch is a measure, not a decoration: the description is the sentence that says what this page is FOR, and
 *  a line longer than that stops being read. It is a `ReactNode` rather than a string so a page can put a count or
 *  a `SimChip` inside its own sentence without the copy being assembled by string concatenation.
 *
 *  `back` is the deep-link return path («← Перевірка», §2.4): a `Link`, so it keeps the hash router's history
 *  instead of reloading the app, and the office can walk back out of a row it opened from a lane.
 *
 *  `title` is a `ReactNode` and the `<h1>` stays HERE, because §4.2 C-13 makes the PLATE the heading — «← Машини»,
 *  then `Plate` lg, then the truck line. As a `string` the only way to draw that page was to mirror this header's
 *  markup inside it, and a second copy of the console's page header living in a page is exactly the drift this
 *  component exists to prevent. `Plate` carries `role="img"` with «Номер АР 8150 КС», so a heading made of one still
 *  reads out as words (§8.5). */
import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router';

export function PageHead({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { label: string; to: string };
}): JSX.Element {
  return (
    <header className="mb-[20px] flex flex-wrap items-start justify-between gap-[16px]">
      <div className="min-w-0">
        {back === undefined ? null : (
          <Link
            to={back.to}
            className="mb-[6px] inline-flex h-[32px] items-center rounded-[8px] text-[13px] text-text-2 hover:text-ink"
          >
            ← {back.label}
          </Link>
        )}
        <h1 className="text-o-h1 text-ink">{title}</h1>
        {description === undefined ? null : (
          <div className="mt-[6px] max-w-[64ch] text-o-lede text-text-2">{description}</div>
        )}
      </div>
      {/* `max-w-full` beside `shrink-0`: without it the actions row keeps its max-content width and `flex-wrap`
          never fires, because there is nothing to wrap inside. Measured at 390 px on «В BAS», whose two actions
          are 398 px together — «Імпорт у BAS (імітація)» sat 24 px outside `main` and scrolled it (§8.3 Shell #4).
          `shrink-0` still stops the title squeezing them on a wide page; `max-w-full` only caps the row at the
          header, which is where wrapping starts. */}
      {actions === undefined ? null : <div className="flex max-w-full shrink-0 flex-wrap items-center gap-[8px]">{actions}</div>}
    </header>
  );
}
