import { describe, it, expect } from 'vitest';
import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

/**
 * `templates/mock/tsconfig.json` carries `//` comments, which is legal for tsc
 * and fatal to JSON.parse — the assertion below read the file with JSON.parse
 * and went red the moment the tsconfig grew the comment explaining why the
 * mock sets `noEmit`. Parsed here with the compiler's own JSONC reader, so the
 * test reads the file exactly as the tool that consumes it does.
 */
function readJsonc<T>(rel: string): T {
  const { config, error } = ts.parseConfigFileTextToJson(rel, read(rel));
  if (error) throw new Error(`${rel}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`);
  return config as T;
}

const REPO = new URL('../../../', import.meta.url).pathname;
const T = new URL('../../../templates/mock/', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(T, p), 'utf8');

/**
 * Where the template will actually live once `agency new` has copied it.
 * Every relative path inside the template resolves from HERE, not from
 * `templates/mock/` — one directory level deeper. The `@source` glob and the
 * lint/tsconfig `extends` are all off by one if that is got wrong, and all
 * three fail silently.
 */
const asInstantiated = (...segments: string[]) =>
  resolve(REPO, 'mocks', 'any-slug', ...segments);

/** Every file in the template, recursively — dotfiles and .hbs included. */
const templateFiles = (dir: string = T): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? templateFiles(join(dir, e.name)) : [join(dir, e.name)],
  );

describe('template invariants', () => {
  it('uses createHashRouter — one word from the product, no basename, no 404.html', () => {
    const r = read('src/app/router.tsx');
    expect(r).toMatch(/createHashRouter/);
    expect(r).not.toMatch(/basename/);
  });

  it('has exactly one axios.create, and the adapter is the only mock/product difference', () => {
    const c = read('src/api/client.ts');
    expect(c.match(/axios\.create/g)).toHaveLength(1);
    expect(c).toMatch(/adapter:.*VITE_MOCK.*mockAdapter/s);
    expect(c).toMatch(/paramsSerializer:\s*\{\s*indexes:\s*null\s*\}/);
  });

  it('carries the Tailwind @source line, without which kit utilities vanish from dist CSS', () => {
    expect(read('src/index.css')).toMatch(
      /@source\s+".*packages\/kit\/src\/\*\*\/\*\.\{ts,tsx\}"/,
    );
  });

  it('marks the five silently-failing files as scaffold-owned', () => {
    for (const f of ['src/app/router.tsx', 'src/api/client.ts', 'src/main.tsx']) {
      expect(read(f)).toMatch(/@scaffold-owned/);
    }
    expect(read('src/profiles.ts.hbs')).toMatch(/@scaffold-owned/);
    expect(read('src/index.css')).toMatch(/@scaffold-owned/);
  });

  it('persists no domain rows — only UI state', () => {
    const m = read('src/main.tsx');
    expect(m).toMatch(/partialize/);
    expect(m).toMatch(/theme|sidebar/);
    expect(m).not.toMatch(/origin:\s*'seed'/);
  });

  it('builds at base "/" so one Worker per slug serves it at root', () => {
    expect(read('vite.config.ts')).toMatch(/base:\s*process\.env\.MOCK_BASE\s*\?\?\s*'\/'/);
  });

  it('forbids the rejected dependencies', () => {
    const pkg = read('package.json.hbs');
    for (const banned of ['"msw"', '@mswjs/data', '@msw/data', 'pglite', '"zod"', 'i18next']) {
      expect(pkg).not.toContain(banned);
    }
  });
});

/**
 * The seven above are Plan A's, verbatim. The ten below close holes the plan's
 * own gate depends on but its test file does not cover — each one is a failure
 * that produces a green build and a wrong screen, or a red gate.
 */
