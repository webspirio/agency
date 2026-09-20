// mocks/driver-report/src/components/artefacts/TtnFront.tsx
/**
 * The front of a ТТН (§6.11), A4 at 210 × 297 — one SVG user unit per millimetre, so every measurement in this file
 * reads as the millimetre it is on the paper.
 *
 * The printed half comes from `TTN_CATALOGUE` through `catalogue.ts`; what the form says around it — the carrier, the
 * vehicle, the two points — is the paper's own. The driver's signature is the one ballpoint mark on this side: a
 * `--doc-ballpoint` path, because a signature is a shape and not a character.
 *
 * The sheet, the ruled line and the body are exported: «ТТН з підписом, примірник 3» IS this front plus two blocks,
 * and the reverse is the same paper. Nothing else imports them.
 */
import type { JSX, ReactNode } from 'react';
import type { TtnPaper, TtnPrint } from './catalogue';
import { FIT_SCALE, SIGNATURE } from './catalogue';

export const A4_W = 210;
export const A4_H = 297;
/** The form's margin, and therefore the x of every caption on it. */
export const M = 14;

export const INK = { fill: 'var(--doc-print)' } as const;
export const RULE = { stroke: 'var(--doc-rule)' } as const;
export const HAND = { fill: 'var(--doc-ballpoint)' } as const;
export const HAND_STROKE = { stroke: 'var(--doc-ballpoint)', fill: 'none' } as const;

/** Genitive month names: a ТТН writes its date as «“21” вересня 2026 р.», and `TTN_CATALOGUE` holds «21.09.2026». */
const MONTHS: Record<string, string> = {
  '01': 'січня', '02': 'лютого', '03': 'березня', '04': 'квітня', '05': 'травня', '06': 'червня',
  '07': 'липня', '08': 'серпня', '09': 'вересня', '10': 'жовтня', '11': 'листопада', '12': 'грудня',
};

/** A date this function cannot read is printed as it came, never as a guess. */
export function longDate(dmy: string): string {
  const [day = '', month = '', year = ''] = dmy.split('.');
  const named = MONTHS[month];
  return named === undefined ? dmy : `“${day}” ${named} ${year} р.`;
}

/** The paper every document in this kit is drawn on: one rect, one accessible name, one fit rule. */
export function Sheet({ w, h, label, thermal = false, children }: {
  w: number; h: number; label: string; thermal?: boolean; children: ReactNode;
}): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * FIT_SCALE}
      height={h * FIT_SCALE}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className="block h-auto w-auto max-h-full max-w-full select-none"
    >
      <rect width={w} height={h} style={{ fill: thermal ? 'var(--doc-thermal)' : 'var(--doc-paper)' }} />
      {children}
    </svg>
  );
}

/** One ruled caption line of a form. An empty value leaves the rule bare, which is what a blank form looks like. */
export function Ln({ y, caption, value, size = 3.4 }: {
  y: number; caption: string; value: string; size?: number;
}): JSX.Element {
  return (
    <>
      <text x={M} y={y} fontSize={size} className="font-sans" style={INK}>
        {value === '' ? `${caption}:` : `${caption}: ${value}`}
      </text>
      <line x1={M} y1={y + 1.8} x2={A4_W - M} y2={y + 1.8} strokeWidth={0.2} style={RULE} />
    </>
  );
}

/** The faint remainder of a printed form: the rules that carry nothing on this copy. */
export function BlankRules({ from, to }: { from: number; to: number }): JSX.Element {
  const rows = Math.max(0, Math.round((to - from) / 8));
  return (
    <g strokeWidth={0.15} opacity={0.6} style={RULE}>
      {Array.from({ length: rows }, (_, i) => (
        <line key={i} x1={M} y1={from + i * 8} x2={A4_W - M} y2={from + i * 8} />
      ))}
    </g>
  );
}

