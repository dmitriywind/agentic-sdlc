# Claude

## What you get
- Claude Code CLI: skills, MCP, headless `claude -p`.
- Cloud sessions and scheduled tasks (formerly routines) that run on Anthropic's cloud with your laptop closed.
- Managed Agents API (API-key billed): hosted agents, cloud sandboxes, cron deployments.
- A GitHub Action and a GitLab CI job that run the same prompt on your runners.

## Install
The skills, hooks and MCP server ship as a Claude Code plugin named `agentic-sdlc`, so skills are
`/agentic-sdlc:sdlc`, `/agentic-sdlc:review-pr` and so on ([plugins](https://code.claude.com/docs/en/plugins)).

```bash
npm i -D --allow-git=root github:dmitriywind/agentic-sdlc#v2.0.0-alpha.3
npx --no agentic-sdlc init --harness claude --profile individual --board github --forge github --vcs git
claude --plugin-dir ./node_modules/agentic-sdlc
```
`--plugin-dir` loads the plugin from the installed package for that session. To install it for
every session, the repo is also a plugin marketplace:

```text
/plugin marketplace add dmitriywind/agentic-sdlc
/plugin install agentic-sdlc@agentic-sdlc
```
The plugin's hook refuses a push to the trunk and allows `forge approve` only in the review runtime.

What `init --harness claude` writes:
- `.agents/binding.yml`, `.agents/scorers/`, the gate templates for your forge, the runner prompts.
- No skill copies: the plugin carries them.
- One subagent per tier in `.claude/agents/`, with the model from `models`.
- An `@AGENTS.md` import in `CLAUDE.md`. Claude Code reads `AGENTS.md` only when there is no
  `CLAUDE.md`; with one, a plain "read AGENTS.md" line is not loaded, the `@` import is
  ([memory](https://code.claude.com/docs/en/memory)).
- With `--no-plugin` only: the skills in `.claude/skills/` and an `agentic-sdlc mcp` entry in `.mcp.json` (project
  scope; `type` is required and `${VAR}` expands: [mcp](https://code.claude.com/docs/en/mcp)).

The init log is the exact list.

## Run one cycle by hand
```bash
claude -p "/agentic-sdlc:sdlc run one cycle"   --plugin-dir node_modules/agentic-sdlc   --permission-mode acceptEdits   --allowedTools "Bash(npx --no agentic-sdlc *)" "Bash(git add *)" "Bash(git commit *)" "Bash(git push *)" "Bash(npm run *)" "Bash(npm test *)" "mcp__agentic-sdlc" "mcp__plugin_agentic-sdlc_agentic-sdlc"   --disallowedTools "Bash(npx --no agentic-sdlc forge approve *)"   --max-turns 200 --output-format json
```
Since v2.1.302 `-p` starts in Manual mode when nothing sets a mode, so a tool call that needs
approval is denied and the run can exit 0 having done nothing: set the mode and list what the
cycle needs. Permission rules use the space form `Bash(npx --no agentic-sdlc *)`
([permissions](https://code.claude.com/docs/en/permissions), [headless](https://code.claude.com/docs/en/headless)).
The JSON has `total_cost_usd` (a client-side estimate). Prompt text:
[`templates/runner/cycle-prompt.md`](../../templates/runner/cycle-prompt.md). Reviews run after the
cycle, as a separate job with [`templates/runner/review-prompt.md`](../../templates/runner/review-prompt.md):
only that job gets `AGENTIC_REVIEW_TOKEN` and allows `forge approve` (`forge.review_runtime: separate`).

## Run without your machine - Individual
Subscription only.

| Option | How | Limits |
|---|---|---|
| Scheduled task (cloud) | Create at claude.ai/code/routines or with `/schedule`. Saved prompt, repo, connectors; schedule, API or GitHub-event trigger. Template: [`templates/runner/claude-routine.md`](../../templates/runner/claude-routine.md). | Research preview. 100 scheduled runs per hour per account; Run-now and API fires 30 per hour per task. Runs draw plan usage. It acts as your claude.ai user. Clone and push need GitHub (GitLab and Bitbucket cannot push back). `/schedule` needs a claude.ai login, not an API key. [docs](https://code.claude.com/docs/en/routines) |
| CI cron with a subscription token | `claude setup-token` prints a one-year OAuth token; store it as `CLAUDE_CODE_OAUTH_TOKEN`. The template fails when `ANTHROPIC_API_KEY` is also set, since it would win and bill the API. Template: [`templates/runner/github-actions-claude.yml`](../../templates/runner/github-actions-claude.yml) | The token only makes model requests: no claude.ai connectors. `ANTHROPIC_API_KEY`, if set, wins. `--bare` ignores the subscription login. Subscription tokens are tied to one person. [auth](https://code.claude.com/docs/en/authentication), [action](https://code.claude.com/docs/en/github-actions) |

Terms caveat: Anthropic does not allow third-party products to offer claude.ai login or rate limits, including agents
built on the Agent SDK ([docs](https://code.claude.com/docs/en/agent-sdk/overview)). Your own repo on your own subscription is
not that case, but the docs state no internal-use stance for `setup-token` in CI at the time of writing.
Zero-Data-Retention, HIPAA and CMEK orgs cannot use cloud sessions ([docs](https://code.claude.com/docs/en/claude-code-on-the-web)).

## Run without your machine - Enterprise
Use API keys, not a person's login.

| Path | How |
|---|---|
| GitHub Action | `anthropics/claude-code-action@v1` with `ANTHROPIC_API_KEY` (recommended for org-wide use). [`templates/runner/github-actions-claude.yml`](../../templates/runner/github-actions-claude.yml), [docs](https://code.claude.com/docs/en/github-actions) |
| GitLab CI | A job running `claude -p` with a masked `ANTHROPIC_API_KEY` (or Bedrock/Vertex OIDC); beta. [`templates/runner/gitlab-ci-cycle.yml`](../../templates/runner/gitlab-ci-cycle.yml), [docs](https://code.claude.com/docs/en/gitlab-ci-cd) |
| Managed Agents | Create an agent (model, system, tools, MCP servers, skills) and an environment. Start with `POST /v1/sessions`, or schedule with `POST /v1/deployments` (cron `schedule`, per-run `budget`). Beta header `anthropic-beta: managed-agents-2026-04-01`. Not ZDR or HIPAA eligible. Self-hosted sandboxes exist. [overview](https://platform.claude.com/docs/en/managed-agents/overview), [sessions](https://platform.claude.com/docs/en/managed-agents/sessions), [deployments](https://platform.claude.com/docs/en/managed-agents/scheduled-deployments). Template: [`templates/runner/claude-managed-deployment.json`](../../templates/runner/claude-managed-deployment.json) |

How `executors` kinds map:

| Binding kind | Claude |
|---|---|
| `harness` | The Claude session that runs the cycle spawns a subagent. |
| `managed` | A Managed Agents session. `agent_env` holds the agent id, `endpoint_env` the API URL, `token_env` the key. The session id goes in the ledger. |
| `webhook` | Your service starts a session or fires a scheduled task (`POST .../v1/claude_code/routines/<trig_id>/fire`, per-task bearer token; claude.ai users only, not the Platform API: [docs](https://code.claude.com/docs/en/routines)). |
| `assign` | Assigning an issue to Claude: not found. The closest is the scheduled-task Issue trigger, or an `@claude` comment through the GitHub Action ([docs](https://code.claude.com/docs/en/github-actions)). |
| `command` | `claude -p ...` as `run`. |

## Use it as a stage executor
Give `implement-spec` to a Managed Agents agent and keep the rest on the harness:
```yaml
executors:
  default: { kind: harness }
  implement-spec: { kind: managed, api: claude, agent_env: IMPL_AGENT_ID, environment_env: IMPL_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY, sandbox: cloud }
```
The agent needs the skills (attach the plugin's `skills/`), the CLI or MCP server, and the listed secrets. A session can override model, tools, MCP servers
and skills per run (`agent_with_overrides`). The reviewer is never the implementer of the same CR.

## Limits and unknowns
- Scheduled tasks and Managed Agents are preview or beta; headers and limits change.
- The GitHub trigger does not cover forks; auto-fix does not react to merge conflicts.
- Anthropic-hosted sessions fail if your org uses IP allowlisting without an exemption.
- Managed Agents GitHub resource, skills attach format and webhook signing: not verified here.
- Claude Code does not read `.agents/skills`; the plugin is how it gets the skills.
