# Scheduling the factory cycle

Every scheduler runs two prompts (`forge.review_runtime: separate`, the default), one run of each at a time:
- the cycle: `cycle-prompt.md` (installed at `.agents/cycle-prompt.md`), WITHOUT `AGENTIC_REVIEW_TOKEN`;
- the review, scheduled right after it: `review-prompt.md` (installed at `.agents/review-prompt.md`), the only run holding `AGENTIC_REVIEW_TOKEN`.

The cycle never holds the review token, so an implementer cannot approve its own CR. Both runs set `AGENTIC_SDLC_UNATTENDED=1`.
Setup step everywhere: `sh .agents/runner-setup.sh`. Gates run in the forge's CI whatever the runtime.

| Runtime | Template | Profile |
|---|---|---|
| GitHub Actions + Claude Code CLI | `github-actions-claude.yml` | individual (OAuth token) or enterprise (API key) |
| GitHub Actions + Codex CLI | `github-actions-codex.yml` | enterprise |
| GitLab scheduled pipeline + Claude Code CLI | `gitlab-ci-cycle.yml` | individual or enterprise |
| Claude cloud scheduled task (routine) | `claude-routine.md` | individual |
| Claude Managed Agents scheduled deployment | `claude-managed-deployment.json` | enterprise |
| Cursor automation | `cursor-automation.md` | individual or enterprise |
| Antigravity remote agent / Gemini API | `antigravity-remote-agent.md` | individual or enterprise |
| Grok | `grok.md` | individual or enterprise |
| Other (Azure, Bitbucket, cron) | any of the above, adapted | either |

Secrets: the agent's own credential plus `AGENTIC_BOARD_TOKEN`, `AGENTIC_FORGE_TOKEN` (or the names the binding gives); `AGENTIC_REVIEW_TOKEN` in the review run only.
Every `learning.every_cycles` cycles the sdlc skill runs `improve-factory`; the schedule does nothing extra.
Executors, intake and unattended rules: `references/architecture.md` sections 7, 9 and 10. Scheduled runs pass `--unattended`.
