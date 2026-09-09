/**
 * Content-addressed identity of everything that can change what a check
 * concludes, plus the one predicate that decides whether a stored green may be
 * reused for a new request.
 *
 * Never mtime, and never "is the working tree dirty" — a turn that commits its
 * work leaves a clean tree and would earn a free green.
 *
 * Ported from reference/verify/hash.mjs.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Directory prefixes whose contents feed at least one check. */
const HASHED_PREFIXES = [
  'packages/',
  'templates/',
  'mocks/',
  'scripts/verify/',
  '.claude/',
  '.github/workflows/',
];

/**
 * Exact paths outside those directories.
 *
 * CLAUDE.md is here because it is the ENTIRE INPUT to `memo:drift` and half the
 * input to `docs:truth`. Leaving it out means a hand-edited memo does not change
 * the hash, so `--reuse-if-fresh` serves a cached green and the two checks whose
 * whole job is catching that drift can never run.
 *
 * .gitignore is here because it is what keeps the private/ directory of each mock — real client
 * transcripts and scans — out of a repository whose catalog is shown to OTHER
 * clients. A change to that boundary must never be cache-invisible.
 *
 * oxlint-rules.js is the JS plugin: deleting it makes oxlint exit 1 rather than
 * silently drop five rules, but editing it changes what `lint` means.
 */
const HASHED_EXACT = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'vitest.config.ts',
  'vitest.setup.ts',
  '.oxlintrc.json',
  'oxlint.base.json',
  'oxlint-rules.js',
  '.nvmrc',
  '.gitignore',
  'CLAUDE.md',
]);

/**
 * A NUL byte cannot occur in a POSIX path, so it is the only safe field
 * delimiter. A newline or a colon would let a crafted filename forge a different
 * file list that hashes the same.
 */
const NUL = globalThis.Buffer.from([0]);

/** @param {string} rel @returns {boolean} */
function isHashed(rel) {
  if (HASHED_EXACT.has(rel)) return true;
  if (/^tsconfig[^/]*\.json$/.test(rel)) return true;
  return HASHED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

/** @param {unknown} err @returns {string} */
export function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Tracked files plus untracked-but-not-ignored files. `-o --exclude-standard` is
 * what pulls in a brand-new test or check that has not been committed yet:
 * without it a freshly written failing test would not change the hash, and a
 * stale green would be served over it.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function hashedFiles(root) {
  let raw;
  try {
    raw = execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
      cwd: root,
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`sourceHash: git could not enumerate files: ${errMessage(err)}`);
  }
  // `-c` and `-o` can both name the same path in some states; dedupe before
  // hashing so the digest depends on the SET of files, not on git's listing order.
  const seen = new Set(raw.toString('utf8').split('\u0000').filter(Boolean).filter(isHashed));
  return [...seen].sort();
}

/**
 * @param {string} root
 * @returns {{ hash: string, fileCount: number }}
 */
export function sourceHash(root) {
  const files = hashedFiles(root);
  const outer = createHash('sha256');
  for (const rel of files) {
    outer.update(rel, 'utf8');
    outer.update(NUL);
    let digest = 'ABSENT';
    try {
      digest = createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex');
    } catch {
      // Tracked but removed from the worktree. Recorded as ABSENT rather than
      // skipped, so a deletion is a visible field change and not an invisible
      // shorter list.
    }
    outer.update(digest, 'utf8');
    outer.update(NUL);
  }
  return { hash: outer.digest('hex'), fileCount: files.length };
}

/** @type {Record<string, number>} */
const TIER_RANK = { fast: 0, full: 1 };

/**
 * Does a stored verdict genuinely cover this request?
 *
 * Every clause here is a way a narrow green was once quoted as a wide one. Kept
 * as a pure function precisely so each clause can be exercised without running
 * a single check.
 *
 * @param {any} stored             a parsed .verify/last-run.json
 * @param {{hash: string, tier: string, noSkip: boolean, envKey?: string}} want
 * @returns {boolean}
 */
export function reportCovers(stored, want) {
  if (!stored || stored.schema !== 1) return false;
  if (stored.ok !== true) return false;
  if (stored.sourceHash !== want.hash) return false;
  // A green recorded at `fast` says nothing about `full`.
  if ((TIER_RANK[stored.tier] ?? -1) < (TIER_RANK[want.tier] ?? 0)) return false;
  // A green from a one-check run is not a verdict on the tree.
  if (stored.scope?.only) return false;
  // A green whose `after` dependencies were never evaluated is not one either.
  if (stored.scope?.afterDepsFullyEvaluated !== true) return false;
  // A green that tolerated skips cannot satisfy a request that does not.
  if (want.noSkip && stored.noSkip !== true) return false;
  // A green measured under a different environment is a different verdict.
  if (want.envKey !== undefined && stored.envKey !== want.envKey) return false;
  return true;
}

// Diagnostic entry point: `node scripts/verify/hash.mjs` prints exactly which
// files feed the freshness decision. Without this the hash is an opaque number
// and "why was my green reused?" has no answer.
if (process.argv[1]?.endsWith('hash.mjs')) {
  // `node scripts/verify/hash.mjs | head -1` closes the pipe early; without this
  // the diagnostic dies with an unhandled EPIPE and a stack trace.
  process.stdout.on('error', () => process.exit(0));
  const root = path.resolve(import.meta.dirname, '..', '..');
  const { hash, fileCount } = sourceHash(root);
  process.stdout.write(`sourceHash ${hash}\n${fileCount} files:\n`);
  for (const f of hashedFiles(root)) process.stdout.write(`  ${f}\n`);
}
