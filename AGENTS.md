# agentic-sdlc

A portable software factory: a skill pack (`skills/`), a binding template (`templates/binding.yml`),
and a thin CLI (`src/`) with board, forge and VCS ports, repo gates, the run ledger and the bench.
`references/architecture.md` is the contract; read it before you change any part.

## Commands

- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Test: `npm test` (one file: `node --test test/<name>.test.ts`)
- Skill pack check: `npx agentic-sdlc gate skill-regression`

## Rules

- A process rule lives only in `skills/`. A project value lives only in the binding. `src/` holds mechanism only.
- A skill calls `agentic-sdlc board|forge|vcs <verb>`, never a vendor CLI.
- A change to a port, a binding key or a skill's interface changes `references/architecture.md` in the same change.
- Trunk-based on every VCS. No long-lived branch.
