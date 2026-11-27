# Scheduling the factory cycle

One identity (`forge.review_identity` empty, the individual default): one prompt, the cycle (`cycle-prompt.md`,
installed at `.agents/cycle-prompt.md`). It runs `review/review` itself. Ignore the review prompt and `AGENTIC_REVIEW_FIRE_CMD`.

Two identities (required for organization): every scheduler runs two prompts, one run of each at a time:
- the cycle: `cycle-prompt.md`, WITHOUT `AGENTIC_REVIEW_TOKEN`;
- the review, started when the cycle ends: `review-prompt.md` (installed at `.agents/review-prompt.md`), the only run holding `AGENTIC_REVIEW_TOKEN` and `AGENTIC_SDLC_ROLE=review`.

The cycle never holds the review token, so an implementer cannot approve its own CR. Every run sets `AGENTIC_SDLC_UNATTENDED=1`.
The `github-issues` board uses GitHub REST only, so every runtime below reaches it, a Claude cloud routine included.
Setup step everywhere (a Claude cloud environment uses its own setup script, see `claude-routine.md`): `sh .agents/runner-setup.sh` (it also refuses `ANTHROPIC_API_KEY`). Gates run in the forge's CI whatever the runtime.

| Runtime | Template | Profile |
|---|---|---|
| GitHub Actions + Claude Code CLI | `github-actions-claude.yml` | any (OAuth token) |
| Claude cloud scheduled task (routine) | `claude-routine.md` | any |
| Your own machine (cron, launchd, Task Scheduler, a Claude Desktop scheduled task) | `local.md` (no sandbox: opt in with `sandbox: local` and `AGENTIC_SDLC_LOCAL=1`) | any |

Secrets: the Claude subscription login plus `AGENTIC_FORGE_TOKEN` (or the names the binding gives); with two identities, `AGENTIC_REVIEW_TOKEN` in the review run only.
Every `learning.every_cycles` cycles the sdlc skill runs `learn/improve`; the schedule does nothing extra.
Executors: `executors` in the binding (`references/architecture.md` section 7 in the package). Scheduled runs pass `--unattended`.

## Review after the cycle

CI templates chain with a job dependency (`needs`). A scheduler without one chains through the cycle:
put the command that starts the review run in the cycle environment as `AGENTIC_REVIEW_FIRE_CMD`; `dispatch review/review --unattended` runs it once, only when a CR needs a review. It is a trigger credential, not the review token.

- Routine: give the review routine an API trigger and set
  `AGENTIC_REVIEW_FIRE_CMD='curl -fsS -X POST "https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire" -H "Authorization: Bearer $REVIEW_FIRE_TOKEN" -H "anthropic-beta: experimental-cc-routine-2026-04-01"'`.

If nothing can chain, use the scheduler's own concurrency lock (one run of cycle or review at a time per
repo; GitHub Actions keeps one running and one pending run per group, and a newer pending run cancels the older pending one) and give both the same cadence; never pick fixed offsets such as :15 and :45.
`dispatch`'s idempotency key skips a second dispatch of the same skill and subject inside `cycle.dedupe_minutes` (a double fire). It also skips one while the previous run has not finished, until `stall_minutes` pass. So a repeated review of an unchanged head is a no-op.

A dead-man check runs `.agents/bin/agentic-sdlc ledger stale --max-hours <h>` (exit 1 when the newest heartbeat is older).
`init` installs it as its own workflow, `.github/workflows/agentic-sdlc-dead-man.yml`, for every runtime: a cloud task stopped at the usage limit writes no heartbeat, so only a check outside it sees the stop.
In a public repo GitHub disables scheduled workflows after 60 days without repo activity, so the dead-man workflow stops too; keep a check that runs elsewhere if a public repo can go quiet.
