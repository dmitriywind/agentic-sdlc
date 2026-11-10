# agentic-sdlc

A portable software factory, published as an npm package that is also a Claude Code plugin.
`references/architecture.md` is the contract; read it before you change any part.

## Layout

- `skills/` the skill pack (plugin layout: `skills/<name>/SKILL.md`); `init` copies it to a project's `.agents/skills/`.
- `scorers/` judge-run scorer definitions; `init` copies them to `.agents/scorers/`.
- `src/` the CLI (`agentic-sdlc`): board, forge and VCS ports, gates, dispatch, ledger, bench, MCP server, init/validate/doctor.
- `templates/` what `init` installs: `binding.yml`, `gates/` (CI per forge, the pre-push hook), `runner/` (schedulers, prompts, setup), `mcp/`.
- `.claude-plugin/` the plugin and marketplace manifests; `hooks/` the plugin's guard hook and MCP launcher.
- `references/`, `docs/` the contract and the guides. `test/` node:test suites (`*.test.ts`).

## Commands

- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Test: `npm test` (builds first; one file: `node --test test/<name>.test.ts`)
- Plugin manifests: `claude plugin validate .` and `claude plugin validate .claude-plugin/plugin.json`
- `agentic-sdlc gate skill-regression`, `validate` and `doctor` need an installed project (`.agents/binding.yml`); this repo does not run its own factory.

## Rules

- A process rule lives only in `skills/`. A project value lives only in the binding. `src/` holds mechanism only.
- A skill calls `agentic-sdlc board|forge|vcs <verb>`, never a vendor CLI.
- A change to a port, a binding key or a skill's interface changes `references/architecture.md` in the same change.
- Keep `.claude-plugin/plugin.json` `version` equal to `package.json` `version` (a test checks it).
- Git only, no npm: the npm name `agentic-sdlc` is another project. `dist/` is committed (the plugin and `github:` installs run it), so run `npm run build` and commit `dist/` with every `src/` change. A release is a `v<version>` tag.
- Git only, trunk-based. No long-lived branch.
