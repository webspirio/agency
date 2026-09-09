import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { LOCALES, newMock, render } from './new';

const BIN = fileURLToPath(new URL('../bin/agency.mjs', import.meta.url));

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'agency-new-'));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Every file under `dir`, recursively, as paths relative to it. */
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [relative(base, full)];
  });
}

const byPath = (a: string, b: string): number => a.localeCompare(b);

/** A scratch template directory, for the failure paths the real one cannot reach. */
function fixtureTemplate(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'agency-tpl-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

/**
 * The locales `@agency/synth` ships a corpus for, read out of its SOURCE.
 *
 * Not an import: `packages/cli` declares no dependency on `@agency/synth` and
 * wants none, and a relative cross-package import is TS6307 against the
 * composite project graph. Parsing the file is what lets this drift check
 * exist without inventing a dependency to justify it.
 */
function corpusLocales(): string[] {
  const file = fileURLToPath(new URL('../../synth/src/corpus.ts', import.meta.url));
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
  );
  const found: string[] = [];
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'CORPUS') continue;
      const initializer = declaration.initializer;
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) continue;
      for (const property of initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
          found.push(property.name.text);
        }
      }
    }
  });
  return found;
}

type Run = { code: number; out: string };
function run(args: string[]): Run {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8', stdio: 'pipe' }),
    };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('agency new', () => {
  it('creates a mock with every placeholder substituted', async () => {
    const { dir } = await newMock({
      slug: 'acme-crm',
      title: 'ACME Logistics',
      locale: 'de',
      profiles: ['custody', 'fleet'],
      root,
    });

    expect(dir).toBe(join(root, 'mocks', 'acme-crm'));
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'package.json.hbs'))).toBe(false); // templates are consumed

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string };
    expect(pkg.name).toBe('acme-crm');

    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('lang="de"');
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('ACME Logistics');

    const profiles = readFileSync(join(dir, 'src/profiles.ts'), 'utf8');
    expect(profiles).toContain("id: 'custody'");
    expect(profiles).toContain("id: 'fleet'");

    const wrangler = readFileSync(join(dir, 'wrangler.jsonc'), 'utf8');
    expect(wrangler).toContain('"name": "acme-crm"');
  });

  it('leaves no unsubstituted handlebars anywhere', async () => {
    const { dir, files } = await newMock({ slug: 'clean', root });
    for (const f of files) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/\{\{/);
    }
  });

  it('refuses an invalid slug rather than producing a broken package name', async () => {
    await expect(newMock({ slug: 'Not A Slug', root })).rejects.toThrow(/slug/);
    await expect(newMock({ slug: '', root })).rejects.toThrow(/slug/);
  });

  it('refuses to overwrite an existing mock', async () => {
    await newMock({ slug: 'dupe', root });
    await expect(newMock({ slug: 'dupe', root })).rejects.toThrow(/exists/);
  });

  it('defaults to one profile named default', async () => {
    const { dir } = await newMock({ slug: 'solo-default', root });
    expect(readFileSync(join(dir, 'src/profiles.ts'), 'utf8')).toContain("id: 'default'");
  });
});

/**
 * The five above are Plan A's, verbatim. Everything below closes a hole that
 * the gate depends on and that the plan's own test file cannot see — each one
 * a scaffold that generates without complaint and then fails, or worse, does
 * not fail.
 */
