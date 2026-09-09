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
 *
 * `{{#each}}` nests to any depth, scanned by matching close markers rather than
 * by a non-greedy regex; each level binds `{{this}}` to its own item and the
 * root data stays readable from the bottom. See `bodyOf`.
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
 * nothing at all. `node_modules/` and `dist/` are matched as whole names, so
 * `cpSync`'s filter prunes the subtree rather than walking it.
 */
const DROPPING = /^(node_modules|dist|\.DS_Store)$|\.tsbuildinfo$/;

/** A declaration file, with the path it would have been emitted FROM. */
const DECLARATION = /^(.*)\.d\.ts$/;

/**
 * A `.d.ts` is emit, or it is hand-written, and the discriminator is the
 * sibling — never the gitignore state, since a template directory outside the
 * repo has none. `calc.d.ts` beside `calc.ts` can only have come out of `tsc`;
 * `vite-env.d.ts` has no implementation beside it and is the one line that
 * makes `import.meta.env` typecheck in every generated mock. Dropping the whole
 * extension deletes it and the mock fails `tsc -b` at the far end of the gate.
 *
 * Same rule as `scripts/verify/checks/emit-clean.mjs`, deliberately: the check
 * that fails on emit inside a `src/` and the scaffolder that refuses to copy it
 * have to agree on what emit IS, or one of them is wrong about every mock.
 */
function isDropping(src: string): boolean {
  if (DROPPING.test(basename(src))) return true;
  const declaration = DECLARATION.exec(src);
  if (!declaration) return false;
  const stem = declaration[1] ?? '';
  return existsSync(`${stem}.ts`) || existsSync(`${stem}.tsx`);
}

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

/**
 * One block marker, either kind, captured so a depth scan can tell them apart.
 *
 * `#each\b[^}]*` deliberately matches a MALFORMED opener as well — `{{#each}}`,
 * `{{#each a b}}` — so `expand` can reject the key by name. A pattern that only
 * matched a well-formed opener would leave the marker to the generic leftover
 * sweep, whose message is about substitution and sends the template author
 * looking for a typo'd placeholder instead of a broken block.
 *
 * A FUNCTION, never one shared instance: a `g` regex carries `lastIndex` and
 * this parser is recursive, so a shared one would have an inner block reset the
 * outer scan's position — a subtler version of the bug being fixed here.
 */
