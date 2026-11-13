# Claude cloud scheduled task (routine)

Profile: individual (also works on Team/Enterprise seats). Research preview; needs a claude.ai login (not an API key, Bedrock or Vertex).
Install at: claude.ai/code/routines, or `/schedule` in Claude Code. The task belongs to, and acts as, one claude.ai account.
Secrets: none for the model. The repo needs the Claude GitHub App or `/web-setup`.
Two routines, two cloud environments:
- cycle environment: AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN, AGENTIC_SDLC_UNATTENDED=1, AGENTIC_REVIEW_FIRE_CMD. Never AGENTIC_REVIEW_TOKEN.
- review environment: the same plus AGENTIC_REVIEW_TOKEN and AGENTIC_SDLC_ROLE=review (the names your binding uses).
Plugin: the prompts start with `/agentic-sdlc:sdlc`. Enable the plugin for the repo in `.claude/settings.json` (`extraKnownMarketplaces` with `{ "agentic-sdlc": { "source": { "source": "github", "repo": "dmitriywind/agentic-sdlc" } } }` and `enabledPlugins: { "agentic-sdlc@agentic-sdlc": true }`); without it the prompt falls back to `.agents/skills/`.

1. Create both cloud environments for the repo with the env vars above; set each setup script to `sh .agents/runner-setup.sh`.
2. Cycle routine on the cycle environment: paste the text of `cycle-prompt.md` below the `---` line as the prompt.
3. Review routine on the review environment: paste the text of `review-prompt.md` below the `---` line as the prompt.
4. Triggers: the cycle routine on a Schedule (custom cron); the review routine on an API trigger that the cycle fires when it ends (`AGENTIC_REVIEW_FIRE_CMD`, see `routine.md`). Limit: 100 scheduled runs per hour per account.
5. Optional API trigger: `POST https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire`,
   `Authorization: Bearer <per-task token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, optional body `text`.
   Limit: 30 fires per hour per task.
6. Branches pushed by a routine carry a `claude/` prefix: allow that prefix in the forge rules and trunk gate.
7. Cloud sessions run only against GitHub; for GitLab or Bitbucket use `gitlab-ci-cycle.yml` instead.