describe('agency new — the silent ones', () => {
  it('returns exactly the files it wrote, so the placeholder sweep cannot pass vacuously', async () => {
    // The sweep above iterates `files`. If `files` is short by one — a dotfile
    // the walker skipped, say — the sweep reports green having never opened it.
    const { dir, files } = await newMock({ slug: 'enumerated', root });
    expect(files.length).toBeGreaterThan(0);
    expect([...files].sort(byPath)).toEqual(walk(dir).sort(byPath));
  });

  it('consumes every .hbs, not merely package.json.hbs', async () => {
    const { dir, files } = await newMock({ slug: 'no-hbs', root });
    expect(files.filter((f) => f.endsWith('.hbs'))).toEqual([]);
    expect(walk(dir).filter((f) => f.endsWith('.hbs'))).toEqual([]);
  });

  it("emits TypeScript that parses, even when the client's name carries an apostrophe", async () => {
    // `headline: '{{title}}'` — an unescaped apostrophe in the title closes the
    // string literal and the generated mock does not compile. `L'Atelier` and
    // `Wagner & Söhne` are the shapes this agency's client list actually has.
    const { dir, files } = await newMock({
      slug: 'apostrophe',
      title: "L'Atelier & Söhne <3",
      root,
    });

    // `.d.ts` is excluded: it produces no output, and `transpileModule` fails
    // outright on one rather than reporting a diagnostic.
    for (const f of files.filter((n) => /\.tsx?$/.test(n) && !n.endsWith('.d.ts'))) {
      const { diagnostics } = ts.transpileModule(readFileSync(join(dir, f), 'utf8'), {
        fileName: f,
        reportDiagnostics: true,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
        },
      });
      const messages = (diagnostics ?? []).map((d) =>
        ts.flattenDiagnosticMessageText(d.messageText, ' '),
      );
      expect({ file: f, messages }).toEqual({ file: f, messages: [] });
    }

    expect(readFileSync(join(dir, 'src/domain/calc.ts'), 'utf8')).toContain("L\\'Atelier");
  });

  it('escapes the title for HTML, so a bracket in a client name cannot break the document', async () => {
    const { dir } = await newMock({ slug: 'html-escape', title: 'A & B <Ltd>', root });
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;Ltd&gt;');
    expect(html).not.toContain('<Ltd>');
  });

  it('accepts exactly the locales @agency/synth ships a corpus for', () => {
    // A `--locale fr` scaffolds a mock whose seed casts 'fr' to Locale and whose
    // every generated name is undefined. The failure is 10 minutes downstream,
    // in `tsc -b`, with zero hand-edits already spent.
    const locales = corpusLocales();
    // Guards the guard: a corpus that failed to parse must not read as agreement.
    expect(locales.length).toBeGreaterThan(0);
    expect([...LOCALES]).toEqual(locales);
  });

  it('refuses a locale the corpus cannot generate', async () => {
    await expect(newMock({ slug: 'bad-locale', locale: 'fr' as never, root })).rejects.toThrow(
      /locale/,
    );
  });

  it('refuses a profile id that would not survive into a TypeScript string literal', async () => {
    // `caps: ['{{this.id}}']` is a single-quoted literal. An id carrying a quote
    // or a space produces a src/profiles.ts that does not parse.
    await expect(newMock({ slug: 'bad-profile-q', profiles: ["a'x"], root })).rejects.toThrow(
      /profile/,
    );
    await expect(newMock({ slug: 'bad-profile-s', profiles: ['Fleet Ops'], root })).rejects.toThrow(
      /profile/,
    );
    expect(existsSync(join(root, 'mocks', 'bad-profile-q'))).toBe(false);
  });

  it('refuses duplicate profile ids — createProfiles silently keeps the first', async () => {
    await expect(newMock({ slug: 'dupe-profiles', profiles: ['solo', 'solo'], root })).rejects.toThrow(
      /duplicate/i,
    );
  });

  it('leaves an existing mock untouched when it refuses to overwrite it', async () => {
    // Refusing is the easy half. The expensive half is the unwind: the `rm`
    // that removes a half-written mock must never reach a directory that
    // existed BEFORE the call. A mock carries hand-written screens by day two,
    // and `agency new` re-run against the wrong slug would take them with it.
    const { dir, files } = await newMock({ slug: 'overwrite-guard', root });
    writeFileSync(join(dir, 'HAND-WRITTEN.txt'), 'a screen nobody has committed yet\n');

    await expect(newMock({ slug: 'overwrite-guard', root })).rejects.toThrow(/exists/);

    expect(walk(dir).sort(byPath)).toEqual([...files, 'HAND-WRITTEN.txt'].sort(byPath));
  });

  it('throws on an unknown placeholder instead of writing an empty string', async () => {
    // The plan's renderer substitutes `String(data[k] ?? '')`, so a typo in a
    // template — `{{name}}` for `{{title}}` — yields `headline: ''` and a mock
    // with a blank heading that nobody notices until the call.
    const templateDir = fixtureTemplate({ 'broken.ts': "export const x = '{{nope}}';\n" });
    await expect(newMock({ slug: 'unknown-key', root, templateDir })).rejects.toThrow(/nope/);
  });

  it('leaves no half-written mock behind when a template file cannot be rendered', async () => {
    // Otherwise the retry — with the typo fixed — dies on "already exists" and
    // the operator has to know to rm -rf a directory they did not create.
    const templateDir = fixtureTemplate({
      'ok.ts': 'export const ok = 1;\n',
      'broken.ts': "export const x = '{{nope}}';\n",
    });
    await expect(newMock({ slug: 'half-written', root, templateDir })).rejects.toThrow(/nope/);
    expect(existsSync(join(root, 'mocks', 'half-written'))).toBe(false);
  });

  it('renders a NESTED {{#each}} instead of corrupting it', async () => {
    // Defect #2. The template only has one array to iterate, so the nesting a
    // fixture can express is `profiles` inside `profiles` — which is exactly
    // the shape that broke: the outer block terminated at the INNER
    // `{{/each}}`, the inner marker survived into the emitted file, and
    // `{{this.id}}` — still bound to the OUTER item — rendered the object.
    const templateDir = fixtureTemplate({
      'matrix.ts':
        "export const m = [{{#each profiles}}[{{#each profiles}}'{{this.id}}',{{/each}}],{{/each}}];\n",
    });
    const { dir } = await newMock({
      slug: 'nested-each',
      profiles: ['solo', 'full'],
      root,
      templateDir,
    });
    const emitted = readFileSync(join(dir, 'matrix.ts'), 'utf8');
    expect(emitted).toBe("export const m = [['solo','full',],['solo','full',],];\n");
    expect(emitted).not.toContain('[object Object]');
  });

  it('refuses an unclosed {{#each}} and a stray {{/each}}', async () => {
    const unclosed = fixtureTemplate({ 'a.ts': "export const a = '{{#each profiles}}{{this.id}}';\n" });
    await expect(newMock({ slug: 'unclosed-each', root, templateDir: unclosed })).rejects.toThrow(
      /unclosed \{\{#each\}\}/,
    );
    const stray = fixtureTemplate({ 'b.ts': "export const b = 1;{{/each}}\n" });
    await expect(newMock({ slug: 'stray-each', root, templateDir: stray })).rejects.toThrow(
      /\{\{\/each\}\} with no \{\{#each\}\}/,
    );
    // The dangerous one: a stray close AFTER a well-formed block. The depth
    // scan has returned to zero by then, so a parser that only counted while
    // inside a block would copy this marker into the mock.
    const trailing = fixtureTemplate({
      'c.ts': "export const c = [{{#each profiles}}'{{this.id}}',{{/each}}];{{/each}}\n",
    });
    await expect(newMock({ slug: 'trailing-each', root, templateDir: trailing })).rejects.toThrow(
      /\{\{\/each\}\} with no \{\{#each\}\}/,
    );
  });

  it('refuses an {{#each}} over something that is not an array, by name', async () => {
    // `{{#each title}}` is a typo for `{{title}}`. Iterating a string one
    // character at a time is what a permissive renderer would do with it.
    const templateDir = fixtureTemplate({ 'd.ts': 'export const d = {{#each title}}x{{/each}};\n' });
    await expect(newMock({ slug: 'not-array', root, templateDir })).rejects.toThrow(
      /\{\{#each title\}\}.*no array to iterate/,
    );
  });

  it('refuses an {{#each}} with no key rather than leaving the marker in the file', async () => {
    const templateDir = fixtureTemplate({ 'e.ts': 'export const e = {{#each}}x{{/each}};\n' });
    await expect(newMock({ slug: 'keyless-each', root, templateDir })).rejects.toThrow(
      /\{\{#each\}\}.*names nothing to iterate/,
    );
  });

  it('emits a real capability ARRAY per profile, not merely the id somewhere in the file', async () => {
    // The previous assertion was `toContain("id: 'custody'")`, which is
    // satisfied by `{ id: 'custody', label: 'custody', caps: [{{#each ...` —
    // the exact corrupt output the non-greedy nested-each regex produced.
    // Read the emitted entries back as structure so the caps array itself is
    // what the test is about.
    const { dir } = await newMock({ slug: 'caps-array', profiles: ['custody', 'fleet'], root });
    const source = readFileSync(join(dir, 'src/profiles.ts'), 'utf8');
    const emitted = [
      ...source.matchAll(/\{ id: '([^']*)', label: '([^']*)', caps: \[([^\]]*)\] \}/g),
    ].map((m) => ({
      id: m[1],
      label: m[2],
      caps: (m[3] ?? '')
        .split(',')
        .map((c) => c.trim().replace(/^'|'$/g, ''))
        .filter(Boolean),
    }));
    expect(emitted).toEqual([
      { id: 'custody', label: 'custody', caps: ['custody'] },
      { id: 'fleet', label: 'fleet', caps: ['fleet'] },
    ]);
  });

  it('never copies build droppings into a mock', async () => {
    // `.DS_Store` and `tsconfig.tsbuildinfo` are gitignored, so review never
    // sees them — and a stale buildinfo makes the generated mock's `tsc -b`
    // decide it is already up to date and emit nothing, silently.
    //
    // `keep.d.ts` is the discriminator, and it is why this filter cannot be
    // `/\.d\.ts$/`: `keep.d.ts` sits beside `keep.ts` and can only have come
    // out of `tsc`, while `vite-env.d.ts` has no sibling implementation and is
    // a declaration somebody wrote on purpose. Same rule as
    // `scripts/verify/checks/emit-clean.mjs`, which is what makes the two
    // agree about what "emit" means.
    const templateDir = fixtureTemplate({
      'keep.ts': 'export const keep = 1;\n',
      'keep.d.ts': 'export declare const keep: number;\n',
      'vite-env.d.ts': '/// <reference types="vite/client" />\n',
      '.DS_Store': 'junk',
      'tsconfig.tsbuildinfo': '{}',
      'node_modules/left/index.js': 'module.exports = 1;\n',
      'dist/assets/app.js': 'console.log(1);\n',
      'src/nested/deep.tsx': 'export const deep = 1;\n',
      'src/nested/deep.d.ts': 'export declare const deep: number;\n',
      'src/node_modules/sneaky/index.js': 'module.exports = 1;\n',
    });
    const { dir, files } = await newMock({ slug: 'no-droppings', root, templateDir });
    const expected = ['keep.ts', 'vite-env.d.ts', join('src', 'nested', 'deep.tsx')];
    expect([...files].sort(byPath)).toEqual([...expected].sort(byPath));
    expect(walk(dir).sort(byPath)).toEqual([...expected].sort(byPath));
  });

  it('keeps the template\'s own vite-env.d.ts, which the mock will not typecheck without', async () => {
    // The blunt fix for the line above — drop every `.d.ts` — deletes this
    // file, and the mock then fails `tsc -b` on `import.meta.env`. A test
    // against a fixture cannot see that; this one is against the real template.
    const { dir, files } = await newMock({ slug: 'vite-env-kept', root });
    expect(files).toContain(join('src', 'vite-env.d.ts'));
    expect(readFileSync(join(dir, 'src', 'vite-env.d.ts'), 'utf8')).toContain('vite/client');
  });
});

/**
 * `render` is exported for this block alone, and the export earns its place:
 * the scaffolder's own data is one flat array of `{ id, label }`, so the
 * scope-popping and the per-level escaping below are unreachable through
 * `newMock`. Leaving the deepest branch of the parser tested only indirectly
 * is how `[object Object]` shipped in the first place.
 */
describe('render — nested iteration, one scope per level', () => {
  const plain = (v: string): string => v;

  it('binds {{this}} to the INNERMOST item and restores the outer scope after the block', () => {
    // Measured 2026-09-10 against the non-greedy
    // `/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g`, this exact input produced
    //   [{ id: 'solo', caps: [{{#each this.caps}}'[object Object]',] },{{/each}}]
    // — the outer body truncated at the inner `{{/each}}`, the inner marker
    // copied out verbatim, and `{{this}}` still bound to the OUTER item.
    const source =
      "[{{#each profiles}}{ id: '{{this.id}}'," +
      " caps: [{{#each this.caps}}'{{this}}',{{/each}}]," +
      " label: '{{this.label}}' },{{/each}}]";
    const out = render(
      source,
      {
        profiles: [
          { id: 'solo', label: 'Solo', caps: ['read'] },
          { id: 'full', label: 'Full', caps: ['read', 'write'] },
        ],
      },
      plain,
      'nested.ts',
    );
    expect(out).toBe(
      "[{ id: 'solo', caps: ['read',], label: 'Solo' }," +
        "{ id: 'full', caps: ['read','write',], label: 'Full' },]",
    );
  });

  it('iterates three levels deep and still reaches the root scope from the bottom', () => {
    const out = render(
      '{{#each a}}{{#each this.b}}{{#each this.c}}[{{root}}:{{this}}]{{/each}}{{/each}}{{/each}}',
      { root: 'R', a: [{ b: [{ c: ['x', 'y'] }, { c: ['z'] }] }] },
      plain,
      'deep.ts',
    );
    expect(out).toBe('[R:x][R:y][R:z]');
  });

  it('escapes a value produced at every level, not merely at the top', () => {
    // The nested path is where an unescaped `L'Atelier` would land in
    // `caps: ['…']`, and the emitted mock would not parse.
    const out = render(
      "{{#each rows}}'{{#each this.names}}{{this}}{{/each}}'{{/each}}",
      { rows: [{ names: ["L'Atelier"] }] },
      (v: string) => v.replace(/'/g, "\\'"),
      'escaped.ts',
    );
    expect(out).toBe("'L\\'Atelier'");
  });

  it('renders two sibling blocks, so the scan resumes after a close rather than stopping', () => {
    const out = render(
      '{{#each a}}<{{this}}>{{/each}}|{{#each b}}[{{this}}]{{/each}}',
      { a: ['1', '2'], b: ['3'] },
      plain,
      'siblings.ts',
    );
    expect(out).toBe('<1><2>|[3]');
  });

  it('renders an empty array as nothing, and leaves no marker behind', () => {
    expect(render('x{{#each a}}{{#each this.b}}{{this}}{{/each}}{{/each}}y', { a: [] }, plain, 'e.ts')).toBe(
      'xy',
    );
  });

  it('names the field, not the file, when an inner item lacks it', () => {
    expect(() =>
      render('{{#each a}}{{this.missing}}{{/each}}', { a: [{ id: 'x' }] }, plain, 'f.ts'),
    ).toThrow(/unknown placeholder \{\{this\.missing\}\}/);
  });

  it('refuses an inner {{#each}} over a field that is not an array', () => {
    expect(() =>
      render('{{#each a}}{{#each this.caps}}x{{/each}}{{/each}}', { a: [{ id: 'x' }] }, plain, 'g.ts'),
    ).toThrow(/\{\{#each this\.caps\}\}.*no array to iterate/);
  });
});

describe('the agency bin', () => {
  it("runs the gate's first command end to end", () => {
    const r = run([
      'new',
      'bin-smoke',
      '--title',
      'Bin Smoke',
      '--locale',
      'uk',
      '--profiles',
      'solo,full',
      '--root',
      root,
    ]);
    expect({ code: r.code, out: r.out }).toMatchObject({ code: 0 });
    expect(r.out).toContain(join(root, 'mocks', 'bin-smoke'));

    const profiles = readFileSync(join(root, 'mocks', 'bin-smoke', 'src/profiles.ts'), 'utf8');
    // The whole entry, caps array included — `toContain("id: 'solo'")` alone is
    // satisfied by the corrupt output the nested-each regex used to produce.
    expect(profiles).toContain("{ id: 'solo', label: 'solo', caps: ['solo'] },");
    expect(profiles).toContain("{ id: 'full', label: 'full', caps: ['full'] },");
    expect(profiles).toContain("'solo',\n);"); // the fallback is the first --profiles entry
    expect(readFileSync(join(root, 'mocks', 'bin-smoke', 'index.html'), 'utf8')).toContain(
      'lang="uk"',
    );
  });

  it('exits non-zero on an unknown command, printing usage', () => {
    const r = run(['build']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/usage: agency new/);
  });

  it('exits non-zero when the slug is missing', () => {
    const r = run(['new']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/slug/);
  });

  it('exits non-zero, not with a stack trace, when the mock already exists', () => {
    const first = run(['new', 'bin-dupe', '--root', root]);
    expect(first.code).toBe(0);
    const second = run(['new', 'bin-dupe', '--root', root]);
    expect(second.code).not.toBe(0);
    expect(second.out).toMatch(/exists/);
    expect(second.out).not.toMatch(/at newMock|node:internal/);
  });
});
