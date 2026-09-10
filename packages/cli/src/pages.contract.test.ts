import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * The Pages workflow, pinned against the drift it can silently suffer.
 *
 * The published site is a mock scaffolded from the template on every run, so
 * this deploy is the day-4 gate running continuously. That only holds while the
 * workflow keeps using the same node, the same package manager and the same
 * scaffolder entry point the rest of the repo is checked against — and a CI file
 * is exactly the kind of thing that gets a version hardcoded into it during an
 * unrelated fix, after which it builds on a runtime nothing else verifies.
 *
 * These are textual assertions over a config file, which is what a config file
 * admits. The YAML itself is parsed by Actions; nothing here can prove it is
 * well-formed.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const WORKFLOW = readFileSync(join(REPO, '.github', 'workflows', 'pages.yml'), 'utf8');

/**
 * The workflow with its `#` comment lines removed.
 *
 * Assertions about what the workflow DOES must read only what it does. The
 * first version of the 404.html check matched the comment explaining why no
 * 404.html is needed — a rule firing on the prose that documents it, which is
 * the same false-positive class the money rules hit on pixel arithmetic.
 */
const DIRECTIVES = WORKFLOW.split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n');

const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

describe('the Pages workflow cannot drift from the toolchain the repo verifies', () => {
  it('reads the node major from .nvmrc rather than hardcoding one', () => {
    // `engines` is a check row precisely because a green produced on the wrong
    // node major is a verdict about a runtime nothing else uses.
    expect(WORKFLOW).toMatch(/node-version-file:\s*\.nvmrc/);
    expect(DIRECTIVES).not.toMatch(/node-version:\s*['"]?\d/);
  });

  it('takes pnpm from packageManager via corepack, not a pinned action input', () => {
    expect(WORKFLOW).toMatch(/corepack enable/);
    expect(DIRECTIVES).not.toMatch(/pnpm-version:\s*['"]?\d/);
    expect(read('package.json')).toMatch(/"packageManager":\s*"pnpm@/);
  });

  it('contains no bare control or invisible characters', () => {
    // A zero-width non-joiner at byte 0 makes the whole file fail to parse, and
    // it is invisible in every diff view. This repo has already shipped raw NUL,
    // SOH and ESC bytes into a source file once.
    // Built from codepoints rather than written as a regex: a control-character
    // class is itself `eslint(no-control-regex)`, and the rule is right — the
    // way to match a control character on purpose is to name it, not to smuggle
    // a range past a linter. Range comparisons are out too, for the same reason
    // `agency/no-decimal-comparison` fires on `code < 32` in a file it cannot
    // type-check. C0 controls except tab/LF/CR, plus the zero-width and
    // non-breaking characters that survive a copy-paste invisibly.
    const FORBIDDEN = new Set(
      [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
        28, 29, 30, 31, 0x00a0, 0x200b, 0x200c, 0x200d, 0xfeff,
      ].map((code) => String.fromCodePoint(code)),
    );
    const found = [...WORKFLOW].filter((c) => FORBIDDEN.has(c));
    expect(found).toEqual([]);
  });
});

describe('the site is built the way Pages serves it', () => {
  it('derives the base path from the repo name instead of hardcoding it', () => {
    // Pages serves a project site under /<repo>/. Hardcoding `/agency/` means a
    // rename silently breaks every asset URL while the build stays green.
    expect(WORKFLOW).toMatch(/MOCK_BASE="?\/\$\{\{\s*github\.event\.repository\.name\s*\}\}\//);
  });

  it('builds through MOCK_BASE, which is the knob the template actually reads', () => {
    expect(read('templates/mock/vite.config.ts')).toMatch(/base:\s*process\.env\.MOCK_BASE\s*\?\?\s*'\/'/);
  });

  it('needs no 404.html, because the router is hash-based', () => {
    // SPEC 11 chose createHashRouter so the hosting topology stays reversible:
    // no rewrite rule, no 404.html, no host config. If this ever becomes a
    // browser router, Pages deep links start 404ing and this assertion is the
    // warning.
    expect(read('templates/mock/src/app/router.tsx')).toMatch(/createHashRouter/);
    expect(DIRECTIVES).not.toMatch(/404\.html/);
  });

  it('uploads the directory the build actually writes', () => {
    const slug = /agency\.mjs new (\S+)/.exec(WORKFLOW)?.[1];
    expect(slug).toBeTruthy();
    expect(WORKFLOW).toMatch(new RegExp(`path:\\s*mocks/${slug}/dist`));
    expect(WORKFLOW).toMatch(new RegExp(`--filter ${slug} build`));
  });
});

describe('a red tree never reaches the site', () => {
  it('runs the verify gate before it scaffolds or builds anything', () => {
    const verifyAt = WORKFLOW.indexOf('pnpm verify');
    const scaffoldAt = WORKFLOW.indexOf('agency.mjs new');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(scaffoldAt).toBeGreaterThan(verifyAt);
  });

  it('asserts kit styling reached the emitted CSS rather than trusting the build', () => {
    // The failure the whole gate was designed around is completely silent: with
    // the @source glob wrong the build succeeds, the app runs, and every kit
    // surface renders unstyled. "Confirm it by eye" is not a check.
    expect(WORKFLOW).toMatch(/bg-card/);
    expect(WORKFLOW).toMatch(/dist\/assets\/\*\.css/);
  });

  it('scaffolds from the template instead of committing a dist', () => {
    // A committed demo rots silently while the template moves underneath it.
    // Scaffolding on every run is what makes this deploy a continuous gate.
    expect(WORKFLOW).toMatch(/agency\.mjs new/);
    const slug = /agency\.mjs new (\S+)/.exec(WORKFLOW)?.[1] ?? 'demo';
    expect(() => readFileSync(join(REPO, 'mocks', slug, 'package.json'))).toThrow();
  });

  it('grants only the permissions a Pages deploy needs', () => {
    expect(WORKFLOW).toMatch(/contents:\s*read/);
    expect(WORKFLOW).toMatch(/pages:\s*write/);
    expect(WORKFLOW).toMatch(/id-token:\s*write/);
    expect(DIRECTIVES).not.toMatch(/contents:\s*write/);
  });
});
