import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
    expect(read('src/index.css')).toMatch(/@source\s+".*packages\/kit\/src\/\*\*\/\*\.tsx"/);
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
 * The seven above are Plan A's. The seven below close holes the plan's own gate
 * depends on but its test file does not cover — each one is a failure that
 * produces a green build and a wrong screen.
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
    const tsconfig = JSON.parse(read('tsconfig.json')) as { extends: string };
    expect(existsSync(asInstantiated(tsconfig.extends))).toBe(true);
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
