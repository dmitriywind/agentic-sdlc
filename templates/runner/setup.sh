#!/bin/sh
# Fresh cloud runner setup: run from the repo root (or set it as the binding's commands.setup).
# Idempotent. Add project tooling installs at the bottom.
set -eu
# Profiles individual and individual-api = the harness runs on the subscription login. ANTHROPIC_API_KEY outranks
# CLAUDE_CODE_OAUTH_TOKEN and bills the API without a word, so refuse to start when it is set. individual-api gives
# its managed executors their key under another name (executors.<skill>.token_env, e.g. MANAGED_API_KEY).
if grep -Eq '^profile:[[:space:]]*["'"'"']?individual' .agents/binding.yml 2>/dev/null && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY is set but the binding's profile is individual or individual-api: remove it from this runner (it would bill the API); name a managed executor's key otherwise." >&2
  exit 1
fi
# The version the repo pins as a devDependency; else AGENTIC_SDLC_VERSION, which must be set.
if [ -f package-lock.json ] && grep -q '"node_modules/agentic-sdlc"' package-lock.json; then
  npm ci --ignore-scripts
else
  # AGENTIC_SDLC_VERSION (repo variable): an exact version or a 40-hex commit SHA; a SHA is the immutable choice (a tag can move).
  v="${AGENTIC_SDLC_VERSION:-}"
  if printf '%s' "$v" | grep -Eq '^[0-9a-f]{40}$'; then ref="$v"
  elif printf '%s' "$v" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+.][0-9A-Za-z.+-]+)?$'; then ref="v$v"
  else echo "::error::set the repo variable AGENTIC_SDLC_VERSION to an exact version or a 40-hex commit SHA, or pin agentic-sdlc as a devDependency" >&2; exit 1; fi
  npm i --no-save --ignore-scripts --allow-git=root "github:dmitriywind/agentic-sdlc#$ref"
fi
npx --no agentic-sdlc validate   # binding and skill pack are well-formed
npx --no agentic-sdlc doctor     # board, forge and vcs are reachable, tokens are present
# set: your dependency install and toolchain (the binding's commands.install)
