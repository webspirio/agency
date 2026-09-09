/**
 * `agency new <slug>` — the ONLY supported way a mock comes into existence.
 *
 * Per the propagation doctrine a standard reaches a new mock as something this
 * function writes at t=0, or it does not reach it at all. Everything the
 * scaffold has to get right — the axios seam, hash routing, the Tailwind
 * `@source` line, the unpersisted profile — is a file copied from
 * `templates/mock/`, not a paragraph somebody is supposed to have read.
 *
 * The renderer is deliberately tiny (there is no handlebars dependency and
 * none is wanted) and deliberately LOUD: an unknown placeholder, an
 * un-iterable `{{#each}}`, or any `{{` surviving substitution throws, and the
 * half-written mock is removed. A scaffolder that silently emits `headline: ''`
 * costs more than one that refuses to run.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The locales `@agency/synth` ships a corpus for. `new.test.ts` pins this to
 *  `Object.keys(CORPUS)`, so adding a corpus without adding it here goes red. */
export const LOCALES = ['de', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];

export type NewMockOptions = {
  slug: string;
  title?: string;
  locale?: Locale;
  profiles?: string[];
  /** Workspace root. Defaults to the repo this CLI lives in. */
  root?: string;
  /** Template to instantiate. Defaults to `templates/mock`. */
  templateDir?: string;
};

/** npm package name AND directory name AND Worker name, all three at once. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/** A profile id is emitted into `caps: ['<id>']` and compared against a query
 *  string, so it may hold nothing that needs escaping in either place. */
const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const HBS = '.hbs';

/**
 * Files that appear in a template directory without anyone putting them there.
 * `.DS_Store` is written by the Finder and `*.tsbuildinfo` by a stray `tsc -b`;
 * both are gitignored, so review never sees them, and a stale buildinfo makes
 * the generated mock's own `tsc -b` decide it is already up to date and emit
 * nothing at all.
 */
const DROPPING = /^(node_modules|dist|\.DS_Store)$|\.tsbuildinfo$/;

type Escape = (value: string) => string;

/** For a single-quoted TS/JS literal: `headline: '{{title}}'`. */
const tsString: Escape = (v) =>
  v
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

/** For a JSON string body: `"name": "{{slug}}"`. */
const jsonString: Escape = (v) => JSON.stringify(v).slice(1, -1);

/** For HTML text and attribute values alike: `<title>{{title}}</title>`. */
const htmlText: Escape = (v) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const verbatim: Escape = (v) => v;

/**
 * Escaping is chosen by the TARGET file's type, because the same `{{title}}`
 * lands in a single-quoted TypeScript literal and in an HTML `<title>`. Only
 * `title` is free-form — slug, locale and profile ids are validated above — so
 * a missing entry here is a build break, not a corruption. A file type absent
 * from this map is refused rather than passed through: silence is how
 * `L'Atelier` becomes a mock that does not compile.
 */
const ESCAPERS: Record<string, Escape> = {
  ts: tsString,
  tsx: tsString,
  mts: tsString,
  cts: tsString,
  js: tsString,
  jsx: tsString,
  mjs: tsString,
  cjs: tsString,
  json: jsonString,
  jsonc: jsonString,
  html: htmlText,
  htm: htmlText,
  css: verbatim,
  md: verbatim,
  txt: verbatim,
};

function escaperFor(rel: string): Escape | undefined {
  const withoutHbs = basename(rel).endsWith(HBS)
    ? basename(rel).slice(0, -HBS.length)
    : basename(rel);
  const dot = withoutHbs.lastIndexOf('.');
  return ESCAPERS[dot === -1 ? '' : withoutHbs.slice(dot + 1).toLowerCase()];
}

/** `{{var}}`, `{{this}}`, `{{this.field}}`. */
const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
/** ONE level of iteration. A nested block leaves a stray `{{/each}}` behind,
 *  which the post-substitution sweep below turns into a thrown error. */
const EACH = /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

