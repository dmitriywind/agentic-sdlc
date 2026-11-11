# Scheduling the factory cycle

Every scheduler runs two prompts (`forge.review_runtime: separate`, the default), one run of each at a time:
- the cycle: `cycle-prompt.md` (installed at `.agents/cycle-prompt.md`), WITHOUT `AGENTIC_REVIEW_TOKEN`;
- the review, started when the cycle ends: `review-prompt.md` (installed at `.agents/review-prompt.md`), the only run holding `AGENTIC_REVIEW_TOKEN` and `AGENTIC_SDLC_ROLE=review`.

The cycle never holds the review token, so an implementer cannot approve its own CR. Both runs set `AGENTIC_SDLC_UNATTENDED=1`.
Setup step everywhere: `sh .agents/runner-setup.sh` (it also refuses `ANTHROPIC_API_KEY` under the individual profile). Gates run in the forge's CI whatever the runtime.

| Runtime | Template | Profile |
|---|---|---|
| GitHub Actions + Claude Code CLI | `github-actions-claude.yml` | individual (OAuth token) or enterprise (API key) |
| GitHub Actions + Codex CLI | `github-actions-codex.yml` | enterprise |
| GitLab scheduled pipeline + Claude Code CLI | `gitlab-ci-cycle.yml` | individual or enterprise |
| Claude cloud scheduled task (routine) | `claude-routine.md` | individual |
| Claude Managed Agents scheduled deployment | `claude-managed-deployment.json` (below) | enterprise |
| Cursor automation | `cursor-automation.md` | individual or enterprise |
| Antigravity remote agent / Gemini API | `antigravity-remote-agent.md` | individual or enterprise |
| Grok | `grok.md` | individual or enterprise |
| Other (Azure, Bitbucket, cron) | any of the above, adapted | either |

Secrets: the agent's own credential plus `AGENTIC_BOARD_TOKEN`, `AGENTIC_FORGE_TOKEN` (or the names the binding gives); `AGENTIC_REVIEW_TOKEN` in the review run only.
Every `learning.every_cycles` cycles the sdlc skill runs `improve-factory`; the schedule does nothing extra.
Executors: `.agents/skills/sdlc/references/executors.md`. Scheduled runs pass `--unattended`.

## Review after the cycle

CI templates chain with a job dependency (`needs`). A scheduler without one chains through the cycle:
put the command that starts the review run in the cycle environment as `AGENTIC_REVIEW_FIRE_CMD`; the
cycle prompt runs it once, after the heartbeat. It is a trigger credential, not the review token.

- Routine: give the review routine an API trigger and set
  `AGENTIC_REVIEW_FIRE_CMD='curl -fsS -X POST "https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire" -H "Authorization: Bearer $REVIEW_FIRE_TOKEN" -H "anthropic-beta: experimental-cc-routine-2026-04-01"'`.
- Managed Agents: the review deployment has no schedule; set
  `AGENTIC_REVIEW_FIRE_CMD='curl -fsS -X POST "https://api.anthropic.com/v1/deployments/<review id>/run?beta=true" -H "x-api-key: $REVIEW_FIRE_KEY" -H "anthropic-version: 2026-10-21" -H "anthropic-beta: managed-agents-2026-04-01"'`.
  If the API insists on a schedule, give the review one and pause it (`POST /v1/deployments/{id}/pause`); `/run` still starts it (unverified).

If nothing can chain, use the scheduler's own concurrency lock (one run of cycle or review at a time per
repo, queued, not dropped) and give both the same cadence; never pick fixed offsets such as :15 and :45.
`dispatch`'s idempotency key makes a repeated review of an unchanged head a no-op.

A dead-man check runs `npx --no agentic-sdlc ledger stale --max-hours <h>` (exit 1 when the newest heartbeat is older).
The CI templates have it as a job; elsewhere schedule it anywhere that alerts on failure.

## Claude Managed Agents deployment

Profile enterprise. `claude-managed-deployment.json` holds two request bodies: POST each entry of
`deployments` to `https://api.anthropic.com/v1/deployments?beta=true` with headers
`x-api-key: $ANTHROPIC_API_KEY`, `anthropic-version: 2026-10-21`, `anthropic-beta: managed-agents-2026-04-01`.
Create the agents (`/v1/agents`) and two environments (`/v1/environments`) first and put their ids in.
`budget.max_list_cost.amount` is in cents per run (`"500"` = about 5 USD). Manage with
`POST /v1/deployments/{id}/pause|unpause|run|archive`; runs: `GET /v1/deployment_runs`.
