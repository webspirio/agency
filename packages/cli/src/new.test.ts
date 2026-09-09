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
import { LOCALES, newMock } from './new';

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

  it('never copies build droppings into a mock', async () => {
    // `.DS_Store` and `tsconfig.tsbuildinfo` are gitignored, so review never
    // sees them — and a stale buildinfo makes the generated mock's `tsc -b`
    // decide it is already up to date and emit nothing, silently.
    const templateDir = fixtureTemplate({
      'keep.ts': 'export const keep = 1;\n',
      '.DS_Store': 'junk',
      'tsconfig.tsbuildinfo': '{}',
      'node_modules/left/index.js': 'module.exports = 1;\n',
      'dist/assets/app.js': 'console.log(1);\n',
    });
    const { dir, files } = await newMock({ slug: 'no-droppings', root, templateDir });
    expect(files).toEqual(['keep.ts']);
    expect(walk(dir)).toEqual(['keep.ts']);
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
    expect(profiles).toContain("id: 'solo'");
    expect(profiles).toContain("id: 'full'");
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
