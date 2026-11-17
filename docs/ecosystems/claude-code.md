# Claude

## What you get
- Claude Code CLI: skills, MCP, headless `claude -p`.
- Cloud sessions and scheduled tasks (routines) that run on Anthropic's cloud with your laptop closed.
- Managed Agents API (API-key billed): hosted agents, cloud sandboxes, cron deployments.
- A GitHub Action that runs the same prompt on your runners.

## Install
The skills, hooks and MCP server ship as a Claude Code plugin named `agentic-sdlc`, so skills are
`/agentic-sdlc:sdlc`, `/agentic-sdlc:ship` and so on ([plugins](https://code.claude.com/docs/en/plugins)).

```bash
npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v0.1.1 init --harness claude --profile individual --board github --forge github --vcs git
claude --plugin-dir .agents/.cli/<ref>/node_modules/agentic-sdlc
```
`init` pins the CLI in `.agents/cli.json` and installs the launcher `.agents/bin/agentic-sdlc`, which fetches that ref
into `.agents/.cli/<ref>/` on first use (run any CLI call once first, for example `.agents/bin/agentic-sdlc validate`).
`--plugin-dir` loads the plugin from that installed package for one session. To install it for
every session, the repo is also a plugin marketplace:

```text
/plugin marketplace add dmitriywind/agentic-sdlc
/plugin install agentic-sdlc@agentic-sdlc
```
The plugin's hook refuses a push to the trunk and allows `forge approve` and `forge status` only in the review runtime (two identities). A one-identity runner that serves `forge_status` over MCP sets `AGENTIC_SDLC_ALLOW_STATUS=1`; that never opens `forge approve`.

The plugin also carries:
- `agents/`: `agentic-sdlc:sdlc-fast`, `sdlc-balanced`, `sdlc-deep` (each runs on the session's model; `init --harness claude` writes project agents with the models from `binding.models`) and `agentic-sdlc:sdlc-reviewer` for `review/review`. The reviewer has Read, Grep, Glob, Skill, Bash and the plugin's MCP tools, no Edit or Write and a turn limit, and the guard hook refuses any Bash command from it that is not an `agentic-sdlc` call. Plugin agents are namespaced, so the project's `sdlc-<tier>` from `init` (below) does not clash with them; the `sdlc` skill uses the project's agent when it exists. Plugin agents ignore `hooks`, `mcpServers` and `permissionMode` ([sub-agents](https://code.claude.com/docs/en/sub-agents)).
- `bin/agentic-sdlc`: on the Bash tool's PATH while the plugin is enabled ([plugins reference](https://code.claude.com/docs/en/plugins-reference)), it runs the project's `.agents/bin/agentic-sdlc`, else its `node_modules/agentic-sdlc`, else the plugin's own build. Without the plugin, call `.agents/bin/agentic-sdlc`.
- `evals/`: skill-triggering cases for `claude plugin eval` (paid runs; not part of CI). The case layout comes from `claude plugin eval init --bare`; the grader fields from the CLI's own schema, as the public docs do not list them.

What `init --harness claude` writes:
- `.agents/cli.json` (the CLI pin), `.agents/bin/agentic-sdlc` (the launcher), `.agents/binding.yml`, `.agents/scorers/`, the gate templates for your forge, the runner prompts.
- The skills in `.agents/skills/`, named `sdlc-<skill>` (`sdlc` stays `sdlc`): the gates and `validate` read them. Claude Code itself takes the skills from the plugin.
- One subagent per tier in `.claude/agents/`, with the model from `models`.
- An `@AGENTS.md` import in `CLAUDE.md`. Claude Code reads `AGENTS.md` only when there is no
  `CLAUDE.md`; with one, a plain "read AGENTS.md" line is not loaded, the `@` import is
  ([memory](https://code.claude.com/docs/en/memory)).
- With `--no-plugin` only: the skills in `.claude/skills/` (named as in `.agents/skills/`) and an `agentic-sdlc mcp` entry in `.mcp.json` (project
  scope; `type` is required and `${VAR}` expands: [mcp](https://code.claude.com/docs/en/mcp)). A cloud session
  loads no repo plugin, only `.claude/skills/`, so a repo that runs cloud routines uses `--no-plugin`.

The init log is the exact list.

## Run one cycle by hand
```bash
claude -p "/agentic-sdlc:sdlc run one cycle"   --plugin-dir .agents/.cli/<ref>/node_modules/agentic-sdlc   --permission-mode acceptEdits   --allowedTools "Bash(agentic-sdlc *)" "Bash(git add *)" "Bash(git commit *)" "Bash(git push *)" "Bash(npm run *)" "Bash(npm test *)" "mcp__agentic-sdlc" "mcp__plugin_agentic-sdlc_agentic-sdlc"   --disallowedTools "Bash(agentic-sdlc forge approve *)"   --max-turns 200 --output-format json
```
Since v2.1.302 `-p` starts in Manual mode when nothing sets a mode, so a tool call that needs
approval is denied and the run can exit 0 having done nothing: set the mode and list what the
cycle needs. Permission rules use the space form `Bash(agentic-sdlc *)` (put `.agents/bin` on `PATH` first, as `runner-setup.sh` does in CI)
([permissions](https://code.claude.com/docs/en/permissions), [headless](https://code.claude.com/docs/en/headless)).
Prompt text:
[`templates/runner/cycle-prompt.md`](../../templates/runner/cycle-prompt.md). With two identities,
reviews run after the cycle as a separate job with [`templates/runner/review-prompt.md`](../../templates/runner/review-prompt.md):
only that job gets `AGENTIC_REVIEW_TOKEN` and allows `forge approve`. With one identity the cycle runs `review/review`.

## Run on your machine
A scheduler on your machine runs the command above in a separate clone, with no sandbox. Opt in with
`sandbox: local` and `AGENTIC_SDLC_LOCAL=1`: [`templates/runner/local.md`](../../templates/runner/local.md).

## Run without your machine - Individual
Subscription only.

| Option | How | Limits |
|---|---|---|
| Scheduled task (cloud) | Create at claude.ai/code/routines or with `/schedule`. Saved prompt, repo, connectors; schedule, API or GitHub-event trigger. Template: [`templates/runner/claude-routine.md`](../../templates/runner/claude-routine.md). Board: `github-issues`, or `jira`/`linear` with the host in the environment's allowed domains and the token as a network secret (hosts and header per adapter, and the setup script that installs the pinned CLI through the launcher, are in the template; neither is proved in a cloud run yet); not `github` (Projects v2), which the GitHub proxy cannot reach (no GraphQL, no `orgs/*` or `users/*`). | Research preview. Shortest interval 1 hour. 100 scheduled runs per hour per account; Run-now and API fires 30 per hour per task. Runs draw the same plan usage as interactive work. Docker is available; a foreground command waits 2 minutes by default, up to 10, then can run in the background for up to 30 more minutes (`BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` raise both). `commands.verify` still runs in CI as the gate. It acts as your claude.ai user. Clone and push need GitHub (GitLab and Bitbucket cannot push back). `/schedule` needs a claude.ai login, not an API key. [docs](https://code.claude.com/docs/en/routines) |
| CI cron with a subscription token | `claude setup-token` prints a one-year OAuth token; store it as `CLAUDE_CODE_OAUTH_TOKEN`. The template fails when `ANTHROPIC_API_KEY` is also set, since it would win and bill the API. Template: [`templates/runner/github-actions-claude.yml`](../../templates/runner/github-actions-claude.yml) | The token only makes model requests: no claude.ai connectors. `ANTHROPIC_API_KEY`, if set, wins. `--bare` ignores the subscription login. Subscription tokens are tied to one person. [auth](https://code.claude.com/docs/en/authentication), [action](https://code.claude.com/docs/en/github-actions) |

Terms caveat: Anthropic does not allow third-party products to offer claude.ai login or rate limits, including agents
built on the Agent SDK ([docs](https://code.claude.com/docs/en/agent-sdk/overview)). Your own repo on your own subscription is
not that case, but the legal page says the Pro and Max limits assume "ordinary, individual usage" of Claude Code and the Agent SDK, and `claude -p` on a plan draws subscription limits.
Zero-Data-Retention, HIPAA and CMEK orgs cannot use cloud sessions ([docs](https://code.claude.com/docs/en/claude-code-on-the-web)).

## Run without your machine - Organization
Use API keys, not a person's login.

| Path | How |
|---|---|
| GitHub Action | `anthropics/claude-code-action@v1` with `ANTHROPIC_API_KEY` (recommended for org-wide use). [`templates/runner/github-actions-claude.yml`](../../templates/runner/github-actions-claude.yml), [docs](https://code.claude.com/docs/en/github-actions) |
| Managed Agents | Create an agent (model, system, tools, MCP servers, skills) and an environment. Start with `POST /v1/sessions`, or schedule with `POST /v1/deployments` (cron `schedule`, per-run `budget`). Beta header `anthropic-beta: managed-agents-2026-04-01`. Not ZDR or HIPAA eligible. Self-hosted sandboxes exist. [overview](https://platform.claude.com/docs/en/managed-agents/overview), [sessions](https://platform.claude.com/docs/en/managed-agents/sessions), [deployments](https://platform.claude.com/docs/en/managed-agents/scheduled-deployments). Template: [`templates/runner/claude-managed-deployment.json`](../../templates/runner/claude-managed-deployment.json) |

How `executors` kinds map:

| Binding kind | Claude |
|---|---|
| `harness` | The Claude session that runs the cycle spawns a subagent. |
| `managed` | A Managed Agents session. `agent_env` holds the agent id, `environment_env` the environment id, `token_env` the key (`endpoint_env` optionally overrides the API URL). The session id goes in the ledger. |
| `webhook` | Your service starts a session or fires a scheduled task (`POST .../v1/claude_code/routines/<trig_id>/fire`, per-task bearer token; claude.ai users only, not the Platform API: [docs](https://code.claude.com/docs/en/routines)). |
| `assign` | Assigning an issue to Claude: not found. The closest is the scheduled-task Issue trigger, or an `@claude` comment through the GitHub Action ([docs](https://code.claude.com/docs/en/github-actions)). |
| `command` | `claude -p ...` as `run`. |

## Use it as a stage executor
Give `build` to a Managed Agents agent and keep the rest on the harness:
```yaml
executors:
  default: { kind: harness }
  build: { kind: managed, api: claude, agent_env: IMPL_AGENT_ID, environment_env: IMPL_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY, sandbox: cloud }
```
The agent needs the skills (attach the plugin's `skills/`), the CLI or MCP server, and the listed secrets. A session can override model, tools, MCP servers
and skills per run (`agent_with_overrides`). The reviewer is never the implementer of the same CR.

## Limits and unknowns
- Scheduled tasks and Managed Agents are preview or beta; headers and limits change.
- The GitHub trigger does not cover forks; auto-fix does not react to merge conflicts.
- Anthropic-hosted sessions fail if your org uses IP allowlisting without an exemption.
- Managed Agents GitHub resource, skills attach format and webhook signing: not verified here.
- Claude Code does not read `.agents/skills`; it gets the skills from the plugin, or from `.claude/skills` (`--no-plugin`).
