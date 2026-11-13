#!/bin/sh
# Fresh cloud runner setup: run from the repo root (or set it as the binding's commands.setup).
# Idempotent. Add project tooling installs at the bottom.
set -eu
# Individual profile = subscription login. ANTHROPIC_API_KEY outranks CLAUDE_CODE_OAUTH_TOKEN and
# bills the API without a word, so refuse to start when it is set.
if grep -Eq '^profile:[[:space:]]*individual' .agents/binding.yml 2>/dev/null && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY is set but the binding's profile is individual: remove it from this runner (it would bill the API)." >&2
  exit 1
fi
# The version the repo pins as a devDependency; else AGENTIC_SDLC_VERSION (an exact version), else 2.0.0-alpha.4.
if [ -f package-lock.json ] && grep -q '"node_modules/agentic-sdlc"' package-lock.json; then
  npm ci --ignore-scripts
else
  npm i --no-save --ignore-scripts --allow-git=root "github:dmitriywind/agentic-sdlc#v${AGENTIC_SDLC_VERSION:-2.0.0-alpha.4}"
fi
npx --no agentic-sdlc validate   # binding and skill pack are well-formed
npx --no agentic-sdlc doctor     # board, forge and vcs are reachable, tokens are present
# set: your dependency install and toolchain (the binding's commands.install)
