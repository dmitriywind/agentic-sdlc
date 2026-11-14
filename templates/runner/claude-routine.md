# Claude cloud scheduled task (routine)

Profile: individual (also works on Team/Enterprise seats). Research preview; needs a claude.ai login (not an API key, Bedrock or Vertex).
Install at: claude.ai/code/routines, or `/schedule` in Claude Code. The task belongs to, and acts as, one claude.ai account.
Usage: scheduled runs draw the same subscription usage as interactive work. The shortest schedule interval is 1 hour.
Skills: a cloud session loads no repo plugin, only `.claude/skills/`. Install with
`npx --no agentic-sdlc init --harness claude --no-plugin` and commit `.claude/skills/` and `.mcp.json`.
Board: the GitHub proxy refuses GraphQL and every `orgs/*` and `users/*` route, so a `github` (Projects v2)
board is out of reach; `doctor` fails on it in a cloud session. Use one of:
- `github-issues`: reached through `repos/{owner}/{repo}/...`, with the session's own GitHub auth.
- `jira` or `linear`: add the host (`<site>.atlassian.net` or `api.linear.app`) to the environment's allowed
  domains, and put the board token in the environment as a network secret (it is never sent to GitHub).
A `github` board runs from GitHub Actions instead (`github-actions-claude.yml`); Actions is an option for any board.
Verify: a cloud session has no Docker daemon and stops a foreground command at 10 minutes (2 hours in the
background). The cycle runs `commands.fast_check`; `commands.verify` runs in CI as the `Required` check.
Draft and merge: on a private repo on GitHub Free a draft CR is a PR with the `draft` label, and `forge automerge`
merges directly once every `forge.required_checks` entry is green; no gate blocks that merge.
Secrets: none for the model. The repo needs the Claude GitHub App or `/web-setup`; the session's `GH_TOKEN` is a placeholder the proxy replaces.
Models: set the binding's `models` to Claude ids, for example Sonnet for `fast` and `balanced`, Opus for `deep`.
Proxy: Linear and Jira calls go out through the session's network proxy only when Node reads the proxy env:
add `NODE_USE_ENV_PROXY=1` to both environments (Node 24 or newer).
Two routines, two cloud environments:
- cycle environment: AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN, AGENTIC_SDLC_UNATTENDED=1, AGENTIC_REVIEW_FIRE_CMD, NODE_USE_ENV_PROXY=1. Never AGENTIC_REVIEW_TOKEN.
- review environment: the same plus AGENTIC_REVIEW_TOKEN and AGENTIC_SDLC_ROLE=review (the names your binding uses).

1. Create both cloud environments for the repo with the env vars above; set each setup script to `sh .agents/runner-setup.sh`.
2. Cycle routine on the cycle environment: paste the text of `cycle-prompt.md` below the `---` line as the prompt; pick the binding's `models.fast` model (Sonnet).
3. Review routine on the review environment: paste the text of `review-prompt.md` below the `---` line as the prompt.
4. Triggers: the cycle routine on a Schedule (custom cron, at least 1 hour apart); the review routine on an API trigger that the cycle fires when a CR needs a review (`AGENTIC_REVIEW_FIRE_CMD`, see `routine.md`). Limit: 100 scheduled runs per hour per account.
5. Optional API trigger: `POST https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire`,
   `Authorization: Bearer <per-task token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, optional body `text`.
   Limit: 30 fires per hour per task.
6. A routine pushes only `claude/*` branches by default: set `vcs.change_pattern: claude/feature/<ticket>-<name>` and
   `vcs.factory_change_pattern: claude/sdlc/<name>` in the binding, or allow unrestricted branch pushes on the routine.
7. Cloud sessions run against GitHub, the one forge agentic-sdlc supports.
