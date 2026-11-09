#!/bin/sh
# Fresh cloud runner setup: run from the repo root (or set it as the binding's commands.setup).
# Idempotent. Add project tooling installs at the bottom.
set -eu
# Prefer the version the repo pins as a devDependency; else AGENTIC_SDLC_VERSION, else the next (pre-release) tag.
if [ -f package-lock.json ] && grep -q '"node_modules/agentic-sdlc"' package-lock.json; then
  npm ci
else
  npm i -g "agentic-sdlc@${AGENTIC_SDLC_VERSION:-next}"
fi
npx agentic-sdlc validate   # binding and skill pack are well-formed
npx agentic-sdlc doctor     # board, forge and vcs are reachable, tokens are present
# set: your dependency install and toolchain (the binding's commands.install)
