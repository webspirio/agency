// mocks/driver-report/src/components/artefacts/ReceiptArt.tsx
/**
 * A fuel receipt (§6.11), 80 × 220 on `--doc-thermal`: a strip of thermal paper, monospaced the way an РРО prints,
 * every line at 85 % so the ink reads as heat rather than toner.
 *
 * The QR is `QrPattern` — drawn, never encoded, and it says «імітація» in its own accessible name (D9). A line the
 * receipt does not have is not drawn: WOG's slip carries no ФН РРО and no ПДВ line, which is why the office cannot
 * key its fiscal number in from the photo.
 */
import type { JSX } from 'react';
import { QrPattern } from '../shared';
import type { ReceiptPaper } from './catalogue';
import { INK, RULE, Sheet } from './TtnFront';

const W = 80;
const H = 220;
const CX = W / 2;
const QR_SIZE = 32;

function Row({ y, text, size = 3, bold = false }: {
  y: number; text: string | null; size?: number; bold?: boolean;
}): JSX.Element | null {
  if (text === null || text === '') return null;
  return (
    <text x={CX} y={y} textAnchor="middle" fontSize={size} fontWeight={bold ? 700 : 400} className="font-mono"
      style={INK}>
      {text}
    </text>
  );
}

function Cut({ y }: { y: number }): JSX.Element {
  return <line x1={6} y1={y} x2={W - 6} y2={y} strokeWidth={0.3} strokeDasharray="1.5 1.5" style={RULE} />;
}

export function ReceiptArt({ receipt }: { receipt: ReceiptPaper }): JSX.Element {
  return (
    <Sheet w={W} h={H} label={receipt.label} thermal>
      <g opacity={0.85}>
        <Row y={16} text={receipt.brand} size={4.6} bold />
        <Row y={24} text={receipt.station} />
        <Row y={31} text={receipt.rro} />
        <Cut y={38} />
        <Row y={48} text={receipt.no} size={4} bold />
        <Cut y={54} />
        <Row y={66} text={receipt.item} size={2.8} />
        <Row y={78} text={receipt.pay} />
        <Cut y={86} />
        <Row y={98} text={receipt.sum} size={4.2} bold />
        <Row y={108} text={receipt.vat} />
        <Cut y={116} />
        <Row y={126} text={receipt.at} size={3.2} />
        <g transform={`translate(${(W - QR_SIZE) / 2} 138)`}>
          <QrPattern text={receipt.qr} size={QR_SIZE} />
        </g>
        <Row y={186} text="ФІСКАЛЬНИЙ ЧЕК" size={3.4} bold />
      </g>
    </Sheet>
  );
}
