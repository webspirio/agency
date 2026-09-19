// mocks/driver-report/src/components/office/MockBanner.tsx
/** «Макет: у вашу базу нічого не надсилається» — a Panel with a 4 px hold rule, 14 px (§4.1, §8.4).
 *
 *  It is hold and not brick because nothing is wrong: it is a standing fact about this build, and the office needs
 *  it exactly once per page, where a clerk about to press «В BAS» can see it without hunting. The text is the
 *  caller's (`OC.mockBanner`) so the stage can say something else on a screen it owns. */
import type { JSX } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Panel } from './Panel';

export function MockBanner({ text }: { text: string }): JSX.Element {
  return (
    <Panel>
      <div className="flex items-center gap-[12px] px-[20px] py-[14px]">
        <span aria-hidden="true" className="h-[24px] w-[4px] shrink-0 rounded-[2px] bg-hold" />
        <TriangleAlert size={16} aria-hidden="true" className="shrink-0 text-hold" />
        <p className="text-[14px] leading-[1.45] text-ink">{text}</p>
      </div>
    </Panel>
  );
}
