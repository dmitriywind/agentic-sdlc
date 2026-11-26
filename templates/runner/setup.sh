#!/bin/sh
# Fresh cloud runner setup: run from the repo root (or set it as the binding's commands.setup).
# Idempotent. Add project tooling installs at the bottom.
set -eu
# The harness runs on the Claude subscription login. ANTHROPIC_API_KEY outranks CLAUDE_CODE_OAUTH_TOKEN and bills
# the API without a word, so refuse to start when it is set.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY is set: remove it from this runner (it would bill the API); the factory runs on the Claude subscription." >&2
  exit 1
fi
# The CLI is the pin in .agents/cli.json; the launcher installs it on first use. Later steps (and the agent) call `agentic-sdlc`.
[ -z "${GITHUB_PATH:-}" ] || echo "$PWD/.agents/bin" >> "$GITHUB_PATH"
.agents/bin/agentic-sdlc validate   # binding and skill pack are well-formed
.agents/bin/agentic-sdlc doctor     # board, forge and vcs are reachable (with the tokens this runner holds)
# set: your dependency install and toolchain (the binding's commands.install)
