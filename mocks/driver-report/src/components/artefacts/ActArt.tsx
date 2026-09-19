// mocks/driver-report/src/components/artefacts/ActArt.tsx
/**
 * The discrepancy act (§6.11), A4: the sheet a consignee writes when what arrived is not what the ТТН says. §6.11
 * gives its head and its last line and elides the middle with «…», so the three mass rows are this file's own — they
 * are self-consistent (відвантажено − прийнято = розбіжність) and they belong to no seeded day: the act reaches the
 * screen through P1 flows only, never through the demo script.
 *
 * «Не згоден» is handwritten, because the point of the document is that the driver did not agree.
 */
import type { JSX } from 'react';
import { SIGNATURE, type ActPaper } from './catalogue';
import { A4_H, A4_W, BlankRules, HAND, HAND_STROKE, INK, M, RULE, Sheet } from './TtnFront';

export function ActArt({ act }: { act: ActPaper }): JSX.Element {
  return (
    <Sheet w={A4_W} h={A4_H} label={act.label}>
      <text x={A4_W / 2} y={30} textAnchor="middle" fontSize={5.4} fontWeight={700} className="font-sans" style={INK}>
        {act.title}
      </text>
      <text x={A4_W / 2} y={40} textAnchor="middle" fontSize={3.6} className="font-sans" style={INK}>{act.at}</text>
      <line x1={M} y1={46} x2={A4_W - M} y2={46} strokeWidth={0.4} style={RULE} />

      <text x={M} y={58} fontSize={3.4} className="font-sans" style={INK}>
        {`Місце складання: ${act.place}`}
      </text>

      {act.rows.map(([label, value], i) => (
        <g key={label}>
          <text x={M} y={76 + i * 10} fontSize={3.4} className="font-sans" style={INK}>{label}</text>
          <text x={A4_W - M} y={76 + i * 10} textAnchor="end" fontSize={3.6} className="font-mono" style={INK}>
            {value}
          </text>
          <line x1={M} y1={78 + i * 10} x2={A4_W - M} y2={78 + i * 10} strokeWidth={0.15} style={RULE} />
        </g>
      ))}

      <text x={M} y={122} fontSize={3.4} className="font-sans" style={INK}>{act.note}</text>
      <text x={M + 42} y={123} fontSize={5} fontStyle="italic" className="font-sans" style={HAND}
        transform={`rotate(-1 ${M + 42} 123)`}>
        {act.hand}
      </text>
      <line x1={M} y1={126} x2={A4_W - M} y2={126} strokeWidth={0.2} style={RULE} />

      <BlankRules from={136} to={232} />

      <text x={M} y={252} fontSize={3.2} className="font-sans" style={INK}>Від вантажоодержувача</text>
      <line x1={M + 60} y1={253} x2={A4_W - M} y2={253} strokeWidth={0.3} style={RULE} />
      <text x={M} y={268} fontSize={3.2} className="font-sans" style={INK}>Водій</text>
      <line x1={M + 60} y1={269} x2={A4_W - M} y2={269} strokeWidth={0.3} style={RULE} />
      <path d={SIGNATURE.driver} transform={`translate(${M + 72} 267) scale(1.5)`} strokeWidth={0.5}
        strokeLinecap="round" style={HAND_STROKE} />
    </Sheet>
  );
}
