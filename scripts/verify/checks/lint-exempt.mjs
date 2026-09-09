#!/usr/bin/env node
/**
 * The oxlint exemption list, ratcheted.
 *
 * `.oxlintrc.json` carries an `overrides` block that switches named `agency/*`
 * rules off for named files. Nothing enforced that the list only shrinks, and a
 * one-directional suppression wearing ratchet language is exactly the
 * distinction this layer exists to make. Ported from
 * `reference/verify/checks/lint-exempt-ratchet.mjs`.
 *
 * So: lift each exemption, ask oxlint what it finds, and require the answer to
 * equal the baseline EXACTLY.
 *   - a newly exempted file            -> red
 *   - an exemption that finds nothing  -> stale -> red
 *   - a different number of findings   -> red (a whole-file "off" would
 *                                        otherwise hide a SECOND offence in an
 *                                        already-exempted file)
 *
 * Usage:
 *   node scripts/verify/checks/lint-exempt.mjs           check
 *   node scripts/verify/checks/lint-exempt.mjs --write   re-record the baseline
 *
 * `--write` is a deliberate, visible act: it rewrites a committed file, so the
 * decision to widen the list shows up in review as a diff rather than as a
 * silently absent failure.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const CONFIG = path.join(ROOT, '.oxlintrc.json');
const BASELINE = path.join(ROOT, 'scripts', 'verify', 'baselines', 'lint-exempt.json');
const OXLINT = path.join(ROOT, 'node_modules', '.bin', 'oxlint');

/** @param {string[]} lines @returns {never} */
function fail(lines) {
  process.stderr.write('lint-exempt: FAILED\n');
  for (const l of lines) process.stderr.write(`  ${l}\n`);
  process.exit(1);
}

/** `.oxlintrc.json` is JSONC: oxlint accepts `//`, JSON.parse does not. */
const stripComments = (text) =>
  text
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');

/** @returns {{file: string, rules: string[]}[]} what the config exempts today */
function exemptions() {
  const cfg = JSON.parse(stripComments(readFileSync(CONFIG, 'utf8')));
  /** @type {Map<string, Set<string>>} */
  const byFile = new Map();
  for (const o of cfg.overrides ?? []) {
    const off = Object.entries(o.rules ?? {})
      .filter(([name, level]) => name.startsWith('agency/') && level === 'off')
      .map(([name]) => name);
    if (off.length === 0) continue;
    for (const file of o.files ?? []) {
      byFile.set(file, new Set([...(byFile.get(file) ?? []), ...off]));
    }
  }
  return [...byFile].map(([file, rules]) => ({ file, rules: [...rules] }));
}

/**
 * How many findings `rules` produce on `file` with the exemption lifted.
 * A throwaway config with no `overrides` is the only way to ask the question —
 * `--deny` cannot re-enable a rule an override turned off.
 *
 * @param {string} file @param {string[]} rules @returns {number}
 */
function findingsWithout(file, rules) {
  const cfg = path.join(mkdtempSync(path.join(tmpdir(), 'agency-ratchet-')), 'cfg.json');
  writeFileSync(
    cfg,
    JSON.stringify({
      jsPlugins: [path.join(ROOT, 'oxlint-rules.js')],
      rules: Object.fromEntries(rules.map((r) => [r, 'error'])),
    }),
  );
  // oxlint exits 1 whenever it reports anything, which is the normal path here:
  // the whole question is how many findings the lifted exemption produces.
  let raw;
  try {
    raw = execFileSync(OXLINT, ['--config', cfg, '--format=json', file], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (err) {
    raw = err.stdout;
    if (typeof raw !== 'string' || raw.length === 0) {
      fail([`oxlint could not lint ${file}: ${err.stderr || err.message}`]);
    }
  }
  return (JSON.parse(raw).diagnostics ?? []).length;
}

function main() {
  const write = process.argv.includes('--write');
  const current = exemptions().map((e) => ({ ...e, findings: findingsWithout(e.file, e.rules) }));

  if (write) {
    /** @type {{entries?: {file: string, reason?: string}[]}} */
    let prior = { entries: [] };
    try {
      prior = JSON.parse(readFileSync(BASELINE, 'utf8'));
    } catch {
      /* first run */
    }
    const reasons = new Map((prior.entries ?? []).map((e) => [e.file, e.reason]));
    writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          note:
            'Files exempted from named agency/* rules in .oxlintrc.json, with the number of ' +
            'findings each exemption suppresses. The ratchet is bidirectional: a new file is ' +
            'red, a stale exemption is red, a changed count is red. Regenerate with ' +
            '`node scripts/verify/checks/lint-exempt.mjs --write` and say why in the commit.',
          entries: current.map((e) => ({
            ...e,
            reason: reasons.get(e.file) ?? 'TODO: say why this file needs the exemption.',
          })),
        },
        null,
        2,
      )}\n`,
    );
    process.stdout.write(`lint-exempt: wrote ${current.length} entries to ${path.relative(ROOT, BASELINE)}\n`);
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch (err) {
    fail([`cannot read the baseline: ${err instanceof Error ? err.message : String(err)}`]);
  }

  const recorded = new Map((baseline.entries ?? []).map((e) => [e.file, e]));
  const problems = [];

  for (const e of current) {
    const was = recorded.get(e.file);
    if (!was) {
      problems.push(`NEW exemption not in the baseline: ${e.file} (${e.rules.join(', ')})`);
      continue;
    }
    if (e.findings === 0) {
      problems.push(`STALE: ${e.file} suppresses nothing — delete the exemption`);
    } else if (e.findings !== was.findings) {
      problems.push(`COUNT changed for ${e.file}: baseline ${was.findings}, now ${e.findings}`);
    }
    const wasRules = [...(was.rules ?? [])].join(',');
    const nowRules = [...e.rules].join(',');
    if (wasRules !== nowRules) {
      problems.push(`RULES changed for ${e.file}: baseline [${wasRules}], now [${nowRules}]`);
    }
    recorded.delete(e.file);
  }
  for (const file of recorded.keys()) {
    problems.push(`REMOVED from the config but still in the baseline: ${file}`);
  }

  if (problems.length) {
    problems.push('', 'If the change is intended: node scripts/verify/checks/lint-exempt.mjs --write');
    fail(problems);
  }

  const total = current.reduce((n, e) => n + e.findings, 0);
  process.stdout.write(
    `lint-exempt: ${current.length} exemptions suppressing ${total} findings, all accounted for\n`,
  );
}

main();
