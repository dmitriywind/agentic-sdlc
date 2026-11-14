# Cursor

## What you get
- Cursor CLI (`agent`) for headless runs.
- Cloud Agents that run in Cursor's cloud, started from the web, Slack, GitHub, Linear or an API.
- Automations: cloud agents on triggers (schedule, GitHub, webhook and others).
- Bugbot for PR review.

## Install
```bash
npx --no agentic-sdlc init --harness cursor --profile individual --board github --forge github --vcs git
```
Files it writes:
- `.agents/binding.yml`, the skills in `.agents/skills/` (Cursor reads project `.agents/skills/` and `.cursor/skills/`: [docs](https://cursor.com/docs/skills)), gate templates, and an `AGENTS.md` pointer (Cursor supports root and nested `AGENTS.md`: [docs](https://cursor.com/docs/context/rules)).
- An `agentic-sdlc mcp` entry in `.cursor/mcp.json` ([docs](https://cursor.com/docs/context/mcp)).

The init log is the exact list; the `--harness` flag decides. Only `~/.cursor/skills/` syncs to Cloud Agents per the skills page; whether repo skills load in Cloud Agents beyond that is not documented at the time of writing.

## Run one cycle by hand
```bash
agent -p --force "Load the sdlc skill and run one cycle." --output-format json
```
Without `--force` the CLI only proposes changes. Log in with `agent login` or set `CURSOR_API_KEY`. [docs](https://cursor.com/docs/cli/headless)
Prompt text: [`templates/runner/cycle-prompt.md`](../../templates/runner/cycle-prompt.md). Reviews run as a separate scheduled run with [`templates/runner/review-prompt.md`](../../templates/runner/review-prompt.md); only that run gets `AGENTIC_REVIEW_TOKEN`.

## Run without your machine - Individual
| Option | How | Limits |
|---|---|---|
| Automation | Create at cursor.com/automations or `/automate`: a schedule (presets or cron; may start late, never early) or a GitHub, GitLab, Bitbucket Cloud, Slack, Linear, Sentry, PagerDuty or private-webhook trigger. Template: [`templates/runner/cursor-automation.md`](../../templates/runner/cursor-automation.md). [docs](https://cursor.com/docs/cloud-agent/automations) | Fork PRs not supported. Billed as cloud agent usage. |
| Cloud Agent by hand | cursor.com/agents, phone app, Slack `@cursor`, `@cursor` on a PR or issue. [docs](https://cursor.com/docs/cloud-agent) | Needs Premium or higher, Teams, Enterprise or legacy paid; not Free or Plus. Usage is billed from the plan at the model rate, with a spend limit prompt. |
| CI cron with the CLI | `agent -p` in a job with the secret `CURSOR_API_KEY`. [docs](https://cursor.com/docs/cli/github-actions) | Whether CLI use with that key bills against the subscription or separately: not documented at the time of writing. |

## Run without your machine - Enterprise
- Cloud Agents API (beta): `POST /v1/agents` with `prompt.text`, `repos[].url`, `repos[].startingRef`, `autoCreatePR`, `model`, `mcpServers`, `envVars`. Follow-ups `POST /v1/agents/{id}/runs`; stream `GET .../runs/{runId}/stream`; cancel and usage endpoints. Auth is Basic or Bearer with a user or service-account key. Default rate limit 20 requests per minute per endpoint. [endpoints](https://cursor.com/docs/cloud-agent/api/endpoints), [api](https://cursor.com/docs/api)
- Automations can "Run as" a team service account ([docs](https://cursor.com/docs/cloud-agent/automations)).
- Environments come from `.cursor/environment.json`; network allowlist and hooks run in the cloud. SCM: GitHub (including Enterprise Server), GitLab (including self-hosted), Bitbucket Cloud, Azure DevOps ([docs](https://cursor.com/docs/cloud-agent)).
- Webhooks in the v1 API: not yet ("coming soon"). Poll the run or stream it.

How `executors` kinds map:

| Binding kind | Cursor |
|---|---|
| `harness` | The Cursor agent (cloud or CLI) that runs the cycle. |
| `managed` | The Cloud Agents API: `endpoint_env` the API base, `token_env` the key, `agent_env` an agent id to follow up on. How the CLI maps this onto `POST /v1/agents`: see the template. |
| `webhook` | Your service calls `POST /v1/agents`, or posts to an Automation's private webhook URL. |
| `assign` | An `@cursor` comment on a PR or issue, or Linear `@cursor` ([docs](https://cursor.com/docs/cloud-agent)). Assigning a user account: not documented at the time of writing. |
| `command` | `agent -p --force ...` as `run`. |

## Use it as a stage executor
Hand `implement-spec` to a Cloud Agent through the API, and use Bugbot as an extra reviewer signal:
```yaml
executors:
  default: { kind: harness }
  implement-spec: { kind: managed, api: cursor, token_env: CURSOR_API_KEY, repo_url: "https://github.com/<owner>/<repo>", sandbox: cloud }
```
Bugbot reviews each PR update and reads `.cursor/BUGBOT.md` ([docs](https://cursor.com/docs/bugbot)). Its comments are input to
`review-pr`; the `review` status still comes only from the review identity.

## Limits and unknowns
- Cloud Agents API is beta; v1 has no webhooks.
- Whether `CURSOR_API_KEY` CLI usage bills against the subscription: not documented at the time of writing.
- Rules need `.cursor/rules/*.mdc`; plain `.md` rules are ignored. `CLAUDE.md` in Cursor: not mentioned in the docs.
- Page 2 of the Cloud Agents API docs was not read; check it before relying on artifacts or archive endpoints.
