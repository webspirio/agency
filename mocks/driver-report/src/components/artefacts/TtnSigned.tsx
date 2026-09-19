// mocks/driver-report/src/components/artefacts/TtnSigned.tsx
/**
 * «ТТН з підписом, примірник 3» (§6.11): the front of the same sheet, plus the copy number top right and the block
 * the warehouse fills in on acceptance — a printed caption, a ballpoint signature and the hour written in.
 *
 * There is NO stamp on it, and that is deliberate: the office's question about this photo is whether the consignee
 * signed, and a drawn stamp is the one mark a viewer would read as proof of something the mock cannot know.
 */
import type { JSX } from 'react';
import { SIGNATURE, type TtnPaper, type TtnPrint } from './catalogue';
import { A4_H, A4_W, HAND, HAND_STROKE, INK, M, RULE, Sheet, TtnFrontBody } from './TtnFront';

const BLOCK_Y = 205;
const BLOCK_H = 42;

export function TtnSigned({ paper, print, label }: { paper: TtnPaper; print: TtnPrint; label: string }): JSX.Element {
  return (
    <Sheet w={A4_W} h={A4_H} label={label}>
      <TtnFrontBody paper={paper} print={print} />
      <text x={A4_W - M} y={12} textAnchor="end" fontSize={3.8} fontWeight={700} className="font-sans" style={INK}>
        Примірник 3
      </text>

      <rect x={M} y={BLOCK_Y} width={A4_W - M * 2} height={BLOCK_H} style={{ fill: 'var(--doc-paper)' }} />
      <rect x={M} y={BLOCK_Y} width={A4_W - M * 2} height={BLOCK_H} fill="none" strokeWidth={0.4} style={RULE} />
      <text x={M + 4} y={BLOCK_Y + 10} fontSize={3.4} className="font-sans" style={INK}>
        {`Вантаж прийняв: ${paper.received.by}`}
      </text>
      <line x1={M + 4} y1={BLOCK_Y + 30} x2={M + 74} y2={BLOCK_Y + 30} strokeWidth={0.3} style={RULE} />
      <text x={M + 4} y={BLOCK_Y + 36} fontSize={2.8} opacity={0.7} className="font-sans" style={INK}>підпис</text>
      <path d={SIGNATURE.keeper} transform={`translate(${M + 14} ${BLOCK_Y + 27}) scale(1.7)`} strokeWidth={0.5}
        strokeLinecap="round" style={HAND_STROKE} />
      <line x1={A4_W - M - 46} y1={BLOCK_Y + 30} x2={A4_W - M - 4} y2={BLOCK_Y + 30} strokeWidth={0.3} style={RULE} />
      <text x={A4_W - M - 46} y={BLOCK_Y + 36} fontSize={2.8} opacity={0.7} className="font-sans" style={INK}>час</text>
      <text x={A4_W - M - 38} y={BLOCK_Y + 28} fontSize={5} fontStyle="italic" className="font-sans" style={HAND}
        transform={`rotate(-1 ${A4_W - M - 38} ${BLOCK_Y + 28})`}>
        {paper.received.at}
      </text>
    </Sheet>
  );
}
