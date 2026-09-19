// mocks/driver-report/src/components/theme-tokens.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compile } from 'tailwindcss';

const css = readFileSync(`${import.meta.dirname}/../index.css`, 'utf8');
const html = readFileSync(`${import.meta.dirname}/../../index.html`, 'utf8');

/** HSL hue (0–360) and saturation (0–1) of '#rrggbb'. */
function hsl(hex: string): { hue: number; sat: number } {
  const HEX = '0123456789abcdef';
  const byte = (pair: string): number => HEX.indexOf(pair[0]!) * 16 + HEX.indexOf(pair[1]!);   // no parseInt: banned everywhere
  const [r, g, b] = [0, 2, 4].map((i) => byte(hex.slice(i, i + 2).toLowerCase()) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  const l = (max + min) / 2;
  const sat = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { hue: (hue + 360) % 360, sat };
}

describe('index.css (§6.2)', () => {
  it('keeps the scaffold header, imports and @source line byte-identical', () => {
    const head = css.split('\n').slice(0, 27).join('\n');
    expect(head.startsWith('/* @scaffold-owned — the theme contract')).toBe(true);
    expect(head.endsWith('@import "tailwindcss";\n@import "tw-animate-css";\n@source "../../../packages/kit/src/**/*.{ts,tsx}";')).toBe(true);
  });

  it('keeps every kit token name and adds the product tokens', () => {
    const names = ['--background', '--foreground', '--surface', '--card', '--card-foreground', '--popover',
      '--primary', '--primary-foreground', '--brand', '--brand-foreground', '--secondary', '--muted',
      '--muted-foreground', '--muted2', '--accent', '--accent-foreground', '--destructive', '--success',
      '--success-foreground', '--border', '--line2', '--input', '--ring', '--leaf', '--amber', '--sky',
      '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--radius', '--app-content-max-h',
      '--paper', '--label', '--bench', '--line-strong', '--ink', '--text-2', '--accent-ink', '--hold', '--reject',
      '--cam-bg', '--cam-accent', '--lock-bg', '--stage-bar', '--sidebar-bg', '--plate-band', '--doc-paper',
      '--cluster-lcd', '--seat'];
    for (const n of names) expect(css, n).toContain(`${n}:`);
  });

  it('contains no green: no hex with hue 90°–170° and saturation above 15 % (§8.6 #5)', () => {
    const greens = [...css.matchAll(/#([0-9a-fA-F]{6})\b/g)]
      .map((m) => m[1]!)
      .filter((h) => { const { hue, sat } = hsl(h); return hue >= 90 && hue <= 170 && sat > 0.15; });
    expect(greens).toEqual([]);
  });

  it('carries the D17 road-blue accent, not KTL navy', () => {
    for (const d of ['--accent-ink: #0f4a70;', '--accent-wash: #e7eff5;', '--accent-lift: #74bae3;', '--road: #12557f;', '--cam-accent: #74bae3;', '--stage-accent: #74bae3;']) {
      expect(css).toContain(d);
    }
    expect(css.toLowerCase()).not.toMatch(/#274484|#9db4ec|#e9edf6/);
    expect(html.toLowerCase()).not.toMatch(/274484|9db4ec/);
  });

  it('defines the stem and the reduced-motion switch', () => {
    expect(css).toContain('@keyframes cl-stem');
    expect(css).toContain('.cl-stem  { height: 2px; background: var(--accent-ink)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

/**
 * Compile index.css with the Tailwind this mock builds with, generating only `candidates`. The imports are
 * resolved against the mock's own node_modules, exactly the packages `@tailwindcss/vite` would load.
 */
async function tailwind(candidates: string[]): Promise<string> {
  const nm = `${import.meta.dirname}/../../node_modules`;
  const compiler = await compile(css, {
    base: `${import.meta.dirname}/..`,
    loadStylesheet: async (id, base) => {
      const path = id === 'tailwindcss' ? `${nm}/tailwindcss/index.css`
        : id === 'tw-animate-css' ? `${nm}/tw-animate-css/dist/tw-animate.css`
        : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  return compiler.build(candidates);
}

/**
 * The value `prop` ends up with on an element carrying only `.<cls>`: every rule for that selector in emitted
 * order, `!important` beating normal, and the later declaration winning inside each. `undefined` = never set.
 */
function winning(out: string, cls: string, prop: string): string | undefined {
  const decls = [...out.matchAll(new RegExp(`\\.${cls.replace(/-/g, '\\-')}\\s*\\{([^}]*)\\}`, 'g'))]
    .flatMap((m) => m[1]!.split(';'))
    .map((d) => d.trim())
    .filter((d) => d.startsWith(`${prop}:`))
    .map((d) => d.slice(prop.length + 1).trim());
  const important = decls.filter((v) => v.endsWith('!important'));
  return (important.length > 0 ? important : decls).at(-1)?.replace(/\s*!important$/, '');
}

describe('index.css compiled by Tailwind (§3.1 targets)', () => {
  it('lets the two-line primary GROW: h-tap-xl is a 4.5rem minimum, never a fixed height', async () => {
    // Measured on 4.3.3: `@utility h-tap-xl { min-height }` is MERGED with the built-in `h-*` (backed by
    // --spacing-tap-xl), so the class also carried `height: var(--spacing-tap-xl)` — a place line that wraps
    // under «Текст 130 %» at 360 px would overflow a box that cannot grow.
    const out = await tailwind(['h-tap-xl', 'min-h-tap-xl']);
    expect(winning(out, 'h-tap-xl', 'min-height')).toBe('var(--spacing-tap-xl)');
    expect(winning(out, 'h-tap-xl', 'height') ?? 'auto').toBe('auto');
    expect(winning(out, 'min-h-tap-xl', 'min-height')).toBe('var(--spacing-tap-xl)');
    expect(winning(out, 'min-h-tap-xl', 'height')).toBeUndefined();
  });

  it('keeps the one-line primary and the secondary targets at their §3.1 sizes', async () => {
    const out = await tailwind(['h-tap', 'min-h-tap', 'h-tap-lg', 'size-shutter']);
    expect(winning(out, 'h-tap', 'height')).toBe('var(--spacing-tap)');
    expect(winning(out, 'min-h-tap', 'min-height')).toBe('var(--spacing-tap)');
    expect(winning(out, 'h-tap-lg', 'height')).toBe('var(--spacing-tap-lg)');
    expect(winning(out, 'size-shutter', 'width')).toBe('var(--spacing-shutter)');
    expect(winning(out, 'size-shutter', 'height')).toBe('var(--spacing-shutter)');
  });

  it('backs the console scrim with a token, so `bg-scrim` is not a class that emits nothing (§4.2 C-05)', async () => {
    // The header above this file's twin says no component anywhere reads a literal colour. The correction dialog's
    // overlay is §4.2 C-05's `rgb(16 22 26 / .45)`, which had no token — and a `bg-*` whose token is missing is the
    // silent failure the @theme block exists to prevent: the class name is scanned, nothing is emitted, and the
    // overlay renders fully transparent with no error anywhere.
    expect(css).toContain('--scrim: rgb(16 22 26 / 0.45);');
    // `@theme inline` substitutes the token's VALUE, so the utility names `--scrim` and not `--color-scrim` — which
    // is what makes it follow `.dark`. Drop `--color-scrim` from the @theme block and this reads `undefined`.
    const out = await tailwind(['bg-scrim']);
    expect(winning(out, 'bg-scrim', 'background-color')).toBe('var(--scrim)');
  });
});

describe('index.html (§6.3)', () => {
  it('declares Ukrainian, no translation, text scaling and the product title', () => {
    expect(html).toContain('<html lang="uk" translate="no" data-theme-key="driver-report:theme">');
    expect(html).toContain('<meta name="google" content="notranslate" />');
    expect(html).toContain('content="width=device-width, initial-scale=1, viewport-fit=cover"');
    expect(html).toContain('<meta name="text-scale" content="scale" />');
    expect(html).toContain('<meta name="theme-color" content="#eef0f1" />');
    expect(html).toContain('<title>Звіт водія</title>');
    expect(html).toMatch(/rel="preload" as="font" type="font\/woff2" crossorigin href="\/src\/assets\/fonts\/onest-cyrillic\.woff2"/);
  });

  it('paints 0 from a per-profile key and never from the OS (D15)', () => {
    expect(html).toContain("'driver-report:theme:' + profile");
    expect(html).not.toContain('prefers-color-scheme');
  });
});

/**
 * §8.5 asks for «a 3 px `--ring` outline, offset 2 px, on every focusable element», and index.css gives it to the
 * whole tree in one `@layer base` rule. Tailwind's `outline-none` is a UTILITY, and utilities are emitted after base:
 * measured in this mock's own dist stylesheet, `:focus-visible{outline:3px` lands at byte 7 901 and `.outline-none` at
 * 39 845, so one `outline-none` on a control silently deletes its focus ring with nothing else to show for it.
 *
 * This is the ratified half of W1-01's deviation: the driver kit uses native <button>s rather than the kit's `Button`
 * precisely because that component's base cva opens with `outline-none`, and W1-01 measured itself writing the class
 * out of habit 13 times before removing it.
 *
 * WHAT IT DOES NOT PROVE. It reads THIS mock's own source and nothing else, so the four office review components that
 * import `@agency/kit/button` still inherit the kit's `outline-none` and its ring-based indicator instead (a 3 px ring
 * at 50 % opacity, offset 0, not a 3 px outline at offset 2) — a §8.5 residual for W3-05's browser QA, invisible here.
 * It is textual: it cannot see a class assembled at runtime, nor `outline: none` written in a style attribute.
 */
describe('the §8.5 focus ring survives every client surface', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
    });

  /** The offenders in a set of files: anything that writes the class that cancels the outline. Comment lines are
   *  dropped first — `components/driver/index.ts` NAMES the class in the docblock explaining why the driver kit
   *  refuses it, and a word in a comment styles nothing. */
  const cancels = (files: string[]): string[] =>
    files.filter((f) => readFileSync(f, 'utf8').split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .some((l) => /(^|[\s"'`])outline-none([\s"'`]|$)/.test(l)));

  const surfaces = ['components', 'pages', 'stage'].flatMap((d) => {
    const at = resolve(import.meta.dirname, '..', d);
    return existsSync(at) ? walk(at) : [];
  });

  it('is written nowhere under components/, pages/ or stage/', () => {
    expect(surfaces.length).toBeGreaterThan(60);
    expect(cancels(surfaces).map((f) => f.split('/src/')[1])).toEqual([]);
  });

  it('would say so if it were — the control that keeps the green above honest', () => {
    const planted = resolve(import.meta.dirname, '../../.outline-probe.tsx');
    writeFileSync(planted, 'export const B = () => <button className="h-tap outline-none">Зняти</button>;\n');
    try {
      expect(cancels([planted])).toHaveLength(1);
    } finally {
      rmSync(planted);
    }
  });
});
