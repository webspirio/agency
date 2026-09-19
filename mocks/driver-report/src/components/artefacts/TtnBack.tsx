// mocks/driver-report/src/components/artefacts/TtnBack.tsx
/**
 * The reverse of a ТТН (§6.11): «ВАНТАЖНО-РОЗВАНТАЖУВАЛЬНІ ОПЕРАЦІЇ», six columns, and one row the loading point
 * filled in by hand — `--doc-ballpoint`, oblique, and the whole row tipped −1°, because a hand does not write along
 * the rule.
 *
 * `:soft` is the photo the office cannot read (§8.3 C-04 #5). The blur is a `feGaussianBlur` of 1.4 on the ARRIVAL
 * cell and on nothing else: the rest of the page stays sharp, which is exactly what makes the page worth asking the
 * driver about. The cell carries `data-cell="arrival"` so a screen test can point at the thing that is unreadable.
 */
import { useId, type JSX } from 'react';
import type { TtnPaper, TtnPrint } from './catalogue';
import { SIGNATURE } from './catalogue';
import { A4_H, A4_W, BlankRules, HAND, HAND_STROKE, INK, M, RULE, Sheet } from './TtnFront';

/** Column edges, left to right, in millimetres. */
const EDGES = [14, 62, 92, 118, 144, 170, 196] as const;
const HEADERS = ['Операція', 'Маса брутто, т', 'Прибуття', 'Вибуття', 'Час простою', 'Підпис'] as const;
const HEAD_Y = 44;
const HEAD_H = 11;
const ROW_H = 18;

const centre = (i: number): number => ((EDGES[i] ?? 0) + (EDGES[i + 1] ?? 0)) / 2;

export function TtnBack({ paper, print, label, soft }: {
  paper: TtnPaper; print: TtnPrint; label: string; soft: boolean;
}): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const blur = `${uid}-soft`;
  const ops = paper.ops ?? { gross: '', arrival: '', departure: '', idle: '' };
  const bottom = HEAD_Y + HEAD_H + ROW_H * 2;
  const handY = HEAD_Y + HEAD_H + 11;
  return (
    <Sheet w={A4_W} h={A4_H} label={label}>
      {soft ? (
        <defs>
          <filter id={blur} x="-50%" y="-80%" width="200%" height="260%">
            <feGaussianBlur stdDeviation={1.4} />
          </filter>
        </defs>
      ) : null}

      <text x={A4_W / 2} y={24} textAnchor="middle" fontSize={5} fontWeight={700} className="font-sans" style={INK}>
        ВАНТАЖНО-РОЗВАНТАЖУВАЛЬНІ ОПЕРАЦІЇ
      </text>
      <text x={A4_W / 2} y={32} textAnchor="middle" fontSize={3.2} opacity={0.75} className="font-sans" style={INK}>
        {print.no === '' ? 'до товарно-транспортної накладної' : `до товарно-транспортної накладної № ${print.no}`}
      </text>

      {/* The one zone C-04 #4 zooms when the operator focuses «Прибуття»: the whole operations table. */}
      <g data-zone="ops-table">
        <rect x={M} y={HEAD_Y} width={A4_W - M * 2} height={HEAD_H} fill="rgb(0 0 0 / 0.04)" />
        <rect x={M} y={HEAD_Y} width={A4_W - M * 2} height={HEAD_H + ROW_H * 2} fill="none" strokeWidth={0.4}
          style={RULE} />
        <g strokeWidth={0.3} style={RULE}>
          <line x1={M} y1={HEAD_Y + HEAD_H} x2={A4_W - M} y2={HEAD_Y + HEAD_H} />
          <line x1={M} y1={HEAD_Y + HEAD_H + ROW_H} x2={A4_W - M} y2={HEAD_Y + HEAD_H + ROW_H} />
          {EDGES.slice(1, -1).map((x) => <line key={x} x1={x} y1={HEAD_Y} x2={x} y2={bottom} />)}
        </g>
        {HEADERS.map((head, i) => (
          <text key={head} x={centre(i)} y={HEAD_Y + 7} textAnchor="middle" fontSize={2.8} className="font-sans"
            style={INK}>
            {head}
          </text>
        ))}

        <g className="font-sans" fontStyle="italic" fontSize={3.8} textAnchor="middle" style={HAND}
          transform={`rotate(-1 ${M} ${handY})`}>
          <text x={centre(0)} y={handY}>Навантаження</text>
          <text x={centre(1)} y={handY}>{ops.gross}</text>
          <text x={centre(2)} y={handY} data-cell="arrival" filter={soft ? `url(#${blur})` : undefined}>
            {ops.arrival}
          </text>
          <text x={centre(3)} y={handY}>{ops.departure}</text>
          <text x={centre(4)} y={handY}>{ops.idle}</text>
          <path d={SIGNATURE.short} transform={`translate(${centre(5) - 9} ${handY - 2}) scale(1.6)`} strokeWidth={0.5}
            strokeLinecap="round" style={HAND_STROKE} />
        </g>
      </g>

      <text x={M} y={bottom + 14} fontSize={3.2} className="font-sans" style={INK}>Особливі відмітки</text>
      <BlankRules from={bottom + 22} to={274} />
    </Sheet>
  );
}
