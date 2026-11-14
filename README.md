# agentic-sdlc

> **Alpha (2.0.0-alpha).** The interfaces still change between alphas. The board and forge adapters
> are unit-tested against a fake process runner, not yet against live services. Try it on a
> sandbox repo before you point it at one that matters.

A skill pack plus ports for running delivery with agents. The skills describe the process:
triage, shape, build, review, release, escalate and learn. The `agentic-sdlc` CLI gives those
skills one set of verbs for the board, the forge and Git, and the CI gates that agents must not
be trusted to keep. Your agent harness and scheduler run the skills. The package ships no agent
runner of its own.

- **Boards:** GitHub Projects, the repo's GitHub issues (`github-issues`, over REST), Jira, Linear, or a local JSON file.
- **Forge:** GitHub. **VCS:** Git, trunk-based.
- **Harnesses:** Claude Code (as a plugin), Codex, Cursor, or any agent with a
  shell or MCP.
- **Executors per stage:** a harness subagent, a command bot, a webhook bot, a managed agent, or
  a hosted coding agent by assignment.
- **Profiles:** `individual` runs on subscriptions only; `individual-api` adds API keys and managed
  agents to it; `organization` runs on API keys and managed agents, with trace storage and a separate review app.
- **Identities:** one (the default for both individual profiles: the factory acts as your account) or
  two (a separate review identity; required for `organization`).
- **Repos:** one repo per board, or many repos on one board (`board.scope`).

| Start here | |
|---|---|
| [Guide page](docs/guide.html) | One HTML page: set up, every flow and every part, with the diagrams drawn. Open it in a browser. |
| [Docs index](docs/README.md) | Every guide. |
| [Components](docs/architecture/components.md) and [flows](docs/architecture/flows.md) | Diagrams of the parts, trust boundaries, the cycle, review, release and learning. |
| [Claude](docs/ecosystems/claude-code.md), [Codex](docs/ecosystems/codex.md), [Cursor](docs/ecosystems/cursor.md), [any other](docs/ecosystems/generic.md) | Install and run in each ecosystem. |
| [Individual and individual-api](docs/profiles/individual.md) and [organization](docs/profiles/organization.md) | Pick a profile. |
| [Forge](docs/forges.md) | GitHub checks, approval, tokens and one-time setup. |
| [The contract](references/architecture.md) | Normative: ports, gates, binding, executors, runtimes. |

## How it fits together

| Layer | Where | Holds |
|---|---|---|
| Process | the plugin (Claude) or `.agents/skills/` | Every rule: statuses, routing, the cycle, lanes, review, release, escalation, learning. |
| Binding | `.agents/binding.yml` | Every project value: board, forge, commands, paths, owners, model tiers, executors. |
| Ports | `agentic-sdlc` CLI and MCP server | Board, forge and Git verbs, CI gates, dispatch, the run ledger, the bench. |

A scheduled agent loads the `sdlc` skill and runs one cycle; the skill routes each ticket to a
step skill. Every hand-off goes through the board and the forge. CI runs the CR's code with no
secrets (the `Required` check); `review-pr`, in a fresh agent context, reads that result and never
runs CR code. With two identities it runs in a separate review runtime under its own account. A
Full-lane CR also needs one human approval.

## Skills

Eleven skills, each with a model tier in `metadata.tier`. Seven run in every project; four run only
when the binding asks for them (the last column).

| Skill | Tier | Does | Runs |
|---|---|---|---|
| `sdlc` | fast | The navigator: routing, the cycle, the hold, branches. | always |
| `triage-signal` | fast | One raw signal to one decision: Backlog, Ideas or Cancelled. | always |
| `backlog-grooming` | balanced | Priority, dedupe, initiatives, decluttering. | always |
| `shape` | deep | Backlog to Ready: size, split, criteria with proof, lane, spec. | always |
| `implement-spec` | balanced | Proof first on one change line, then a draft CR. | always |
| `review-pr` | balanced | Independent review from CI results, then ready and auto-merge (an approving review only with two identities), or send back. | always |
| `verify-ux` | balanced | Uses the running CR head as a user for `computer-use` criteria and posts evidence. Apart from `review-pr` because it runs CR code, which the review never does. | a criterion names `computer-use` and `commands.preview` is set |
| `release` | balanced | Choose what ships, set the version, cut the release branch. | `product.delivery: release-line` |
| `escalate-to-human` | fast | Decide whether a person must act; hold the ticket with one structured ask. | always |
| `judge-run` | fast (dispatch picks `learning.judge_tier`) | Grade one finished run with the scorers `ledger plan` names. | `learning.enabled` |
| `improve-factory` | deep | Find the worst repeated failure and propose one factory change, with bench proof. | `learning.enabled` |

