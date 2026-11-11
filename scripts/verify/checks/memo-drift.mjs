#!/usr/bin/env node
/**
 * The memo's proves / does-not-prove table must match the registry exactly.
 *
 * Drift between those two artifacts is a defect in the one pair whose entire job
 * is honesty: if CLAUDE.md claims a check proves something it no longer proves,
 * the memo has become the false-confidence artifact it was written to remove. So
 * the table is GENERATED, not written, and this check compares it byte for byte.
 *
 * Ported from reference/verify/checks/memo-drift.mjs.
 *
 *   node scripts/verify/checks/memo-drift.mjs            check
 *   node scripts/verify/checks/memo-drift.mjs --write    regenerate the region
 *   node scripts/verify/checks/memo-drift.mjs --print    emit the region to stdout
 *   node scripts/verify/checks/memo-drift.mjs --memo P   check some other file
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { CHECKS } from '../registry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const BEGIN = '<!-- BEGIN:verify-table -->';
const END = '<!-- END:verify-table -->';

/**
 * Escaped for a markdown table cell.
 *
 * Throws on an embedded marker: `indexOf(END)` would find the injected copy
 * instead of the real one, and `--write` would append another marker every run
 * and never converge.
 *
 * @param {string} s
 * @returns {string}
 */
function cell(s) {
  if (s.includes('BEGIN:verify-table') || s.includes('END:verify-table')) {
    throw new Error(`a registry string contains the table marker — that would break docs/CHECKS.md: ${s.slice(0, 60)}`);
  }
  return s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

/** @returns {string} */
export function renderTable() {
  const lines = [
    BEGIN,
    '<!-- Generated from scripts/verify/registry.mjs. Do not edit by hand: the `memo:drift`',
    '     row compares this block byte for byte and goes red on any difference.',
    '     To change the text, edit registry.mjs and then run',
    '     `node scripts/verify/checks/memo-drift.mjs --write`. -->',
    '',
    '| check | tier | what a PASS proves | what it still does NOT prove |',
    '| --- | --- | --- | --- |',
  ];
  for (const c of CHECKS) {
    const needs = c.needs ? ` (needs: ${cell(c.needs)})` : '';
    const after = c.after?.length ? ` (after: ${cell(c.after.join(', '))})` : '';
    lines.push(`| \`${c.id}\` | ${c.tier}${needs}${after} | ${cell(c.proves)} | ${cell(c.blindSpot)} |`);
  }
  // A checksum over the RAW strings. cell() collapses whitespace, so two
  // different registry strings can render to one identical table cell and the
  // "byte-identical" claim would hold of the table while the registry had
  // changed underneath it.
  const raw = CHECKS.map(
    (c) =>
      `${c.id}\u0000${c.tier}\u0000${c.needs ?? ''}\u0000${(c.after ?? []).join(',')}\u0000${c.proves}\u0000${c.blindSpot}`,
  ).join('\u0001');
  lines.push('', `<!-- registry-checksum: ${createHash('sha256').update(raw).digest('hex').slice(0, 32)} -->`);
  lines.push(END);
  return lines.join('\n');
}

function main() {
  const write = process.argv.includes('--write');
  const at = process.argv.indexOf('--memo');
  const memoPath = at === -1 ? path.join(ROOT, 'docs', 'CHECKS.md') : path.resolve(process.argv[at + 1] ?? '');

  if (process.argv.includes('--print')) {
    process.stdout.write(`${renderTable()}\n`);
    return;
  }

  let memo;
  try {
    memo = readFileSync(memoPath, 'utf8');
  } catch {
    process.stderr.write(`memo:drift: FAILED\n  no such file: ${memoPath}\n`);
    process.exit(1);
  }

  const start = memo.indexOf(BEGIN);
  const end = memo.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    process.stderr.write(
      `memo:drift: FAILED\n  ${path.relative(ROOT, memoPath)} has no ${BEGIN} … ${END} marker pair.\n` +
        `  Without them the table cannot be generated, and therefore cannot fail to drift.\n`,
    );
    process.exit(1);
  }

  const current = memo.slice(start, end + END.length);
  const expected = renderTable();

  if (write) {
    if (current === expected) {
      process.stdout.write('memo:drift: the table is already current\n');
      return;
    }
    writeFileSync(memoPath, memo.slice(0, start) + expected + memo.slice(end + END.length));
    process.stdout.write(`memo:drift: table regenerated (${CHECKS.length} rows)\n`);
    return;
  }

  if (current !== expected) {
    // Show the FIRST differing line. A whole-table diff is unreadable and gets
    // skimmed, and a skimmed diff is how a wrong `proves` sentence survives.
    const a = current.split('\n');
    const b = expected.split('\n');
    let i = 0;
    while (i < Math.max(a.length, b.length) && a[i] === b[i]) i += 1;
    process.stderr.write(
      `memo:drift: FAILED\n` +
        `  The table in ${path.relative(ROOT, memoPath)} has drifted from scripts/verify/registry.mjs (line ${i + 1}).\n` +
        `  in the memo: ${a[i] ?? '(no such line)'}\n` +
        `  in registry:  ${b[i] ?? '(no such line)'}\n` +
        `  Fix: node scripts/verify/checks/memo-drift.mjs --write\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `memo:drift: the proves / does-not-prove table matches the registry — ${CHECKS.length} rows\n`,
  );
}

main();
