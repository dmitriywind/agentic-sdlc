# Agentic Rules & Self-Service Guide

Welcome to `agentic-sdlc`. This repository is a self-service TypeScript developer tool and SDK that orchestrates governed agentic coding loops.

## Commands for Agents

- **Build**: `npm run build` (runs `tsup` to build ESM and `.d.ts` definitions in `dist/`)
- **Typecheck**: `npm run typecheck` (runs `tsc --noEmit`)
- **Test**: `npm test` (runs `node --test` across all BDD test scenarios)
- **Validate Policy**: `npx agentic-sdlc validate`
- **Run Supervisor**: `npx agentic-sdlc supervise --once --read-only`

---

<!-- agentic-sdlc:start -->
## Agentic SDLC

Work and delivery evidence live in the tracker configured by `agentic-sdlc-policy.json`. Use `npx agentic-sdlc` for installation, validation, or supervision; its specification is the portable authority. Keep project rules as a pointer—do not duplicate the workflow here.
<!-- agentic-sdlc:end -->
