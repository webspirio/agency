// mocks/driver-report/src/pages/office/NowLanePage.tsx
/** C-02 «Зараз» — what a driver raised, or what cannot wait, oldest first (§4.2 C-02, §8.3 C-02).
 *
 *  ONE Panel and no groups: this lane is read top to bottom under pressure, and a heading between two alarms is a
 *  place for the eye to stop. The order is the domain's — oldest first — and the page does not re-sort it. */
import type { JSX } from 'react';
import { PageHead } from '../../components/office';
import { LaneList } from './lanes/LaneList';

export function NowLanePage(): JSX.Element {
  return (
    <>
      <PageHead title="Зараз" description="Те, що підняв водій або що не чекає. Найстаріше — зверху." />
      <LaneList lane="NOW" />
    </>
  );
}
