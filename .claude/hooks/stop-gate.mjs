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
 * The exit-2-with-stderr mechanism is load-bearing: the Stop hook documentation
 * puts the decision at `hookSpecificOutput.decision`, and the exit-code table
 * says exit 2 "blocks the action regardless of JSON" with stderr as the reason.
 * Emitting one shape and hoping is how a gate runs on every turn, writes its
 * counter files, and blocks nothing — invisible for hours.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const COUNTER_DIR = path.join(ROOT, '.verify', 'gate-counter');
const MAX_BLOCKS = 2;

let emitted = false;

/** Exactly ONE object may reach stdout: a second corrupts the protocol. */
function emit(obj) {
  if (emitted) return;
  const warn = process.env.VERIFY_HOOK_WARN;
  const withWarn = warn ? { ...obj, systemMessage: `${warn}\n${obj.systemMessage ?? ''}`.trim() } : obj;
  const text = JSON.stringify(withWarn);
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

function main() {
  const input = readStdin();
  // A Stop hook that re-blocks its own continuation would loop forever.
  if (input.stop_hook_active === true) {
    emit({});
    return;
  }

  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify', 'run.mjs'), '--tier', 'fast'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 240_000,
  });

  if (res.error || typeof res.status !== 'number') {
    // The gate could not evaluate the turn. That is NOT a green tree, and must
    // never be presented as one.
    process.stderr.write(`verify-hook: the gate could not run: ${res.error?.message ?? 'no exit status'}\n`);
    emit({
      systemMessage:
        'verify-hook: the gate could not run, so this turn is UNVERIFIED. Run `pnpm verify` yourself and say what it printed.',
    });
    return;
  }

  if (res.status === 0) {
    emit({});
    return;
  }

  const blocks = bump(safeId(input.prompt_id));
  const tail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd().split('\n').slice(-40).join('\n');

  if (blocks > MAX_BLOCKS) {
    // Stop blocking, but do not pretend it passed.
    emit({
      systemMessage:
        `verify-hook: \`pnpm verify\` is still red after ${MAX_BLOCKS} blocks; letting the turn end. ` +
        'Do not claim this work is complete — state the red result explicitly and what you tried.\n' +
        tail,
    });
    return;
  }

  // Exit 2 with the reason on stderr is the mechanism that actually blocks.
  process.stderr.write(
    `\`pnpm verify\` is RED. Fix the code — do not weaken a check, do not add an ignore, ` +
      `do not it.skip. If a check is genuinely wrong, say so and leave it failing.\n\n${tail}\n`,
  );
  emit({ decision: 'block', hookSpecificOutput: { hookEventName: 'Stop', decision: 'block' } });
  process.exit(2);
}

try {
  main();
} catch (err) {
  // Fail open, loudly.
  process.stderr.write(`verify-hook: stop-gate crashed: ${err?.stack ?? err}\n`);
  emit({ systemMessage: 'verify-hook: the gate crashed, so this turn is UNVERIFIED. Run `pnpm verify` yourself.' });
}
