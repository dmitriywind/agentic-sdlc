# agentic-sdlc

> **Alpha (2.0.0-alpha).** The interfaces still change between alphas. The board and forge adapters
> are unit-tested against a fake process runner, not yet against live services. Try it on a
> sandbox repo before you point it at one that matters.

A skill pack plus ports for running delivery with agents. The skills describe the process:
triage, shape, build, review, release, escalate and learn. The `agentic-sdlc` CLI gives those
skills one set of verbs for the board, the forge and Git, and the CI gates that agents must not
be trusted to keep. Your agent harness and scheduler run the skills. The package ships no agent
runner of its own.

- **Boards:** GitHub Projects, Jira, Linear, or a local JSON file.
- **Forges:** GitHub, GitLab, Azure DevOps, Bitbucket. **VCS:** Git, trunk-based.
- **Harnesses:** Claude Code (as a plugin), Codex, Cursor, Antigravity, Grok, or any agent with a
  shell or MCP.
- **Executors per stage:** a harness subagent, a command bot, a webhook bot, a managed agent, or
  a hosted coding agent by assignment.
- **Profiles:** `individual` runs on subscriptions only; `enterprise` adds API keys, managed
  agents, trace storage and a separate review app.

| Start here | |
|---|---|
| [Docs index](docs/README.md) | Every guide. |
| [Components](docs/architecture/components.md) and [flows](docs/architecture/flows.md) | Diagrams of the parts, trust boundaries, the cycle, review, release and learning. |
| [Claude](docs/ecosystems/claude-code.md), [Codex](docs/ecosystems/codex.md), [Cursor](docs/ecosystems/cursor.md), [Antigravity](docs/ecosystems/antigravity.md), [Grok](docs/ecosystems/grok.md), [any other](docs/ecosystems/generic.md) | Install and run in each ecosystem. |
| [Individual](docs/profiles/individual.md) and [enterprise](docs/profiles/enterprise.md) | Pick a profile. |
| [Forges](docs/forges.md) | Checks, approval and what each forge keeps natively. |
| [The contract](references/architecture.md) | Normative: ports, gates, binding, executors, runtimes. |

## How it fits together

| Layer | Where | Holds |
|---|---|---|
| Process | the plugin (Claude) or `.agents/skills/` | Every rule: statuses, routing, the cycle, lanes, review, release, escalation, learning. |
| Binding | `.agents/binding.yml` | Every project value: board, forge, commands, paths, owners, model tiers, executors. |
| Ports | `agentic-sdlc` CLI and MCP server | Board, forge and Git verbs, CI gates, dispatch, the run ledger, the bench. |

A scheduled agent loads the `sdlc` skill and runs one cycle; the skill routes each ticket to a
step skill. Every hand-off goes through the board and the forge. CI runs the CR's code with no
secrets (the `Required` check); a separate review runtime, with its own identity, reads that
result and never runs CR code. A Full-lane CR also needs one human approval.

## Skills

Eleven skills, each with a model tier in `metadata.tier`:

| Skill | Tier | Does |
|---|---|---|
| `sdlc` | fast | The navigator: routing, the cycle, the hold, branches. |
| `triage-signal` | fast | One raw signal to one decision: Backlog, Ideas or Cancelled. |
| `backlog-grooming` | balanced | Priority, dedupe, initiatives, decluttering. |
| `shape` | deep | Backlog to Ready: size, split, criteria with proof, lane, spec. |
| `implement-spec` | balanced | Proof first on one change line, then a draft CR. |
| `review-pr` | balanced | Independent review from CI results, then approval, ready and auto-merge, or send back. |
| `verify-ux` | balanced | Drive a preview of the CR head for `computer-use` criteria. |
| `release` | balanced | Choose what ships, set the version, cut the release branch. |
| `escalate-to-human` | fast | Decide whether a person must act; hold the ticket with one structured ask. |
| `judge-run` | fast (dispatch picks `learning.judge_tier`) | Grade one finished run with the scorers `ledger plan` names. |
| `improve-factory` | deep | Find the worst repeated failure and propose one factory change, with bench proof. |

The self-improvement loop is described in the contract, section 6. In short: every run is a
ledger row, scorers grade it, and `improve-factory` proposes one change at a time, proved on a
bench built from your own merged work. Until a bench baseline exists, nothing merges without the
factory owner.

## Install

```bash
npm i -D agentic-sdlc@next
npx agentic-sdlc init --profile individual --harness claude --board github --forge github --vcs git
npx agentic-sdlc doctor
```

The `@next` tag is the alpha; a plain `npm i agentic-sdlc` installs the old v1.

`init` flags:

