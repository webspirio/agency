// mocks/driver-report/src/pages/office/ReviewLanePage.tsx
/** C-03 «Перевірка» — what the operator checks against the photos, money first (§4.2 C-03, §8.3 C-03).
 *
 *  THREE PANELS, in this order: «Тримає рахунок» · «Одометр» · «Інше». The order is the argument — what stops an
 *  invoice is worked before what merely looks odd — and it is the only difference between this lane and «Зараз». */
import type { JSX } from 'react';
import { PageHead } from '../../components/office';
import { LaneList } from './lanes/LaneList';

const DESCRIPTION = 'Те, що оператор звіряє з фото. Спершу — що тримає рахунок (3 дні після перевезення, п.14.4).';

export function ReviewLanePage(): JSX.Element {
  return (
    <>
      <PageHead title="Перевірка" description={DESCRIPTION} />
      <LaneList lane="REVIEW" />
    </>
  );
}
