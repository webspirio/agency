// mocks/driver-report/src/pages/office/PilotPage.tsx
/** C-17 «Пілот» — the offer and how it is judged (§4.2 C-17, §8.3 C-14…C-17 #4).
 *
 *  The one console page with no hook, no table and no state: it renders `src/content/pilot.ts` and nothing else, at a
 *  measure of 760 px, because it is read rather than operated. That is also why it composes no sentence — every line
 *  is one string in one `<p>`, so a reader (and a test) sees exactly the bytes §4.2 pins.
 *
 *  D18 is enforced HERE by having nothing to enforce: the page renders `PILOT.lines` verbatim and adds no field of its
 *  own, so a price or a start date could only arrive by being written into the content file, where the note above it
 *  says not to. */
import type { JSX } from 'react';
import { PageHead, Panel } from '../../components/office';
import { PILOT, PILOT_NOT_IS_TITLE } from '../../content/pilot';

export function PilotPage(): JSX.Element {
  return (
    <div className="max-w-[760px]">
      <PageHead title={PILOT.title} />
      <Panel>
        <div className="flex flex-col gap-[12px] px-[20px] py-[20px]">
          {PILOT.lines.map((line) => (
            <div key={line.text} className="flex flex-col gap-[4px]">
              {line.heading === null ? null : (
                <h2 className="text-[15px] leading-[1.35] font-semibold text-ink">{line.heading}</h2>
              )}
              <p className="text-[15px] leading-[1.5] text-ink">{line.text}</p>
            </div>
          ))}
          <div className="mt-[8px] flex flex-col gap-[4px] border-t border-line/70 pt-[16px]">
            <h2 className="text-[15px] leading-[1.35] font-semibold text-ink">{PILOT_NOT_IS_TITLE}</h2>
            <p className="text-[15px] leading-[1.5] text-ink">{PILOT.notIs}</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