| Flag | Values | Default |
|---|---|---|
| `--profile` | `individual`, `enterprise` | `individual` |
| `--harness` | `claude`, `codex`, `cursor`, `antigravity`, `grok`, `generic` | `generic` |
| `--board` | `github`, `jira`, `linear`, `local` | `github` |
| `--forge` | `github`, `gitlab`, `azure`, `bitbucket` | `github` |
| `--vcs` | `git` | `git` |
| `--force` | overwrite files `init` would keep | off |
| `--no-plugin` | with `--harness claude`: copy skills to `.claude/skills` and write `.mcp.json` instead of using the plugin | off |

What `init` writes, for every harness: `.agents/binding.yml`, `.agents/scorers/`, the gate
templates for your forge (GitHub: workflows, `pull_request_template.md` and
`.github/rulesets/trunk.json`), `.agents/hooks/pre-push`, `.agents/runner-setup.sh`, the cycle and
review prompts in `.agents/`, and a pointer block in `AGENTS.md`. Per harness:

| Harness | Skills | Instructions | MCP server |
|---|---|---|---|
| `claude` | none: install the plugin (`--no-plugin`: `.claude/skills/`) | `@AGENTS.md` import in `CLAUDE.md`; tier subagents in `.claude/agents/` | the plugin's (`--no-plugin`: `.mcp.json`) |
| `codex` | `.agents/skills/` | `AGENTS.md` | `.codex/config.toml` |
| `cursor` | `.agents/skills/` | `AGENTS.md` | `.cursor/mcp.json` |
| `antigravity` | `.agents/skills/` | `AGENTS.md` | `.agents/mcp_config.json` |
| `grok`, `generic` | `.agents/skills/` (see the ecosystem guide) | `AGENTS.md` | printed for you to add |

The init log is the exact list. Then fill in the binding and run `doctor` until every port is ok.
Prerequisites for the GitHub adapters: `gh` logged in, a token with Projects v2 scope for the
board, and a second account or app for the review identity.

### Claude Code plugin

For Claude Code the skills, hooks and MCP server are a plugin, so skills are named
`/agentic-sdlc:<skill>`. Install it from this repo's marketplace, or load it for one session from
the installed package:

```text
/plugin marketplace add dmitriywind/agentic-sdlc
/plugin install agentic-sdlc@agentic-sdlc
```

```bash
claude --plugin-dir ./node_modules/agentic-sdlc
```

See [docs/ecosystems/claude-code.md](docs/ecosystems/claude-code.md) for the headless flags a
scheduled run needs.

## Try it locally

No board account and no forge needed for this part. The `local` board is `.agents/board.json`.

```bash
mkdir try-agentic && cd try-agentic && git init -b main && npm init -y
npm i -D agentic-sdlc@next
npx agentic-sdlc init --board local --forge github --harness generic
printf 'Show a greeting on the home page.\n' > body.md
npx agentic-sdlc board create --title "Greeting" --body-file body.md --status Backlog
npx agentic-sdlc board list
npx agentic-sdlc dispatch shape --ticket 1
```

`dispatch` with the default `harness` executor prints the instruction your agent would follow; it
starts nothing. Open the folder in your agent and ask it to run the `sdlc` skill for one cycle.
`board create` and `board comment` take bodies only from `--body-file`; `board close` needs
`--reason completed|not_planned`. Forge verbs and gates need a real forge.

## Upgrading from v1

v2 is a rewrite (`feat!`). Nothing from v1 is read.

| v1 | v2 |
|---|---|
| `agentic-sdlc-policy.json` | `.agents/binding.yml`, written by `init` from `templates/binding.yml`. |
| `agentic-sdlc supervise [--once --read-only]` | No supervisor. A scheduler (routine, CI cron, managed agent) runs your harness with the cycle prompt, which loads the `sdlc` skill. See `templates/runner/`. |
| The TypeScript SDK (`supervise` and friends) | Removed. Use the CLI verbs or the MCP server (`agentic-sdlc mcp`). |
| The Docker sandbox | Each executor declares `sandbox`; unattended runs refuse `local`. The sandbox itself is your scheduler's. |

Delete the v1 policy file and any `supervise` job after `doctor` passes.

## This repository

This repo does not run its own factory yet: it has no `.agents/`, board or CI gates, and changes
are made by hand. The reason is order: the gates and the review runtime have to be proved on
sandbox repos first, and a broken factory gating its own repo could not be fixed through itself.
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md). Changes:
[CHANGELOG.md](CHANGELOG.md).

## CLI

`npx agentic-sdlc --help` lists every group and verb. Every verb prints JSON. Exit 0 is success,
1 is a refused or failed action, 2 is a usage error.

## License

Apache-2.0
