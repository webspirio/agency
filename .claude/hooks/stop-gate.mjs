#!/usr/bin/env node
/**
 * The gate. Runs on `Stop` — the only blocking layer.
 *
 * This is the propagation doctrine's second clause made operational: a standard
 * survives as something the scaffolder writes, or as a check that goes red.
 * `pnpm typecheck` shipped red for eight commits in this repo because the only
 * thing running it was a human remembering to. This hook is what remembers.
 *
 * Policy:
 *  - fails CLOSED on check failures — the turn does not end green over a red tree;
 *  - fails OPEN on its OWN errors, and loudly, never a bare `|| exit 0`;
 *  - caps consecutive blocks at 2 per prompt, then lets the turn end while
 *    telling the agent to state the red result out loud. A gate that can block
 *    forever gets disabled, and a disabled gate is the failure mode SPEC 17
 *    names as the abandon signal.
 *
 * THE JSON SHAPE IS LOAD-BEARING, and the shape this was lifted from was wrong.
 * A Stop hook blocks with exit code 2 AND a TOP-LEVEL `{"decision":"block",
 * "reason":…}`. `reason` is what the model is shown, so a block without one
 * blocks and explains nothing. `additionalContext` is the opposite case: it is
 * read only when NESTED inside `hookSpecificOutput` alongside `hookEventName`,
 * and the yagoda-crm originals emit it at top level, where it is a silent no-op.
 * Both directions are fixed here. Emitting one shape and hoping is how a gate
 * runs on every turn, writes its counter files, and blocks nothing — invisible
 * for hours.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const COUNTER_DIR = path.join(ROOT, '.verify', 'gate-counter');
const MAX_BLOCKS = 2;

let emitted = false;

/**
 * Exactly ONE object may reach stdout: a second corrupts the protocol.
 *
 * `context` is hoisted into `hookSpecificOutput` here rather than at each call
 * site, because putting it at the top level is the exact silent no-op this hook
 * was rewritten to remove — and a mistake that produces no error is a mistake
 * that gets made again.
 *
 * @param {{decision?: 'block', reason?: string, systemMessage?: string, context?: string}} obj
 */
function emit(obj) {
  if (emitted) return;
  const { context, ...rest } = obj;
  const out = { ...rest };
  if (context) out.hookSpecificOutput = { hookEventName: 'Stop', additionalContext: context };
  const warn = process.env.VERIFY_HOOK_WARN;
  if (warn) out.systemMessage = `${warn}\n${out.systemMessage ?? ''}`.trim();
  const text = JSON.stringify(out);
  JSON.parse(text); // refuse to emit anything that is not round-trippable
  emitted = true;
  process.stdout.write(`${text}\n`);
}

/**
 * `prompt_id` arrives as untrusted JSON. Used unsanitised as a path component,
 * a value containing `..` would truncate an arbitrary file.
 */
function safeId(raw) {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

/** How many times this prompt has already been blocked. */
function bump(id) {
  if (!id) return 1;
  try {
    mkdirSync(COUNTER_DIR, { recursive: true });
    // One file per prompt; the directory is pruned so it cannot grow forever.
    for (const f of readdirSync(COUNTER_DIR)) {
      if (f !== id) rmSync(path.join(COUNTER_DIR, f), { force: true });
    }
    const file = path.join(COUNTER_DIR, id);
    let n = 0;
    try {
      n = Number.parseInt(readFileSync(file, 'utf8'), 10) || 0;
    } catch {
      /* first block for this prompt */
    }
    writeFileSync(file, String(n + 1));
    return n + 1;
  } catch {
    // A counter we cannot maintain must not make the gate unblockable.
    return 1;
  }
}

/**
 * Turn the runner's JSON into the few lines that say what went wrong. Falls back
 * to raw output if the JSON is unparseable — which is itself worth seeing, and
 * is never silently swallowed.
 */
function summarise(res) {
  const raw = `${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd();
  let report;
  try {
    report = JSON.parse(res.stdout ?? '');
  } catch {
    return raw.split('\n').slice(-40).join('\n');
  }
  const lines = [];
  for (const c of report.checks ?? []) {
    if (!c.blocking) continue;
    lines.push(`${c.status}  ${c.id}${c.reason ? ` — ${c.reason}` : ''}`);
  }
  for (const f of report.failures ?? []) {
    lines.push('', `── ${f.id} ─────────────`, ...String(f.text).split('\n').slice(-20));
  }
  for (const w of report.warnings ?? []) lines.push(`WARNING ${w.id}: ${w.text}`);
  return lines.join('\n');
}

function main() {
  const input = readStdin();
  // A Stop hook that re-blocks its own continuation would loop forever.
  if (input.stop_hook_active === true) {
    emit({});
    return;
  }

  // `--json` rather than the human table: the reason handed back to the model
  // has to be the FAILURE, and scraping the table gave it the blind-spot footer
  // — forty lines of "what this does not prove" presented as why the turn was
  // blocked. Invoked as node + run.mjs rather than `pnpm verify` so the gate
  // does not depend on pnpm being on a hook's PATH; it is the same fast tier.
  const res = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'verify', 'run.mjs'), '--tier', 'fast', '--json'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 240_000 },
  );

  if (res.error || typeof res.status !== 'number') {
    // The gate could not evaluate the turn. That is NOT a green tree, and must
    // never be presented as one.
    process.stderr.write(`verify-hook: the gate could not run: ${res.error?.message ?? 'no exit status'}\n`);
    emit({
      systemMessage: 'verify-hook: the gate could not run — this turn is UNVERIFIED.',
      context:
        'The Stop gate could not execute `scripts/verify/run.mjs`, so nothing about this turn was ' +
        'checked. That is not a green tree. Run `pnpm verify` yourself and report what it printed.',
    });
    return;
  }

  if (res.status === 0) {
    emit({});
    return;
  }

  const blocks = bump(safeId(input.prompt_id));
  const tail = summarise(res);

  if (blocks > MAX_BLOCKS) {
    // Stop blocking, but do not pretend it passed.
    emit({
      systemMessage: `verify-hook: still red after ${MAX_BLOCKS} blocks; letting the turn end.`,
      context:
        `\`pnpm verify\` is still RED after ${MAX_BLOCKS} blocks, so the gate has stopped blocking — ` +
        'a gate that can block forever gets switched off, and a switched-off gate is the abandon ' +
        'signal SPEC 17 names. Do not claim this work is complete: state the red result explicitly ' +
        `and say what you tried.\n\n${tail}`,
    });
    return;
  }

  const why =
    '`pnpm verify` (fast tier) is RED, so this turn is not finished. Fix the code — do not weaken ' +
    'a check, do not add an ignore, do not it.skip. If a check is genuinely wrong, say so and ' +
    `leave it failing.\n\n${tail}`;
  // Both halves. Exit 2 blocks; the top-level `reason` is what the model is
  // shown, and stderr is what a human reading the hook log sees.
  process.stderr.write(`${why}\n`);
  emit({ decision: 'block', reason: why });
  process.exit(2);
}

try {
  main();
} catch (err) {
  // Fail open, loudly.
  process.stderr.write(`verify-hook: stop-gate crashed: ${err?.stack ?? err}\n`);
  emit({
    systemMessage: 'verify-hook: the gate crashed — this turn is UNVERIFIED.',
    context:
      'The Stop gate threw before it could evaluate this turn, so nothing was checked. Run ' +
      '`pnpm verify` yourself and report what it printed.',
  });
}
