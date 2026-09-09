#!/usr/bin/env node
/**
 * The runner. Thin on purpose — the registry holds the judgement, this holds the
 * mechanics: five statuses that never collapse into each other, a
 * process-group-safe timeout, a report whose SCOPE travels with its verdict, and
 * a footer that prints the blind spots whether the run was green or red.
 *
 * Usage:
 *   node scripts/verify/run.mjs [--tier fast|full] [--no-skip] [--only a,b]
 *                               [--json] [--timeout-ms N]
 *
 * Exit codes: 0 = nothing blocking, 1 = something blocking, or the runner itself
 * failed. The runner failing is NOT the same as the tree being green, and must
 * never be presentable as one.
 *
 * Reduced from reference/verify/run.mjs (703 lines) to what this repo can
 * actually falsify today. The properties kept are the ones that file's own
 * comments record as having been got wrong first: killing the process GROUP
 * rather than the shell, printing blind spots on the paths production takes,
 * and refusing a boolean flag that was handed a value.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CHECKS, PRECONDITIONS, checkById, inTier } from './registry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const REPORT_DIR = path.join(ROOT, '.verify');
const REPORT_PATH = path.join(REPORT_DIR, 'last-run.json');
const REPORT_SCHEMA = 1;

/**
 * Five statuses. Do not collapse them: reporting "lint FAILED" when the linter
 * was merely absent from PATH asserts something about the code that was never
 * tested.
 */
const PASSED = 'PASSED';
const FAILED = 'FAILED';
const SKIPPED = 'SKIPPED';
const NOT_RUN = 'NOT_RUN';
const UNRUNNABLE = 'UNRUNNABLE';

const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const paint = (code, s) => (useColor ? `[${code}m${s}[0m` : s);

/**
 * Glyph AND word differ per status, so the table stays unambiguous with colour
 * stripped — in a log file, a CI annotation, or a hook's stderr.
 */
const DISPLAY = {
  PASSED: { label: '✓ PASSED    ', color: '32' },
  FAILED: { label: '✗ FAILED    ', color: '31' },
  SKIPPED: { label: '– SKIPPED   ', color: '33' },
  NOT_RUN: { label: '∅ NOT_RUN   ', color: '35' },
  UNRUNNABLE: { label: '! UNRUNNABLE', color: '91' },
};

/** @param {string} msg @returns {never} */
function fatal(msg) {
  process.stderr.write(`verify: ${msg}\n`);
  process.exit(1);
}

function isBlocking(status, noSkip) {
  if (status === PASSED) return false;
  // A precondition that is genuinely absent is not evidence about the code. In
  // the CI form there is no such excuse: the environment is supposed to provide it.
  if (status === SKIPPED) return noSkip;
  return true;
}

/**
 * Strict parsing: an unknown flag is an error, never a silent no-op. A typo in
 * `--no-skip` that quietly disabled it would be invisible for as long as nobody
 * looked.
 */
function parseArgs(argv) {
  const o = { tier: 'fast', noSkip: false, only: null, json: false, timeoutMs: 300_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const value = () => {
      const v = eq === -1 ? argv[(i += 1)] : arg.slice(eq + 1);
      if (v === undefined) fatal(`${name} needs a value`);
      return v;
    };
    // A boolean flag given `=value` used to be accepted with the value ignored,
    // so a templated `--no-skip=${CI}` with CI=false silently turned the gate
    // into `exit 0`.
    const rejectValue = () => {
      if (eq !== -1) fatal(`${name} is a boolean flag and takes no value (got ${arg})`);
    };
    switch (name) {
      case '--tier': {
        const v = value();
        if (v !== 'fast' && v !== 'full') fatal(`--tier must be fast or full, got ${v}`);
        o.tier = v;
        break;
      }
      case '--no-skip':
        rejectValue();
        o.noSkip = true;
        break;
      case '--json':
        rejectValue();
        o.json = true;
        break;
      case '--only':
        o.only = value()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--timeout-ms': {
        const n = globalThis.parseInt(value(), 10);
        if (!globalThis.Number.isFinite(n) || n <= 0) fatal('--timeout-ms must be a positive number');
        o.timeoutMs = n;
        break;
      }
      default:
        fatal(`unknown flag ${name}`);
    }
  }
  if (o.only) {
    const unknown = o.only.filter((id) => !checkById(id));
    if (unknown.length) fatal(`unknown check id(s): ${unknown.join(', ')}`);
  }
  return o;
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * `detached: true` gives the shell its own process group, so the negative pid
 * reaches every descendant. Killing only the shell is the trap that records
 * "timed out after 300s" while the leaf process keeps running.
 */
function killGroup(child) {
  if (typeof child.pid !== 'number') return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* group already gone */
  }
  const hard = globalThis.setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already reaped */
    }
  }, 2000);
  hard.unref();
}

