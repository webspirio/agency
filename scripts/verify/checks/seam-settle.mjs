#!/usr/bin/env node
/**
 * A CUSTOM AXIOS ADAPTER OWNS STATUS HANDLING, and the whole seam rests on it.
 *
 * Verified in axios 1.20.0: `dispatchRequest.js` calls `adapter(config).then(...)`
 * and contains ZERO references to `settle` — which is where `validateStatus` lives
 * and which each BUILT-IN adapter calls itself. So the mock adapter must do its own
 * status handling, and **one that resolves a 409 delivers it to TanStack Query as a
 * SUCCESS**: the error branch never runs, the screen renders `undefined`, and nothing
 * anywhere is red. The same shape as a 2xx refusal status, one layer down.
 *
 * This was PROSE in CLAUDE.md with an instruction to run a grep by hand, in a file
 * whose first rule is that a standard propagates as something the scaffolder writes
 * or a check that goes red, never as prose. It was the clearest violation of that
 * rule in the repo.
 *
 * SKIPPED, not FAILED, when axios is absent: a fresh checkout before `pnpm install`
 * has no node_modules, and reporting FAILED there would assert something about axios
 * that was never read. The registry maps exit 2 onto SKIPPED.
 *
 *   node scripts/verify/checks/seam-settle.mjs [--root DIR]
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const at = process.argv.indexOf('--root');
const root = at === -1 ? DEFAULT_ROOT : path.resolve(process.argv[at + 1] ?? '.');

const REL = path.join('node_modules', 'axios', 'lib', 'core', 'dispatchRequest.js');
const file = path.join(root, REL);

if (!existsSync(file)) {
  process.stdout.write(
    `seam:settle: SKIPPED — ${REL} is not present under ${root}, so there was nothing to read. ` +
      `A fresh checkout before \`pnpm install\` looks exactly like this.\n`,
  );
  process.exit(2);
}

let source;
try {
  source = readFileSync(file, 'utf8');
} catch (err) {
  process.stderr.write(`seam:settle: could not read ${REL}: ${err}\n`);
  process.exit(127);
}

/* The token, not a parse. `settle` is a module axios imports and calls; any mention
   of it in this file means dispatchRequest is doing status handling that a custom
   adapter would then NOT own. Counting is enough to answer the question the memo
   asked, and a parse would claim more than the answer needs. */
const hits = source.split('settle').length - 1;

if (hits > 0) {
  process.stderr.write(
    `seam:settle: FAILED — ${REL} contains ${hits} reference(s) to \`settle\`.\n` +
      `  axios 1.20.0 had ZERO, which is why a custom adapter owns status handling and the mock\n` +
      `  adapter must throw on a refusal. If dispatchRequest now settles for every adapter, the\n` +
      `  mock adapter's throwing branch needs re-examining: one that RESOLVES a 409 delivers it\n` +
      `  to TanStack Query as a success, the error branch never runs, and nothing goes red.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `seam:settle: ${REL} contains no reference to \`settle\`, so a custom adapter still owns ` +
    `status handling and the mock adapter's throwing branch is load-bearing\n`,
);