/** Everything the front and «примірник 3» have in common — the whole sheet except the acceptance block. */
export function TtnFrontBody({ paper, print }: { paper: TtnPaper; print: TtnPrint }): JSX.Element {
  const cargo = print.cargo === '' ? '' : `${print.cargo.split(', ').join(' · ')} · ${print.mass} т`;
  return (
    <>
      <text x={A4_W / 2} y={20} textAnchor="middle" fontSize={5.4} fontWeight={700} className="font-sans" style={INK}>
        {print.no === '' ? 'ТОВАРНО-ТРАНСПОРТНА НАКЛАДНА' : `ТОВАРНО-ТРАНСПОРТНА НАКЛАДНА № ${print.no}`}
      </text>
      <text x={A4_W / 2} y={28} textAnchor="middle" fontSize={3.6} className="font-sans" style={INK}>
        {longDate(print.date)}
      </text>
      <line x1={M} y1={33} x2={A4_W - M} y2={33} strokeWidth={0.4} style={RULE} />

      <Ln y={44} caption="Автомобільний перевізник" value={paper.carrier} />
      <Ln y={52} caption="Автомобіль" value={paper.vehicle} />
      <Ln y={60} caption="Причіп/напівпричіп" value={paper.trailer} />
      <Ln y={68} caption="Водій" value={paper.driver} />
      <Ln y={76} caption="Замовник / Вантажовідправник" value={party(print.shipper)} />
      <Ln y={84} caption="Вантажоодержувач" value={party(print.consignee)} />
      <Ln y={92} caption="Пункт навантаження" value={paper.loading} />
      <Ln y={100} caption="Пункт розвантаження" value={paper.unloading} />

      <rect x={M} y={112} width={A4_W - M * 2} height={34} fill="none" strokeWidth={0.4} style={RULE} />
      <rect x={M} y={112} width={A4_W - M * 2} height={9} fill="rgb(0 0 0 / 0.04)" />
      <line x1={M} y1={121} x2={A4_W - M} y2={121} strokeWidth={0.3} style={RULE} />
      <line x1={M} y1={133} x2={A4_W - M} y2={133} strokeWidth={0.2} style={RULE} />
      <text x={A4_W / 2} y={118} textAnchor="middle" fontSize={3.8} fontWeight={700} className="font-sans" style={INK}>
        Відомості про вантаж
      </text>
      <text x={M + 4} y={129} fontSize={3.6} className="font-sans" style={INK}>{cargo}</text>
      <text x={M + 4} y={141} fontSize={3.2} className="font-sans" style={INK}>
        {`Відсіки: ${print.compartments ?? '—'}`}
      </text>

      <text x={M} y={156} fontSize={3.4} className="font-sans" style={INK}>
        {`Пломби: ${print.seals === '' ? '—' : print.seals}`}
      </text>

      <text x={M} y={176} fontSize={3.2} className="font-sans" style={INK}>Відпустив вантаж (посада, підпис)</text>
      <line x1={M + 72} y1={177} x2={A4_W - M} y2={177} strokeWidth={0.3} style={RULE} />
      <text x={M} y={192} fontSize={3.2} className="font-sans" style={INK}>Прийняв до перевезення водій (підпис)</text>
      <line x1={M + 72} y1={193} x2={A4_W - M} y2={193} strokeWidth={0.3} style={RULE} />
      <path d={SIGNATURE.driver} transform="translate(108 191) scale(1.5)" strokeWidth={0.5} strokeLinecap="round"
        style={HAND_STROKE} />

      <BlankRules from={208} to={272} />
      <text x={M} y={286} fontSize={2.8} opacity={0.65} className="font-sans" style={INK}>Форма № 1-ТН</text>
    </>
  );
}

/** «ТОВ «Дніпро-Корм» · ЄДРПОУ 31785062» is how the office writes a party; a ТТН prints the code after a comma. */
function party(text: string): string {
  return text.split(' · ЄДРПОУ ').join(', ');
}

export function TtnFront({ paper, print, label }: { paper: TtnPaper; print: TtnPrint; label: string }): JSX.Element {
  return (
    <Sheet w={A4_W} h={A4_H} label={label}>
      <TtnFrontBody paper={paper} print={print} />
    </Sheet>
  );
}