function fill(
  body: string,
  data: Record<string, unknown>,
  item: Record<string, unknown> | undefined,
  escape: Escape,
  where: string,
): string {
  return body.replace(PLACEHOLDER, (_match, key: string) => {
    if (item) {
      if (key === 'this') return escape(String(item));
      if (key.startsWith('this.')) {
        const field = key.slice('this.'.length);
        if (!(field in item)) {
          throw new Error(`agency new: unknown placeholder {{${key}}} in ${where}`);
        }
        return escape(String(item[field]));
      }
    }
    if (!(key in data)) {
      throw new Error(`agency new: unknown placeholder {{${key}}} in ${where}`);
    }
    return escape(String(data[key]));
  });
}

function render(
  source: string,
  data: Record<string, unknown>,
  escape: Escape,
  where: string,
): string {
  const expanded = source.replace(EACH, (_match, key: string, body: string) => {
    const items = data[key];
    if (!Array.isArray(items)) {
      throw new Error(`agency new: {{#each ${key}}} in ${where} has no array to iterate`);
    }
    return items
      .map((item) => fill(body, data, item as Record<string, unknown>, escape, where))
      .join('');
  });

  const filled = fill(expanded, data, undefined, escape, where);

  // Everything the renderer understands is gone by now. Anything left is a
  // nested {{#each}}, an unclosed block or a typo — all of which the plan's
  // renderer would have written into the mock verbatim.
  if (filled.includes('{{')) {
    throw new Error(`agency new: ${where} still holds an unrendered {{…}} after substitution`);
  }
  return filled;
}

/** Every file under `dir`, recursively, as paths relative to it. */
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [relative(base, full)];
  });
}

export async function newMock(opts: NewMockOptions): Promise<{ dir: string; files: string[] }> {
  if (!SLUG.test(opts.slug)) {
    throw new Error(`agency new: slug must match ${SLUG} — got ${JSON.stringify(opts.slug)}`);
  }

  const locale = opts.locale ?? 'de';
  if (!(LOCALES as readonly string[]).includes(locale)) {
    throw new Error(
      `agency new: locale must be one of ${LOCALES.join(', ')} — got ${JSON.stringify(locale)}`,
    );
  }

  const profileIds = opts.profiles?.length ? opts.profiles : ['default'];
  for (const id of profileIds) {
    if (!PROFILE_ID.test(id)) {
      throw new Error(`agency new: profile id must match ${PROFILE_ID} — got ${JSON.stringify(id)}`);
    }
  }
  if (new Set(profileIds).size !== profileIds.length) {
    throw new Error(`agency new: duplicate profile id in --profiles ${profileIds.join(',')}`);
  }

  const root = opts.root ?? REPO;
  const template = opts.templateDir ?? join(REPO, 'templates', 'mock');
  const dir = join(root, 'mocks', opts.slug);
  if (existsSync(dir)) throw new Error(`agency new: ${dir} already exists`);

  const data: Record<string, unknown> = {
    slug: opts.slug,
    title: opts.title ?? opts.slug,
    locale,
    defaultProfile: profileIds[0] ?? 'default',
    profiles: profileIds.map((id) => ({ id, label: id })),
  };

  mkdirSync(dir, { recursive: true });
  try {
    cpSync(template, dir, { recursive: true, filter: (src) => !DROPPING.test(basename(src)) });

    const files: string[] = [];
    for (const rel of walk(dir)) {
      const full = join(dir, rel);
      // Read as bytes: a template may one day hold a favicon, and decoding a
      // binary as utf8 to look for `{{` corrupts it on the way back out.
      const raw = readFileSync(full);
      if (raw.includes('{{')) {
        const escape = escaperFor(rel);
        if (!escape) {
          throw new Error(
            `agency new: ${rel} holds a placeholder but no escaping rule covers its file type`,
          );
        }
        writeFileSync(full, render(raw.toString('utf8'), data, escape, rel));
      }
      if (rel.endsWith(HBS)) {
        renameSync(full, full.slice(0, -HBS.length));
        files.push(rel.slice(0, -HBS.length));
      } else {
        files.push(rel);
      }
    }
    return { dir, files };
  } catch (error) {
    // A retry with the typo fixed must not die on "already exists".
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
