// mocks/driver-report/src/pages/office/trucks/WhatItGives.tsx
/** The «Що це дає» Panel under «Машини» (§4.2 C-12, §8.3 C-12/C-13 #3).
 *
 *  Four sentences that turn the table above into money, hours and evidence — and every one of them carries its own
 *  `ExampleChip`, because every number in them is the agency's arithmetic over a fleet this size and not KTL's own
 *  figure. The hint says the same thing in the head («приклад — підставимо ваші цифри»); the chips say it again on
 *  each line, where a reader who skipped the head still meets it. That is §0.3, and it is why the chip is NOT hoisted
 *  into the panel head and left there.
 *
 *  The footer is the sentence that stops the page being a pitch: the two numbers KTL already has (revenue, repairs)
 *  are named as theirs, and what this product adds is named as the input to them. Copied byte for byte from §4.2.
 *
 *  `data-panel="what-it-gives"` is the handle the page test uses to count the four chips inside this block and not the
 *  ones on the example rows of the table above it. */
import type { JSX } from 'react';
import { Panel } from '../../../components/office';
import { ExampleChip } from '../../../components/shared';

/** §4.2 C-12 verbatim. `·` is U+00B7, `—` U+2014, `×` U+00D7, `≈` U+2248, `~` ASCII. */
const LINES: readonly string[] = [
  'Пальне: кожен 1 % відхилення ≈ 126 тис. грн на місяць (~1 840 машино-днів × ~75 л × 91,20 грн/л)',
  'Офіс: ~1 840 путьових на місяць більше не набираються вручну — скільки годин це зараз?',
  'Простій: години понад безкоштовні за договором, по відправниках, з доказами для акту',
  'Водій: ті самі хвилини — його години на зміні і ваш доказ перед відправником',
];
const FOOTER = 'Дохід і ремонти вже у вашій базі — ми даємо їй точні км, пальне й години по кожній машині щодня; '
  + 'рентабельність рахує BAS.';

export function WhatItGives(): JSX.Element {
  return (
    <div data-panel="what-it-gives">
      <Panel title="Що це дає" hint="приклад — підставимо ваші цифри" footer={FOOTER}>
        <ul className="flex flex-col gap-[10px] px-[20px] py-[16px]">
          {LINES.map((line) => (
            <li key={line} className="flex flex-wrap items-baseline gap-[8px] text-[14px] leading-[1.5] text-ink">
              <span>{line}</span>
              <ExampleChip />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
