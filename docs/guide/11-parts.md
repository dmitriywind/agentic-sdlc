# 11. The parts
<!-- group: Reference -->

How the factory is built. For the exact rules, read the contract,
[`references/architecture.md`](../../references/architecture.md).

## Three layers

| Layer | Where | Holds |
|---|---|---|
| Skills | the plugin (Claude, Codex, Cursor) or `.agents/skills/` | The process: every rule. The same for every project. |
| Binding | `.agents/binding.yml` | Your project's values: board, owners, commands, environments, models. |
| CLI | `agentic-sdlc` (and its MCP server) | The mechanism: board, forge and Git verbs, the checks, dispatch, the run ledger. The MCP server speaks both protocol eras: a client that opens with `initialize` is served as before (2025-11-25 and earlier), and a client that sends its version in each request's `_meta` (2026-07-28) is served without a handshake. |

A project changes only its binding. A skill never calls a vendor tool: it calls the CLI.

Each CLI verb takes only the flags it lists. An unknown flag, a flag with no value and a `--body-file` that cannot be read stop the verb with a usage error (exit 2). When GitHub answers a read with a rate limit or a server error, the CLI tries again up to three times and waits as long as GitHub asks. A write is tried again only on a rate limit, because a server error may follow a write that went through. Lists are bounded: `forge list` takes `--limit` and `--since`, and returns no check results unless asked with `--checks`.

```mermaid
flowchart LR
  sk["Skills"]:::agent --> cli["agentic-sdlc CLI<br/>and MCP server"]:::ci
  bd["Binding"]:::board --> cli
  cli --> b[("Board")]:::board
  cli --> f[("GitHub")]:::board
  cli --> g[("Git")]:::board
```

## Eleven skills

Seven run in every project. Four run only when the binding asks for them.

| Stage | Skill | Does | Runs |
|---|---|---|---|
| Navigate | `sdlc` | Runs one cycle: routes each ticket to the next skill. | always |
| Intake | `triage-signal` | Turns one raw signal into Backlog, Ideas or Cancelled. | always |
| Intake | `backlog-grooming` | Sets Priority, merges duplicates, groups work. | always |
| Plan | `shape` | Takes a Backlog ticket to Ready: size, criteria with proof, lane, spec. | always |
| Build | `implement-spec` | Writes the proof first, then the code, then opens a draft pull request. | always |
| Check | `review-pr` | Reviews the pull request against its ticket and CI, then merges it or sends it back. | always |
| Check | `verify-ux` | Uses the running change as a user for `computer-use` criteria. Apart from `review-pr` because it runs the change's code. | a criterion names `computer-use` |
| Ship | `release` | Chooses what ships, sets the version, cuts the release line. | release-line delivery |
| People | `escalate-to-human` | Decides whether a person must act; holds the ticket with one question. | always |
| Learn | `judge-run` | Grades each finished run. | `learning.enabled` |
| Learn | `improve-factory` | Proposes one factory change, with proof. | `learning.enabled` |

## Who runs a step

`executors.<skill>.kind` picks who runs each skill: `harness` (a subagent of the cycle), `command`
(a local CLI), `webhook` (a bot over HTTP), `managed` (a managed agent) or `assign` (a hosted coding
agent). Each entry may also name its MCP servers, its secrets (env var names only; nothing else is
passed), its sandbox (`cloud`, `container` or `local`) and its model. Results come back only as
board and forge writes. The rules are in [`executors.md`](../../skills/sdlc/references/executors.md).

## Trust boundaries

| Part | Runs the change's code | Holds secrets | Holds the review token |
|---|---|---|---|
| CI `Required` job | yes | no | no |
| CI checks (gates) | no: the CLI only, with the rules from the main branch | the job token, the board token | no |
| The cycle and implementers | their own work, in their sandbox | forge and board tokens | no |
| The review | no: it reads CI results and the diff | forge and board tokens | only with two identities |
| `verify-ux` | yes: a preview, in a browser | test credentials | no |

The `provenance` gate is one of the CI checks: it reads a pull request's commits through the forge and never runs them. Agents write the `Agent-Run` and `Agent-Model` trailers on their own commits, so the trailers say which run made a commit; they do not prove it.

Untrusted input is data, never instructions: Signal text, pull request bodies, and comments by
accounts outside `owners`.

## What `init` puts in your project

| Path | Holds |
|---|---|
| `.agents/binding.yml` | Every project value. The one file a project changes. |
| `.agents/skills/` | The skill pack (Claude with the plugin reads the plugin's copy). |
| `.agents/scorers/` | The scorers `judge-run` uses. |
| `.agents/cycle-prompt.md`, `review-prompt.md`, `runner-setup.sh` | What a scheduler runs. |
| `.agents/hooks/pre-push` | Refuses a push to the main branch. |
| `.github/workflows/agentic-sdlc-*.yml`, `.github/rulesets/` | The checks and the branch protection. |
| `AGENTS.md` (and `CLAUDE.md` for Claude) | A pointer for every agent: start with the `sdlc` skill. |

Changing anything under `.agents/` or `.github/` is a factory change.

Next: [12. Glossary](12-glossary.md).