function runCommand(cmd, timeoutMs) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const ms = () => globalThis.Number(process.hrtime.bigint() - started) / 1e6;
    let child;
    try {
      child = spawn(cmd, {
        cwd: ROOT,
        shell: '/bin/sh',
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
    } catch (err) {
      resolve({ outcome: 'spawn-error', code: null, out: '', err: String(err), ms: 0 });
      return;
    }
    // Without setEncoding, a multi-byte character split across two data events
    // becomes U+FFFD, so the text a human reads to diagnose a failure is corruptible.
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    let out = '';
    let errOut = '';
    let timedOut = false;
    let settled = false;
    child.stdout?.on('data', (d) => (out += d));
    child.stderr?.on('data', (d) => (errOut += d));
    const timer = globalThis.setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, timeoutMs);
    const finish = (res) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(res);
    };
    child.on('error', (err) =>
      finish({ outcome: 'spawn-error', code: null, out, err: String(err), ms: ms() }),
    );
    child.on('close', (code) =>
      finish({ outcome: timedOut ? 'timeout' : 'exited', code, out, err: errOut, ms: ms() }),
    );
  });
}

/**
 * The shell's own "I could not start this" signals, kept deliberately narrow. A
 * loose pattern here relabels a real FAILED as UNRUNNABLE, which is the quieter
 * and therefore worse direction to be wrong in.
 */
const SHELL_CANNOT_START = /(?:^|\n)(?:\/bin\/)?sh: (?:\d+: )?[^\n]*(?:command )?not found/;
const PNPM_MISSING_SCRIPT = /(?:Command|Script) "[^"]+" not found|ERR_PNPM_NO_SCRIPT/i;
const NODE_CANNOT_LOAD = /\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find module|Cannot find package)\b/;

function classify(res) {
  if (res.outcome === 'spawn-error') return UNRUNNABLE;
  // A timeout DID start, so it is not UNRUNNABLE. It ran and did not succeed.
  if (res.outcome === 'timeout') return FAILED;
  if (res.code === 0) return PASSED;
  if (res.code === 127 || res.code === 126) return UNRUNNABLE;
  const text = `${res.out}\n${res.err}`;
  if (SHELL_CANNOT_START.test(text) || PNPM_MISSING_SCRIPT.test(text)) return UNRUNNABLE;
  if (NODE_CANNOT_LOAD.test(text)) return UNRUNNABLE;
  return FAILED;
}

function selectChecks(opts) {
  const inScope = CHECKS.filter((c) => inTier(c.tier, opts.tier));
  if (!opts.only) return inScope;
  const wanted = new Set(opts.only);
  // A --only run deliberately does NOT pull in `after` dependencies. Doing so
  // silently would make `--only lint` a full run; instead the report records
  // that the dependencies were not evaluated, so this green cannot be read as a
  // wider verdict.
  return CHECKS.filter((c) => wanted.has(c.id));
}

