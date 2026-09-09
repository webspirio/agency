import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * The toolchain's own contract — the two declarations in the root manifest that
 * decide WHICH TOOLS the rest of the checks are a verdict about.
 *
 * Both are facts on disk, read with `readFileSync` and compared as strings, so
 * nothing here shells out and nothing here can race the way three parallel
 * repo-wide oxlint runs did. Repo-wide COMMANDS belong in
 * `scripts/verify/registry.mjs`; the `engines` row there measures the running
 * interpreter against the floor. This file measures something that row cannot:
 * whether the two places the repo writes down a node version agree with each
 * other, and whether the linter's version is pinned at all.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const rootPkg = () =>
  JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
    devDependencies?: Record<string, string>;
  };

describe('oxlint is pinned to a version, not to a range', () => {
  /**
   * docs/BUILD-REPORT.md, open defect #7. The manifest asked for `^1.77.0` and
   * resolved to 1.82.0, and the difference was not cosmetic: Plan A Task 3
   * specified the money rules as seven `no-restricted-syntax` selectors, and
   * 1.82 DELETED that rule — `oxlint` rejects the config outright with "Rule
   * 'no-restricted-syntax' not found in plugin 'eslint'". A whole task of the
   * plan was dead on arrival because a caret silently moved the linter under it.
   *
   * The rule set is now a JS plugin (`oxlint-rules.js`) loaded through
   * `jsPlugins`, which is a private-ish surface of the same tool, so the next
   * minor can move it again the same way. oxlint is pinned exactly and the
   * other devDependencies are not, because oxlint is the only one whose OUTPUT
   * IS THE CONTRACT: a caret on `jsdom` changes how a test runs, a caret on
   * oxlint changes which rules exist.
   */
  it('declares an exact version, so a minor cannot move the rule set underneath the config', () => {
    const spec = rootPkg().devDependencies?.oxlint ?? '';
    expect(spec).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('pins the version that is actually installed, so the pin is not a second lie', () => {
    // An exact pin nobody has installed is worse than a caret: it reads as a
    // measurement and is a wish. This compares the manifest against the package
    // on disk, which is the binary `pnpm lint` actually runs.
    const installed = JSON.parse(
      readFileSync(join(REPO, 'node_modules', 'oxlint', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(rootPkg().devDependencies?.oxlint).toBe(installed.version);
  });
});

describe('.nvmrc and engines.node give one answer about node, not two', () => {
  /**
   * docs/BUILD-REPORT.md, open defect #8, one level up from where it was filed.
   *
   * THREE consumers read a node version out of this repo and they read two
   * different files:
   *   - `.claude/hooks/node.sh` takes the major from `.nvmrc` and EXECS that
   *     interpreter, so it decides which node the Stop gate — every check in
   *     the fast tier — actually runs on;
   *   - `scripts/verify/checks/engines.mjs` takes the floor from
   *     `engines.node` and fails when the running major is below it;
   *   - pnpm reads `engines.node` and warns on every single invocation.
   *
   * Measured 2026-09-10: on the PATH interpreter (v22.23.1) `pnpm lint` prints
   * `[WARN] Unsupported engine: wanted: {"node":">=24"}` and exits 0, while the
   * same command under `~/.nvm/versions/node/v24.21.0/bin` prints nothing —
   * i.e. the warning is about the SHELL, and the only durable way to keep the
   * gate's verdict and the manifest's claim about the same runtime is for these
   * two files to name the same major. Nothing enforced that; they agreed by
   * luck. Drift here is silent in the direction that matters: the hook would go
   * on running the `.nvmrc` node and reporting green while the manifest
   * declared a floor nothing had been measured against.
   */
  it('names the same major in both', () => {
    const pinned = /^\s*v?(\d+)/.exec(readFileSync(join(REPO, '.nvmrc'), 'utf8'))?.[1];
    const floor = /^\s*>=\s*v?(\d+)/.exec(rootPkg().engines?.node ?? '')?.[1];
    expect(pinned).toBeDefined();
    expect(floor).toBe(pinned);
  });

  it('states engines.node in the one shape the engines row can evaluate', () => {
    // `scripts/verify/checks/engines.mjs` understands a single `>=N` floor and
    // exits 2 — SKIPPED — on anything else rather than approximating it. That
    // is the right refusal, and it is also a way for this row to stop measuring
    // anything at all without going red: `"^24 || >=22 <25"` turns the row into
    // a permanent skip, and the registry's own comment says a row that never
    // runs reads as coverage. So the shape is pinned here, where a change to it
    // is a red test rather than a quieter table.
    expect(rootPkg().engines?.node ?? '').toMatch(/^>=\d+(\.\d+)*$/);
  });
});
