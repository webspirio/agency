// mocks/driver-report/src/components/artefacts/WeighTicket.tsx
/**
 * The weighbridge slip (§6.11), 100 × 160: the small printed ticket a loading point hands over with the load. Its
 * three masses are printed by the scales, so they are monospaced and right-aligned — брутто minus тара is нетто, and
 * that is the number the ТТН's reverse repeats in tonnes.
 */
import type { JSX } from 'react';
import type { TicketPaper } from './catalogue';
import { SIGNATURE } from './catalogue';
import { HAND_STROKE, INK, RULE, Sheet } from './TtnFront';

const W = 100;
const H = 160;
const CX = W / 2;
const M = 10;

export function WeighTicket({ ticket }: { ticket: TicketPaper }): JSX.Element {
  return (
    <Sheet w={W} h={H} label={ticket.label}>
      <text x={CX} y={18} textAnchor="middle" fontSize={5} fontWeight={700} className="font-sans" style={INK}>
        {ticket.title}
      </text>
      <text x={CX} y={27} textAnchor="middle" fontSize={3.4} className="font-sans" style={INK}>{ticket.owner}</text>
      <text x={CX} y={34} textAnchor="middle" fontSize={3.4} className="font-mono" style={INK}>{ticket.at}</text>
      <line x1={M} y1={40} x2={W - M} y2={40} strokeWidth={0.4} style={RULE} />

      <text x={CX} y={52} textAnchor="middle" fontSize={4} className="font-mono" style={INK}>{ticket.plates}</text>

      {ticket.rows.map(([label, value], i) => (
        <g key={label}>
          <text x={M} y={66 + i * 11} fontSize={3.6} className="font-sans" style={INK}>{label}</text>
          <text x={W - M} y={66 + i * 11} textAnchor="end" fontSize={3.8} className="font-mono" style={INK}>
            {value}
          </text>
          <line x1={M} y1={68 + i * 11} x2={W - M} y2={68 + i * 11} strokeWidth={0.15} style={RULE} />
        </g>
      ))}

      <text x={CX} y={104} textAnchor="middle" fontSize={3.2} className="font-sans" style={INK}>{ticket.scales}</text>

      <text x={M} y={128} fontSize={3} className="font-sans" style={INK}>Ваговик</text>
      <line x1={M + 22} y1={129} x2={W - M} y2={129} strokeWidth={0.3} style={RULE} />
      <path d={SIGNATURE.short} transform={`translate(${M + 30} ${127}) scale(1.5)`} strokeWidth={0.5}
        strokeLinecap="round" style={HAND_STROKE} />
      <text x={M} y={144} fontSize={2.6} opacity={0.65} className="font-sans" style={INK}>
        Талон дійсний з ТТН
      </text>
    </Sheet>
  );
}
