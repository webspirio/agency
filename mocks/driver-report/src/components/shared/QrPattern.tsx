// mocks/driver-report/src/components/shared/QrPattern.tsx
/** A drawn QR-like pattern (§6.11, D9) — NOT an encoding. No encoder is installed and none may be added; every decode the
 *  mock shows is simulated and carries «імітація».
 *
 *  The drawing is a version-3 symbol: 29 × 29 modules inside a 4-module quiet zone, with the three finder patterns and
 *  their separators, both timing patterns, the version-3 alignment pattern and the fixed dark module where a real
 *  symbol has them. Every other module is a bit from xorshift32 seeded with FNV-1a over the text's UTF-8 bytes, so the
 *  same text always draws the same pattern and a different text a different one. Those bits are not Reed–Solomon
 *  codewords, so a scanner finds the finders and fails to decode.
 *
 *  All dark modules are ONE `<path>` (horizontal runs, one subpath each), over a paper-coloured square: a QR is a
 *  printed object, dark on light in both themes. Coordinates are whole modules, so no rounding is ever needed. */
import { useMemo, type JSX } from 'react';

const MODULES = 29;
const QUIET = 4;
const SIDE = MODULES + QUIET + QUIET;
/** Top-left corners of the three 7 × 7 finder patterns. */
const FINDERS: readonly (readonly [number, number])[] = [[0, 0], [0, MODULES - 7], [MODULES - 7, 0]];
/** Centre of the version-3 alignment pattern. */
const ALIGN = 22;

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function xorshift32(seed: number): () => number {
  let x = seed === 0 ? 0x9e3779b9 : seed;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

const inside = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;

/** The function patterns: `true` dark, `false` light, `null` a data module. */
function fixedModule(r: number, c: number): boolean | null {
  for (const [r0, c0] of FINDERS) {
    const dr = r - r0;
    const dc = c - c0;
    // The finder (7 × 7) and its one-module light separator (the 8 × 8 box around it, clipped by the symbol's edge).
    if (inside(dr, -1, 7) && inside(dc, -1, 7)) {
      if (!inside(dr, 0, 6) || !inside(dc, 0, 6)) return false;
      if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
      return inside(dr, 2, 4) && inside(dc, 2, 4);
    }
  }
  const ar = r - ALIGN;
  const ac = c - ALIGN;
  if (inside(ar, -2, 2) && inside(ac, -2, 2)) {
    return ar === -2 || ar === 2 || ac === -2 || ac === 2 || (ar === 0 && ac === 0);
  }
  if (r === 6) return c % 2 === 0;
  if (c === 6) return r % 2 === 0;
  if (r === MODULES - 8 && c === 8) return true;
  return null;
}

function qrPath(text: string): string {
  const next = xorshift32(fnv1a(text));
  const parts: string[] = [];
  for (let r = 0; r < MODULES; r += 1) {
    let run = 0;
    for (let c = 0; c <= MODULES; c += 1) {
      const dark = c < MODULES && (fixedModule(r, c) ?? (next() & 0x100) !== 0);
      if (dark) {
        run += 1;
      } else if (run > 0) {
        parts.push(`M${c - run + QUIET} ${r + QUIET}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }
  return parts.join('');
}

export function QrPattern({ text, size }: { text: string; size: number }): JSX.Element {
  const d = useMemo(() => qrPath(text), [text]);
  return (
    <svg
      viewBox={`0 0 ${SIDE} ${SIDE}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR-код (імітація)"
      shapeRendering="crispEdges"
      className="block shrink-0"
    >
      <rect width={SIDE} height={SIDE} style={{ fill: 'var(--doc-paper)' }} />
      <path d={d} style={{ fill: 'var(--doc-print)' }} />
    </svg>
  );
}
