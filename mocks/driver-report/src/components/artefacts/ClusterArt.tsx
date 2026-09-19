// mocks/driver-report/src/components/artefacts/ClusterArt.tsx
/**
 * The Scania cluster of §6.11, 220 × 100: a `--cluster-bg` bezel, a speedometer and a tachometer with ticks and
 * needles at rest (the driver photographs it standing), the centre display with the odometer, «TRIP 36.4 km» and a
 * clock, and a ten-segment fuel bar with six lit between «E» and «F».
 *
 * `glare` is the white diagonal patch of a phone photographed against a windscreen — §6.11's 55 %. `dark` is the same
 * cluster in a dark cab: the dials go down, the display and the fuel bar do not, because that is what a night photo
 * of a lit instrument panel looks like.
 *
 * Geometry is arithmetic on COORDINATES — permitted in `src/components/**` (§0.1) — and every coordinate is rounded
 * with `Math.round`, never coerced: no `Number()`, no `+x`, no `.toFixed` anywhere in this kit.
 */
import { useId, type JSX } from 'react';

const W = 220;
const H = 100;
const DIAL_R = 28;
const LEFT_CX = 44;
const RIGHT_CX = 176;
const DIAL_CY = 48;
/** Degrees clockwise from +x with y down: a gauge starts at the lower left and sweeps 270° to the lower right. */
const START = 135;
const SWEEP = 270;
const TICKS = 10;
/** Needles at rest: the speedometer at zero, the tachometer at idle. */
const IDLE_TICK = 1.5;

const FUEL_SEGMENTS = 10;
const FUEL_LIT = 6;
const BAR_X = 84;
const BAR_Y = 78;
const BAR_W = 52;
const BAR_H = 6;
const BAR_GAP = 1;
const SEG_W = Math.round(((BAR_W - (FUEL_SEGMENTS - 1) * BAR_GAP) / FUEL_SEGMENTS) * 10) / 10;

const DISPLAY_X = 78;
const DISPLAY_Y = 24;
const DISPLAY_W = 64;
const DISPLAY_H = 48;
const DISPLAY_CX = DISPLAY_X + DISPLAY_W / 2;

/** §6.11 pins the display's own black, which is darker than the bezel and has no token of its own. */
const DISPLAY_INK = '#121a1e';
/** The trip is the spec's literal. The CLOCK is only the default: `catalogue.ts` reads the hour off the script entry
 *  that takes the photograph, so a 15:16 щиток does not open in the office reading a morning panel. */
const TRIP = 'TRIP 36.4 km';
const CLOCK = '08:57';

const round1 = (n: number): number => Math.round(n * 10) / 10;

function polar(cx: number, r: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  return { x: round1(cx + r * Math.cos(rad)), y: round1(DIAL_CY + r * Math.sin(rad)) };
}

const tickAngle = (i: number): number => START + (SWEEP * i) / TICKS;

function Dial({ cx, needleTick, caption }: { cx: number; needleTick: number; caption: string }): JSX.Element {
  const tail = polar(cx, 3.5, tickAngle(needleTick) + 180);
  const head = polar(cx, DIAL_R - 8, tickAngle(needleTick));
  return (
    <g>
      <circle cx={cx} cy={DIAL_CY} r={DIAL_R} fill="rgb(0 0 0 / 0.35)" />
      <circle cx={cx} cy={DIAL_CY} r={DIAL_R} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth={1} />
      {Array.from({ length: TICKS + 1 }, (_, i) => {
        const major = i % 2 === 0;
        const outer = polar(cx, DIAL_R - 2.5, tickAngle(i));
        const inner = polar(cx, DIAL_R - (major ? 7 : 5), tickAngle(i));
        return (
          <line
            key={i}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            stroke="rgb(255 255 255 / 0.55)"
            strokeWidth={major ? 1 : 0.6}
            strokeLinecap="round"
          />
        );
      })}
      <text
        x={cx}
        y={DIAL_CY + 14}
        textAnchor="middle"
        fontSize={3.4}
        fill="rgb(255 255 255 / 0.45)"
        className="font-sans"
      >
        {caption}
      </text>
      <line x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} strokeWidth={1.6} strokeLinecap="round"
        style={{ stroke: 'var(--cluster-amber)' }} />
      <circle cx={cx} cy={DIAL_CY} r={2.2} style={{ fill: 'var(--cluster-amber)' }} />
    </g>
  );
}

export function ClusterArt({ digits, glare = false, dark = false, time = CLOCK }: {
  digits: string; glare?: boolean; dark?: boolean; time?: string;
}): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Панель приладів, одометр ${digits}`}
      className="block h-full max-h-full w-auto max-w-full select-none"
    >
      <rect width={W} height={H} rx={9} style={{ fill: 'var(--cluster-bg)' }} />
      <rect x={2.5} y={2.5} width={W - 5} height={H - 5} rx={7} fill="none" stroke="rgb(255 255 255 / 0.07)"
        strokeWidth={1} />
      <g opacity={dark ? 0.45 : 1}>
        <Dial cx={LEFT_CX} needleTick={0} caption="km/h" />
        <Dial cx={RIGHT_CX} needleTick={IDLE_TICK} caption="rpm" />
      </g>
      {dark ? <rect width={W} height={H} rx={9} fill="rgb(0 0 0 / 0.35)" /> : null}

      <rect x={DISPLAY_X} y={DISPLAY_Y} width={DISPLAY_W} height={DISPLAY_H} rx={2.5} fill={DISPLAY_INK} />
      <text x={DISPLAY_CX} y={DISPLAY_Y + 10} textAnchor="middle" fontSize={5} opacity={0.72}
        className="font-mono" style={{ fill: 'var(--cluster-lcd)' }}>
        {time}
      </text>
      <text x={DISPLAY_CX} y={DISPLAY_Y + 26} textAnchor="middle" fontSize={9.5} letterSpacing={0.4}
        className="font-mono" style={{ fill: 'var(--cluster-lcd)' }}>
        {`${digits} km`}
      </text>
      <text x={DISPLAY_CX} y={DISPLAY_Y + 39} textAnchor="middle" fontSize={5} opacity={0.8}
        className="font-mono" style={{ fill: 'var(--cluster-lcd)' }}>
        {TRIP}
      </text>

      <text x={BAR_X - 4} y={BAR_Y + BAR_H - 1} textAnchor="end" fontSize={4.4} className="font-sans"
        style={{ fill: 'var(--cluster-lcd)' }}>
        E
      </text>
      <text x={BAR_X + BAR_W + 4} y={BAR_Y + BAR_H - 1} textAnchor="start" fontSize={4.4} className="font-sans"
        style={{ fill: 'var(--cluster-lcd)' }}>
        F
      </text>
      {Array.from({ length: FUEL_SEGMENTS }, (_, i) => (
        <rect
          key={i}
          x={round1(BAR_X + i * (SEG_W + BAR_GAP))}
          y={BAR_Y}
          width={SEG_W}
          height={BAR_H}
          rx={0.8}
          opacity={i < FUEL_LIT ? 1 : 0.18}
          style={{ fill: i < FUEL_LIT ? 'var(--cluster-amber)' : 'var(--cluster-lcd)' }}
        />
      ))}

      {glare ? (
        <>
          <defs>
            <linearGradient id={`${uid}-glare`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0} />
              <stop offset="50%" stopColor="#ffffff" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`M-10 ${H} L78 -10 L124 -10 L36 ${H} Z`} fill={`url(#${uid}-glare)`} opacity={0.55} />
        </>
      ) : null}
    </svg>
  );
}
