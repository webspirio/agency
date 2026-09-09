#!/usr/bin/env node
/**
 * PostToolUse: lint the file that was just edited, and say so immediately rather
 * than at the end of the turn. Advisory only — it never blocks; the Stop gate is
 * the blocking layer. Its value is latency: a rule violation reported now costs
 * one edit to fix, and reported forty edits later costs a bisect.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.stdout.write('{}\n');
  process.exit(0);
}

const file = input?.tool_input?.file_path;
if (typeof file !== 'string' || !/\.(ts|tsx|js|jsx|mjs)$/.test(file)) {
  process.stdout.write('{}\n');
  process.exit(0);
}

const rel = path.relative(ROOT, file);
// Only lint what the workspace lints: `pnpm lint` is given an explicit path
// allowlist, and a hook that reports on reference/ would be pure noise.
if (rel.startsWith('..') || !/^(packages|templates|mocks|scripts)\//.test(rel)) {
  process.stdout.write('{}\n');
  process.exit(0);
}

const res = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'oxlint'), ['--max-warnings=0', rel], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 30_000,
});

if (res.status === 0 || typeof res.status !== 'number') {
  process.stdout.write('{}\n');
  process.exit(0);
}

const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd().split('\n').slice(0, 20).join('\n');
process.stdout.write(
  `${JSON.stringify({
    systemMessage:
      `oxlint on ${rel}:\n${out}\n\nFix the code, not the rule. ` +
      'Exemptions live in .oxlintrc.json as per-rule overrides and are ratcheted against ' +
      'scripts/verify/baselines/lint-exempt.json — adding one is a visible, counted decision.',
  })}\n`,
);