The self-improvement loop is described in the contract, section 6. In short: every run is a
ledger row, scorers grade it, and `improve-factory` proposes one change at a time, proved on a
bench built from your own merged work. Until a bench baseline exists, nothing merges without the
factory owner. Learning is off until you set `learning.enabled: true` and an
`agent_command` for the bench.

## Install

```bash
npm i -D --allow-git=root github:dmitriywind/agentic-sdlc#v2.0.0-alpha.5
npx --no agentic-sdlc init --profile individual --harness claude --board github --forge github --vcs git
npx --no agentic-sdlc doctor
```

The CLI installs from Git only. Warning: the npm package `agentic-sdlc` is a different project; do not install it.
To move to another revision, run `npm uninstall agentic-sdlc` first, then the `npm i` line above with the new ref, then `init`
again. npm 12 refuses to change an installed Git dependency in place (`EALLOWGIT`).

`init` flags:

| Flag | Values | Default |
|---|---|---|
| `--profile` | `individual`, `individual-api`, `organization` | `individual` |
| `--harness` | `claude`, `codex`, `cursor`, `generic` | `generic` |
| `--board` | `github`, `github-issues`, `jira`, `linear`, `local` | `github` |
| `--forge` | `github` | `github` |
| `--vcs` | `git` | `git` |
| `--force` | overwrite files `init` would keep | off |
| `--no-plugin` | with `--harness claude`: copy skills to `.claude/skills` and write `.mcp.json` instead of using the plugin | off |

What `init` writes, for every harness: `.agents/binding.yml`, `.agents/scorers/`, the gate
templates for your forge (GitHub: workflows, `pull_request_template.md` and
`.github/rulesets/trunk.json` and `release.json`, and the release workflow for release-line delivery), `.agents/hooks/pre-push`, `.agents/runner-setup.sh`, the cycle and
review prompts in `.agents/`, and a pointer block in `AGENTS.md`. Per harness:

| Harness | Skills | Instructions | MCP server |
|---|---|---|---|
| `claude` | none: install the plugin (`--no-plugin`: `.claude/skills/`) | `@AGENTS.md` import in `CLAUDE.md`; tier subagents in `.claude/agents/` | the plugin's (`--no-plugin`: `.mcp.json`) |
| `codex` | `.agents/skills/` | `AGENTS.md` | `.codex/config.toml` |
| `cursor` | `.agents/skills/` | `AGENTS.md` | `.cursor/mcp.json` |
| `generic` | `.agents/skills/` (see the ecosystem guide) | `AGENTS.md` | printed for you to add |

The init log is the exact list. Then fill in the binding and run `doctor` until every port is ok.
Prerequisites for the GitHub adapters: `gh` logged in (or a Claude cloud session), and a token with
Projects v2 scope for a `github` board. The `organization` profile also needs a review GitHub App.

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
npm i -D --allow-git=root github:dmitriywind/agentic-sdlc#v2.0.0-alpha.5
npx --no agentic-sdlc init --board local --forge github --harness generic
printf 'Show a greeting on the home page.\n' > body.md
npx --no agentic-sdlc board create --title "Greeting" --body-file body.md --status Backlog
npx --no agentic-sdlc board list
npx --no agentic-sdlc dispatch shape --ticket 2
```

`dispatch` with the default `harness` executor prints the instruction your agent would follow; it
starts nothing. Open the folder in your agent and ask it to run the `sdlc` skill for one cycle.
`board create` and `board comment` take bodies only from `--body-file`; `board close` needs
`--reason completed|not_planned`. Forge verbs and gates need a real forge.

## This repository

This repo does not run its own factory yet: it has no `.agents/`, no board and no factory gates (`.github/workflows/ci.yml` only builds and tests), and changes
are made by hand. The reason is order: the gates and the review runtime have to be proved on
sandbox repos first, and a broken factory gating its own repo could not be fixed through itself.
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).

## CLI

`npx --no agentic-sdlc --help` lists every group and verb. Every verb prints JSON. Exit 0 is success,
1 is a refused or failed action, 2 is a usage error.

## License

Apache-2.0