const marker = (): RegExp => /\{\{(#each\b[^}]*|\/each)\}\}/g;

/** What `{{#each <key>}}` may name: a key of the root data, or `this.field` of
 *  the item one level out. */
const EACH_KEY = /^(?:this\.)?[\w.]+$/;

/**
 * The root data, plus the item of the innermost block, if any.
 *
 * `item` is BOXED rather than merely optional. The box is what separates "not
 * inside a block" from "inside a block whose element happens to be undefined",
 * and it is why a top-level `{{this}}` throws by name instead of rendering the
 * string `undefined`.
 */
type Scope = { data: Record<string, unknown>; item?: { value: unknown } };

/**
 * `this` and `this.field` bind to the INNERMOST item; every other key falls
 * through to the root data, which is what keeps `{{slug}}` readable from inside
 * three levels of iteration. There is no `../` — an outer item is not reachable
 * from an inner block, and asking for one is a missing-key error, not a silent
 * empty string.
 */
function resolve(key: string, scope: Scope): { found: boolean; value: unknown } {
  const box = scope.item;
  if (box) {
    if (key === 'this') return { found: true, value: box.value };
    if (key.startsWith('this.')) {
      const field = key.slice('this.'.length);
      const holder = box.value;
      // The `typeof` guard is load-bearing: `field in 'a string'` throws, and
      // iterating an array of strings is the ordinary case.
      if (typeof holder === 'object' && holder !== null && field in holder) {
        return { found: true, value: (holder as Record<string, unknown>)[field] };
      }
      return { found: false, value: undefined };
    }
  }
  return key in scope.data
    ? { found: true, value: scope.data[key] }
    : { found: false, value: undefined };
}

/** Substitutes the placeholders in one span of literal text. Only the VALUE is
 *  escaped; the surrounding template text is emitted as written. */
function fill(text: string, scope: Scope, escape: Escape, where: string): string {
  return text.replace(PLACEHOLDER, (_match, key: string) => {
    const hit = resolve(key, scope);
    if (!hit.found) {
      throw new Error(`agency new: unknown placeholder {{${key}}} in ${where}`);
    }
    return escape(String(hit.value));
  });
}

/**
 * The body of the block whose opener ended at `from`, found by counting depth
 * to the `{{/each}}` that MATCHES it rather than to the first one.
 *
 * This is the whole of defect #2. The regex it replaces —
 * `/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g` — is non-greedy, so an outer
 * block ended at the INNER close: the outer body was truncated, the inner
 * marker was copied into the generated file, and `{{this}}` — still bound to
 * the outer item, an object — stringified. Measured 2026-09-10 against Plan A's
 * own `profiles.ts.hbs`:
 *   caps: [{{#each this.caps}}'[object Object]',] },{{/each}}
 */
function bodyOf(source: string, from: number, where: string): { text: string; end: number } {
  const scan = marker();
  scan.lastIndex = from;
  // Depth moves by exactly one per marker, so `=== 0` is not a weaker test than
  // `< 1` — and `agency/no-decimal-comparison` bans the relational operators
  // workspace-wide because it cannot tell a nesting depth from a money string.
  let depth = 0;
  let found = scan.exec(source);
  while (found) {
    if ((found[1] ?? '').startsWith('#each')) depth += 1;
    else if (depth === 0) return { text: source.slice(from, found.index), end: scan.lastIndex };
    else depth -= 1;
    found = scan.exec(source);
  }
  throw new Error(`agency new: unclosed {{#each}} in ${where}`);
}

/**
 * Renders `source` in `scope`, recursing once per block and once per item.
 *
 * Text between markers is substituted exactly once, in the scope it was written
 * in. The previous renderer expanded the blocks and then ran a second
 * substitution pass over the result, which meant a value that itself contained
 * `{{` was re-read as a template.
 */
function expand(source: string, scope: Scope, escape: Escape, where: string): string {
  const scan = marker();
  let out = '';
  let cursor = 0;
  let found = scan.exec(source);
  while (found) {
    out += fill(source.slice(cursor, found.index), scope, escape, where);

    const text = found[1] ?? '';
    if (!text.startsWith('#each')) {
      throw new Error(`agency new: {{/each}} with no {{#each}} in ${where}`);
    }

    const key = text.slice('#each'.length).trim();
    const named = key ? `{{#each ${key}}}` : '{{#each}}';
    if (!EACH_KEY.test(key)) {
      throw new Error(`agency new: ${named} in ${where} names nothing to iterate`);
    }

    const body = bodyOf(source, scan.lastIndex, where);
    const items = resolve(key, scope).value;
    if (!Array.isArray(items)) {
      throw new Error(`agency new: ${named} in ${where} has no array to iterate`);
    }
    out += items
      .map((value) => expand(body.text, { data: scope.data, item: { value } }, escape, where))
      .join('');

    cursor = body.end;
    scan.lastIndex = body.end;
    found = scan.exec(source);
  }
  return out + fill(source.slice(cursor), scope, escape, where);
}

/**
 * Instantiate one template file.
 *
 * Exported for `new.test.ts` and for nothing else in the shipped path: the
 * scaffolder's own data is one flat array of `{ id, label }`, so the scope
 * popping and the per-level escaping above are unreachable through `newMock`.
 * Leaving the deepest branch of a parser exercised only indirectly is how
 * `[object Object]` reached a generated mock in the first place.
 */
export function render(
  source: string,
  data: Record<string, unknown>,
  escape: Escape,
  where: string,
): string {
  const filled = expand(source, { data }, escape, where);

  // Every construct the renderer understands is gone by now — blocks included,
  // malformed openers included. Anything left is a typo or a spelling no marker
  // pattern matches, both of which the plan's renderer wrote into the mock.
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
    cpSync(template, dir, { recursive: true, filter: (src) => !isDropping(src) });

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
