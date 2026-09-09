#!/bin/sh
# Resolve a node interpreter for the hooks, and EXPORT a PATH their children can use.
#
# A hook does not inherit an interactive shell's environment. On this machine `node`
# on PATH is nvm's v22 while .nvmrc pins 24, and the checks themselves are `pnpm …`,
# so without exporting PATH every one of them reports UNRUNNABLE — a FALSE RED, which
# is worse than no gate at all.
#
# USES ONLY SHELL BUILT-INS for path and version handling. An earlier version of this
# script (yagoda-crm) called dirname/tr/sed/ls, and with a hostile PATH those are
# themselves missing: $ROOT collapsed to empty, node was handed "/scripts/verify/run.mjs",
# and the gate reported its own inability to start as a red tree. Parameter expansion
# and globbing cannot go missing.
#
# The wanted major is DATA, not code: it comes from .nvmrc.
set -u

# ${0%/*} is dirname without dirname. Guard the no-slash case ("sh node.sh").
SELF_DIR="${0%/*}"
[ "$SELF_DIR" = "$0" ] && SELF_DIR="."
ROOT="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$ROOT" ]; then
  if (CDPATH= cd -- "$SELF_DIR/../.." 2>/dev/null); then
    ROOT="$(CDPATH= cd -- "$SELF_DIR/../.." && pwd)"
  else
    ROOT="."
  fi
fi

WANT_MAJOR=""
NVMRC_BAD=""
if [ -r "$ROOT/.nvmrc" ]; then
  read -r WANT_MAJOR < "$ROOT/.nvmrc" || WANT_MAJOR=""
  WANT_MAJOR="${WANT_MAJOR#v}"
  WANT_MAJOR="${WANT_MAJOR%%.*}"
  # STRIP, not merely reject: a CRLF checkout yields "24\r", which fails a
  # digits-only test and would silently disable both the pin and the warning.
  WANT_MAJOR="${WANT_MAJOR%%[!0-9]*}"
  [ -z "$WANT_MAJOR" ] && NVMRC_BAD="1"
fi

NODE=""
FALLBACK=""

# Prefer parsing the major out of an nvm path over executing the binary: five
# candidates would otherwise mean five node spawns on every hook invocation.
major_of() {
  case "$1" in
    */versions/node/v*/bin/node)
      _v="${1#*/versions/node/v}"
      printf '%s' "${_v%%.*}"
      return 0
      ;;
  esac
  _v="$("$1" -v 2>/dev/null)" || return 1
  _v="${_v#v}"
  printf '%s' "${_v%%.*}"
}

# Takes ONE quoted argument. Two earlier shapes were both wrong: a space-joined
# string re-split by `for c in $CANDIDATES` skipped the right interpreter when
# $HOME contained a space, and reusing the positional list via `set --` clobbered
# the script's OWN arguments, so `exec "$NODE" "$@"` handed node the candidate list.
consider() {
  [ -x "$1" ] || return 0
  [ -z "$FALLBACK" ] && FALLBACK="$1"
  if [ -z "$NODE" ] && [ -n "$WANT_MAJOR" ] && [ "$(major_of "$1")" = "$WANT_MAJOR" ]; then
    NODE="$1"
  fi
}

[ -n "${CLAUDE_NODE:-}" ] && consider "$CLAUDE_NODE"
# `command -v` early, so that when nothing matches the pin the fallback is the
# interpreter the user's own shell would have used.
FOUND_IN_PATH="$(command -v node 2>/dev/null || true)"
[ -n "$FOUND_IN_PATH" ] && consider "$FOUND_IN_PATH"
# Glob instead of `ls`. Unmatched globs stay literal, so -x filters them out.
for _n in "${HOME:-/nonexistent}"/.nvm/versions/node/*/bin/node; do consider "$_n"; done
consider /opt/homebrew/bin/node
consider /usr/local/bin/node
consider /usr/bin/node

VERIFY_HOOK_WARN=""
if [ -n "$NVMRC_BAD" ]; then
  VERIFY_HOOK_WARN="verify-hook: .nvmrc exists but could not be parsed — the node version is NOT pinned."
fi
if [ -z "$NODE" ]; then
  NODE="$FALLBACK"
  if [ -n "$NODE" ] && [ -n "$WANT_MAJOR" ]; then
    VERIFY_HOOK_WARN="verify-hook: node v$WANT_MAJOR (.nvmrc) not found; running on $NODE (major $(major_of "$NODE")). Checks may behave differently than in the gate."
  fi
fi
if [ -n "$VERIFY_HOOK_WARN" ]; then
  # stderr on a zero exit reaches only the debug log, so this must ALSO travel in
  # the environment: each .mjs hook copies it into its systemMessage.
  printf '%s\n' "$VERIFY_HOOK_WARN" >&2
  export VERIFY_HOOK_WARN
fi

if [ -z "$NODE" ]; then
  # Fail open — but LOUDLY. A silent `|| exit 0` here is indistinguishable from a
  # green tree, which is the single worst outcome this layer can produce.
  printf 'verify-hook: no node interpreter found — this turn was NOT verified\n' >&2
  printf '{"systemMessage":"verify-hook: no node found, so the gate could not evaluate this turn. Treat it as UNVERIFIED."}\n'
  exit 0
fi

# Refuse to run with a broken root rather than handing node a path like
# "/scripts/verify/run.mjs" and letting the caller mistake MODULE_NOT_FOUND for a red tree.
if [ ! -d "$ROOT/scripts/verify" ]; then
  printf 'verify-hook: could not locate the repo root (ROOT=%s) — this turn was NOT verified\n' "$ROOT" >&2
  printf '{"systemMessage":"verify-hook: could not locate the repo root, so the gate could not evaluate this turn. Treat it as UNVERIFIED."}\n'
  exit 0
fi

NODE_BIN_DIR="${NODE%/*}"
PATH="$NODE_BIN_DIR:$ROOT/node_modules/.bin:$PATH"
export PATH
export CLAUDE_PROJECT_DIR="$ROOT"

exec "$NODE" "$@"