describe('template invariants — the silent ones', () => {
  it('resolves its @source glob to the kit FROM THE INSTANTIATED MOCK, not from the template', () => {
    const match = /@source\s+"([^"]+)"/.exec(read('src/index.css'));
    expect(match).not.toBeNull();
    const glob = match?.[1] ?? '';
    const dir = asInstantiated('src', glob.slice(0, glob.indexOf('*')));
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).some((f) => f.endsWith('.tsx'))).toBe(true);
  });

  it('scans the kit for class names in .ts as well as .tsx', () => {
    // The glob was `*.tsx` only. Tailwind's scanner is TEXTUAL — it has no idea
    // what a component is — so a utility written in a `.ts` file is simply
    // never seen, and the utility is absent from dist CSS with no error
    // anywhere. `packages/kit/src/lib/cn.ts` already does exactly that:
    //   export const focusRing =
    //     'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
    // Restricting the glob by extension is a bet that no kit `.ts` ever names a
    // class, and the kit lost that bet on the day it was extracted.
    //
    // Asserted on the GLOB rather than on dist CSS, and the reason is measured.
    // Two mock builds on 2026-09-10, identical but for this one line:
    //   *.tsx        62 043 B of CSS
    //   *.{ts,tsx}   62 325 B
    // The whole 282-byte difference is `.inline` and `.ring` — two bare words
    // the textual scanner lifted out of ENGLISH PROSE in `.ts` comments ("the
    // inline script", "the one focus-visible ring"). Not one utility that any
    // kit file actually uses appeared or disappeared, because every utility
    // `focusRing` names also appears verbatim in eight `.tsx` components
    // (button, badge, checkbox, dialog, radio-group, segmented, select, switch,
    // tabs). So a "dist CSS contains what the .ts files name" assertion is
    // green under BOTH globs today and could not have caught this.
    //
    // That the glob is nonetheless load-bearing was measured the same way: a
    // throwaway `export const X = 'ring-offset-4'` added to a kit `.ts` file is
    // absent from dist CSS under `*.tsx` and present under `*.{ts,tsx}`. The
    // seam is real; it simply has no victim in the kit yet, which is exactly
    // the state in which a check has to exist rather than an observation.
    const glob = /@source\s+"([^"]+)"/.exec(read('src/index.css'))?.[1] ?? '';
    const matched = new Set(globSync(resolve(asInstantiated('src'), glob)));
    const kit = resolve(REPO, 'packages', 'kit', 'src');
    const unscanned = templateFiles(kit)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => !matched.has(f));
    expect(unscanned).toEqual([]);
    // Guards the guard: an empty kit, or a glob that matched nothing, must not
    // read as agreement.
    expect(matched.has(join(kit, 'lib', 'cn.ts'))).toBe(true);
  });

  it('defines the theme tokens the kit paints with — @source alone does not create bg-card', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/@theme\b/);
    for (const token of [
      '--color-background',
      '--color-card',
      '--color-primary',
      '--color-muted-foreground',
      '--color-border',
      '--color-destructive',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('scopes the theme key to the slug, and hardcodes it in neither half', () => {
    // `web-starter:theme` was hardcoded twice — once in the kit's store and
    // once in this file's paint-0 script — so every mock served from one origin
    // shared a theme, and the two halves could drift apart with nothing red.
    // Both now read `<html data-theme-key>`; the handshake itself is asserted
    // in packages/kit/src/lib/theme/paint-zero.test.ts, which needs a document
    // and therefore cannot live in this (node) project.
    const html = read('index.html.hbs');
    expect(html).toContain('data-theme-key="{{slug}}:theme"');
    expect(html).toMatch(/document\.documentElement\.dataset\.themeKey/);
    expect(html).not.toContain('web-starter:theme');
    expect(html).not.toMatch(/localStorage\.getItem\(['"]/); // no literal key
  });

  it('renders the Overview screen THROUGH the kit, which is what makes @source load-bearing', () => {
    expect(read('src/pages/OverviewPage.tsx')).toMatch(/from '@agency\/kit/);
  });

  it('uses only the placeholders `agency new` supplies', () => {
    const allowed = new Set([
      'slug',
      'title',
      'locale',
      'defaultProfile',
      'profiles',
      '#each profiles',
      '/each',
      'this.id',
      'this.label',
    ]);
    const seen = new Set<string>();
    for (const file of templateFiles()) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\{\{([^}]+)\}\}/g)) {
        seen.add((m[1] ?? '').trim());
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].filter((k) => !allowed.has(k))).toEqual([]);
  });

  it('never nests one {{#each}} inside another — the renderer cannot parse it', () => {
    // Plan A's `render()` matches `{{#each x}}([\s\S]*?){{/each}}` NON-GREEDILY,
    // so an outer block terminates at the INNER `{{/each}}`. The inner marker
    // then survives into the generated file and the item renders as
    // '[object Object]'. Measured against the plan's own renderer on
    // 2026-09-10: `caps: [{{#each this.caps}}'{{this}}',{{/each}}]` produced
    //   { id: 'solo', label: 'solo', caps: [{{#each this.caps}}'[object Object]',
    // in every generated mock. One level of iteration is the contract; this
    // test is what makes that limit loud instead of a corrupt scaffold.
    for (const file of templateFiles()) {
      const source = readFileSync(file, 'utf8');
      let depth = 0;
      for (const m of source.matchAll(/\{\{(#each [^}]+|\/each)\}\}/g)) {
        depth += (m[1] ?? '').startsWith('#each') ? 1 : -1;
        expect({ file, depth }).toEqual({ file, depth: Math.min(Math.max(depth, 0), 1) });
      }
      expect({ file, depth }).toEqual({ file, depth: 0 });
    }
  });

  it('extends the workspace lint base from where the mock will actually live', () => {
    const config = JSON.parse(read('.oxlintrc.json')) as { extends: string[] };
    for (const rel of config.extends) expect(existsSync(asInstantiated(rel))).toBe(true);
  });

  it('ships a tsconfig, because `pnpm build` runs tsc before vite', () => {
    const pkg = JSON.parse(read('package.json.hbs')) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toMatch(/tsc/);
    const tsconfig = readJsonc<{ extends: string }>('tsconfig.json');
    expect(existsSync(asInstantiated(tsconfig.extends))).toBe(true);
  });

  it('ships a test and the runner that runs it — `pnpm --filter <slug> test` is a gate step', () => {
    // `vitest run` over a package with no test files prints "No test files
    // found, exiting with code 1". Measured 2026-09-10 against the workspace's
    // own vitest 4.1.11. So a scaffold that ships no test does not merely skip
    // a check, it fails the gate's fourth command — and `--passWithNoTests`
    // would trade that for a `test` row (SPEC 10) that proves nothing forever.
    const pkg = JSON.parse(read('package.json.hbs')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.test).toMatch(/vitest/);
    expect(pkg.scripts.test).not.toMatch(/passWithNoTests/);
    expect(pkg.devDependencies.vitest).toBeTruthy();
    const tests = templateFiles().filter((f) => /\.test\.tsx?$/.test(f));
    expect(tests.length).toBeGreaterThan(0);
  });

  it('ships a test that MOUNTS a screen, because the gate only proves the mock builds', () => {
    // A mock whose OverviewPage throws on mount passes `tsc -b && vite build`
    // and `vitest run` — the domain test never renders anything — so the day-4
    // gate's answer to "does it actually work" is BUILD-PROMPT's instruction to
    // confirm it by eye. That is the one step of the gate a human performs, and
    // the propagation doctrine says a standard survives as a check or not at all.
    //
    // `tests.length > 0` does not hold this up: `calc.test.ts` alone satisfies
    // it, so the render test could be deleted in silence. This pins the property
    // that matters — something in the template mounts a component into a DOM and
    // asserts what the client will look at.
    const mounting = templateFiles()
      .filter((f) => f.endsWith('.test.tsx'))
      .map((f) => readFileSync(f, 'utf8'))
      .filter((body) => /\brender\s*\(/.test(body) && /screen\.|findBy|getBy/.test(body));

    expect(mounting.length).toBeGreaterThan(0);
    // And it must assert on rendered output, not merely that mounting did not throw.
    expect(mounting.some((body) => /expect\(/.test(body))).toBe(true);
  });

  it('holds nothing but template — `agency new` copies the directory blind', () => {
    // Task 10's newMock() is a `cpSync(TEMPLATE, dir, { recursive: true })`:
    // every file sitting here, tracked or not, lands in every generated mock.
    // A stray `tsconfig.tsbuildinfo` left by a `tsc -b` run in this directory
    // is the dangerous one — it is gitignored, so review never sees it, and a
    // stale buildinfo makes the generated mock's `tsc -b` decide the project
    // is already up to date and emit nothing, silently.
    const strays = templateFiles()
      .map((f) => f.slice(T.length))
      .filter((f) => /(^|\/)(node_modules|dist)\/|\.tsbuildinfo$|(^|\/)\.DS_Store$/.test(f));
    expect(strays).toEqual([]);
  });

  it('path-links the four workspace packages instead of pinning a published version', () => {
    const pkg = JSON.parse(read('package.json.hbs')) as {
      dependencies: Record<string, string>;
    };
    for (const p of ['@agency/dec', '@agency/kit', '@agency/mock', '@agency/synth']) {
      expect(pkg.dependencies[p]).toBe('workspace:*');
    }
  });
});
