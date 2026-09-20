// mocks/driver-report/src/pages/office/day/PrintSheet.tsx
/** The A4 sheet of C-09 (§4.2 C-09): 794 × 1 123 CSS px, black on white, and nothing on it that the screen invented.
 *
 *  THE SHEET IS THE VIEW'S `print_lines`, NOT A SECOND RENDERING OF THE DAY. The domain builds ten lines in one
 *  order — company, title, «від …», the run, fuel, time, documents, who it was built from, the signature line, the
 *  footer — and this component places them. If the sheet re-derived «Пробіг: 234 км» from `legs` it would be a
 *  second arithmetic that has to agree with the screen's, and the day the two disagree is the day the office stops
 *  believing either. The head, the tail and the middle are taken by POSITION FROM BOTH ENDS rather than by index, so
 *  a line added to the middle of that list lands in the fact block instead of silently replacing the signatures.
 *
 *  It is white in both themes. Paper does not have a dark mode, and a printed preview that follows the console's
 *  theme is a preview of something that will never come out of the printer (§0.1, D15).
 *
 *  `data-print-sheet` is what `@media print` in index.css keys on to drop the shadow and the fit-to-height transform.
 *
 *  «МІСЦЕ» IS `place_short`, NOT A SENTENCE TAKEN APART. §4.2 C-09 asks the «Рух і одометр» table for five columns,
 *  and the place used to live only inside `event` («На місці: Дніпро-Корм, Вільнянськ · Черга»). It is a field on
 *  `TimelineRow` since the Wave 2 round gate (this task's integrator note), so the column is the domain's answer
 *  rather than a regular expression over prose. A row that HAS no place — a road stop, a tachograph break — prints
 *  «—», which is §0.1's spelling for unknown and never «0». */
import type { JSX } from 'react';
import { fmtKm, fmtTime } from '../../../app/format';
import { KtlLockup } from '../../../components/shared';
import { OC } from '../../../copy/office';
import type { TruckDayView } from '../../../domain/dto';

export const SHEET_W = 794;
export const SHEET_H = 1123;

const MOVEMENT_HEADERS = ['Час', 'Подія', 'Місце', 'Одометр, км', 'Джерело'] as const;
const NONE = '—';

export function PrintSheet({ view }: { view: TruckDayView }): JSX.Element {
  const [companyLine = '', titleLine = '', dateLine = '', ...rest] = view.print_lines;
  const footerLine = rest.at(-1) ?? '';
  const signatureLine = rest.at(-2) ?? '';
  const builtLine = rest.at(-3) ?? '';
  const factLines = rest.slice(0, Math.max(rest.length - 3, 0));

  return (
    <div
      data-print-sheet=""
      style={{ width: `${SHEET_W}px`, minHeight: `${SHEET_H}px`, background: '#ffffff', color: 'var(--doc-print)',
        boxShadow: 'var(--elev-2)' }}
      className="flex flex-col gap-[14px] px-[56px] py-[48px] font-sans text-[14px] leading-[1.45]"
    >
      <header className="flex items-center gap-[12px] border-b border-[var(--doc-rule)] pb-[12px]">
        <KtlLockup size={18} />
        <p className="min-w-0 text-[12px] leading-[1.4]">{companyLine}</p>
      </header>

      <div className="text-center">
        <h2 className="text-[19px] leading-[1.25] font-semibold tracking-[0.01em]">{titleLine}</h2>
        <p className="mt-[4px] font-mono text-[13px]">{dateLine}</p>
      </div>

      <table className="w-full border-collapse text-left">
        <tbody>
          {view.requisites.map((f) => (
            <tr key={f.key} className="align-top">
              <th scope="row" className="w-[176px] py-[3px] pr-[12px] text-[11px] leading-[1.35] font-semibold tracking-[0.1em] uppercase">
                {f.label}
              </th>
              <td className="py-[3px] text-[13px] leading-[1.4]">
                {f.plate === null ? f.value : `${f.plate} · ${f.value}`}
                {f.note === null ? null : <span className="text-[11px]">{` (${f.note})`}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <h3 className="mb-[6px] text-[13px] leading-[1.35] font-semibold">Рух і одометр</h3>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {MOVEMENT_HEADERS.map((h) => (
                <th key={h} scope="col" className="border-b border-[var(--doc-rule)] py-[4px] pr-[8px] text-[11px] leading-[1.3] font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.timeline.map((r, i) => (
              <tr key={`${r.at}:${i}`} className="align-top">
                <td className="w-[86px] border-b border-[var(--doc-rule)] py-[4px] pr-[8px] font-mono text-[12px] whitespace-nowrap">
                  {r.to === null ? fmtTime(r.at) : `${fmtTime(r.at)}–${fmtTime(r.to)}`}
                </td>
                <td className="border-b border-[var(--doc-rule)] py-[4px] pr-[8px] text-[12px] leading-[1.4]">{r.event}</td>
                <td className="w-[150px] border-b border-[var(--doc-rule)] py-[4px] pr-[8px] text-[12px] leading-[1.4]">
                  {r.place_short ?? NONE}
                </td>
                <td className="w-[92px] border-b border-[var(--doc-rule)] py-[4px] pr-[8px] font-mono text-[12px] whitespace-nowrap">
                  {r.odometer === null ? '—' : fmtKm(r.odometer.value)}
                </td>
                <td className="w-[86px] border-b border-[var(--doc-rule)] py-[4px] text-[11px] font-semibold whitespace-nowrap">
                  {r.odometer === null ? OC.source[r.source] : OC.source[r.odometer.source]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex flex-col gap-[3px] text-[12px] leading-[1.45]">
        {factLines.map((line) => <p key={line}>{line}</p>)}
      </div>

      <p className="text-[12px] leading-[1.45]">{builtLine}</p>

      <p className="mt-auto pt-[24px] font-mono text-[12px] whitespace-pre-wrap">{signatureLine}</p>

      <p className="border-t border-[var(--doc-rule)] pt-[8px] text-[10px] leading-[1.35]">{footerLine}</p>
    </div>
  );
}