const dur = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${globalThis.Math.round(ms)}ms`);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const selected = selectChecks(opts);
  if (selected.length === 0) fatal('no checks selected — refusing to report a green');

  const started = new Date();
  const statusById = new Map();
  const rows = [];
  const selectedIds = new Set(selected.map((c) => c.id));
  let afterDepsFullyEvaluated = true;
  const failureDetail = [];

  for (const check of selected) {
    let status;
    let reason = null;
    let ms = 0;
    let exitCode = null;

    const unmetDeps = (check.after ?? []).filter((dep) => {
      if (!selectedIds.has(dep)) {
        afterDepsFullyEvaluated = false;
        return false;
      }
      return statusById.get(dep) !== PASSED;
    });

    const pre = check.needs ? PRECONDITIONS[check.needs] : null;
    const preMet = check.needs ? ((await pre?.probe()) ?? false) : true;

    if (unmetDeps.length) {
      status = NOT_RUN;
      reason = `dependency did not pass: ${unmetDeps.join(', ')} — this check was not run`;
    } else if (!preMet) {
      status = SKIPPED;
      reason = pre ? pre.describe : `unknown precondition ${check.needs}`;
    } else {
      const res = await runCommand(check.cmd, opts.timeoutMs);
      status = classify(res);
      ms = res.ms;
      exitCode = res.code;
      if (res.outcome === 'timeout') reason = `timed out after ${dur(opts.timeoutMs)}`;
      if (status === UNRUNNABLE) reason = 'the command could not be started (not on PATH / no such script)';
      if (status !== PASSED) failureDetail.push({ id: check.id, text: tailOf(res) });
    }

    statusById.set(check.id, status);
    rows.push({
      id: check.id,
      status,
      // The cause stays in `status`; the consequence lives in `blocking`. Keeping
      // both means the table can be unambiguous without collapsing five states
      // into two.
      blocking: isBlocking(status, opts.noSkip),
      ms,
      exitCode,
      reason,
      proves: check.proves,
      blindSpot: check.blindSpot,
    });
  }

  const blocking = rows.filter((r) => r.blocking);
  const report = {
    schema: REPORT_SCHEMA,
    timestamp: started.toISOString(),
    head: gitHead(),
    node: process.version,
    tier: opts.tier,
    noSkip: opts.noSkip,
    // Scope travels WITH the verdict so a narrow green cannot be quoted as a wide one.
    scope: { only: opts.only, checkIds: selected.map((c) => c.id), afterDepsFullyEvaluated },
    ok: blocking.length === 0,
    checks: rows,
  };

  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    // Write-then-rename: two concurrent runners would otherwise interleave, and a
    // reader catching a partial write gets truncated JSON.
    const tmp = `${REPORT_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`);
    renameSync(tmp, REPORT_PATH);
  } catch (err) {
    process.stderr.write(`verify: could not write ${REPORT_PATH}: ${err}\n`);
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printTable(report, failureDetail);
  }
  // exitCode rather than exit(): process.exit can truncate a large async pipe write.
  process.exitCode = report.ok ? 0 : 1;
}

function tailOf(res) {
  return `${res.out}${res.err}`.trimEnd().split('\n').slice(-25).join('\n');
}

function printTable(report, failureDetail) {
  const w = globalThis.Math.max(...report.checks.map((c) => c.id.length));
  const scopeNote = report.scope.only ? `--only ${report.scope.only.join(',')}` : `tier ${report.tier}`;
  process.stdout.write(
    `\nverify · ${scopeNote}${report.noSkip ? ' · --no-skip' : ''} · HEAD ${report.head.slice(0, 8)} · node ${report.node}\n\n`,
  );

  for (const c of report.checks) {
    // The glyph keeps the STATUS; a separate marker carries the CONSEQUENCE.
    // Painting a blocking row as FAILED would make NOT_RUN and UNRUNNABLE
    // unreachable, collapsing five states into two — the one thing this column
    // must never do.
    const d = DISPLAY[c.status];
    const mark = c.blocking ? paint('31', '⛔') : '  ';
    const time = c.ms ? `  ${dur(c.ms)}` : '';
    process.stdout.write(`  ${mark} ${paint(d.color, d.label)}  ${c.id.padEnd(w)}${time}\n`);
    const note =
      c.blocking && c.status === SKIPPED
        ? `blocking under --no-skip${c.reason ? `: ${c.reason}` : ''}`
        : c.reason;
    if (note) process.stdout.write(`  ${' '.repeat(17)}  ${paint('90', note)}\n`);
  }

  const counts = {};
  for (const c of report.checks) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const blockingCount = report.checks.filter((c) => c.blocking).length;
  process.stdout.write(
    `\n  ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}` +
      `${blockingCount ? paint('31', ` · ⛔ ${blockingCount} blocking`) : ''}\n`,
  );

  const skipped = report.checks.filter((c) => c.status === SKIPPED);
  if (skipped.length) {
    // Said out loud, never folded into "all green".
    process.stdout.write(
      paint(
        '33',
        `\n  NOTE: ${skipped.length} check(s) skipped — ${skipped.map((c) => c.id).join(', ')}. ` +
          `This is NOT "all green": nothing was established about them.\n`,
      ),
    );
  }
  if (report.scope.only) {
    process.stdout.write(
      paint(
        '33',
        `\n  SCOPE: this run was limited (${report.scope.only.join(', ')}). A green here is a ` +
          `verdict about those checks, not about the tree.\n`,
      ),
    );
  }
  if (report.scope.afterDepsFullyEvaluated !== true) {
    process.stdout.write(
      paint(
        '33',
        `\n  NOTE: some \`after\` dependencies were not evaluated in this run — the rows that ` +
          `depend on them are green without their precondition being confirmed.\n`,
      ),
    );
  }

  for (const f of failureDetail) {
    process.stdout.write(paint('31', `\n  ── ${f.id} ─────────────────────────────\n`));
    process.stdout.write(`${f.text.split('\n').map((l) => `  ${l}`).join('\n')}\n`);
  }

  printBlindSpots(report);
}

/**
 * The footer prints on green as well as red. A table of passes without its blind
 * spots is precisely the false-confidence artifact this layer exists to remove —
 * and in the harness this was ported from, the two paths production actually
 * used both returned before reaching it, so the property held of the code and
 * not of the layer.
 */
function printBlindSpots(report) {
  process.stdout.write(paint('1', '\n  What this does NOT prove\n'));
  for (const c of report.checks) {
    process.stdout.write(`\n  ${c.id}\n${wrap(c.blindSpot, 4, 92)}\n`);
  }
  process.stdout.write(paint('90', `\n  Report: .verify/last-run.json · ok=${report.ok}\n\n`));
}

function wrap(text, indent, width) {
  const pad = ' '.repeat(indent);
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length + indent > width) {
      lines.push(pad + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(pad + line);
  return lines.join('\n');
}

main().catch((err) => {
  // The runner failing is not the same as the tree being red, and must never be
  // presentable as green.
  process.stderr.write(`verify: runner error: ${err?.stack ?? err}\n`);
  process.exit(1);
});
