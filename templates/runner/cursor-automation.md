# Cursor automation (cloud agent on a schedule)

Profile: individual (paid Cursor plan) or enterprise (service account). Billed as cloud agent usage; needs Premium or higher, Teams or Enterprise.
Install at: cursor.com/automations, or `/automate` in Cursor.
Secrets (cloud agent environment secrets; set: where, per cursor.com/agents; no model key is needed), two environments (`forge.review_runtime: separate`):
- cycle environment: AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN, AGENTIC_SDLC_UNATTENDED=1. Never AGENTIC_REVIEW_TOKEN.
- review environment: the same plus AGENTIC_REVIEW_TOKEN.

1. Connect the repo (GitHub, GitLab, Bitbucket Cloud or Azure DevOps are supported).
2. Environment: `.cursor/environment.json` (Dockerfile or snapshot); run `sh .agents/runner-setup.sh` as its setup step.
3. MCP: `init --harness cursor` writes the project `.cursor/mcp.json`; cloud agents use HTTP and stdio MCP configured on cursor.com/agents (set: confirm the stdio server is picked up there).
4. Skills: `.agents/skills/` is a project skill path, but only `~/.cursor/skills/` is documented as syncing to cloud agents. Unknown whether repo skills load in the cloud: test one cycle.
5. Cycle automation on the cycle environment, Schedule trigger (presets or cron; it may start late, never early). Prompt: the text of `cycle-prompt.md` below the `---` line. Optional "Run as": a team service account.
6. Review automation on the review environment, started when the cycle ends (an API trigger the cycle fires through `AGENTIC_REVIEW_FIRE_CMD`, see `routine.md`), never on its own fixed offset. Prompt: the text of `review-prompt.md` below the `---` line. If both automations must share one environment, the review token reaches the cycle: do not.
7. Fork PRs are not supported. Keep one cycle and one review automation per repo so runs never overlap.
8. API alternative: `POST /v1/agents` with `prompt.text`, `repos[].url`, `repos[].startingRef`, `autoCreatePR`; Bearer API key; 20 requests per minute. Webhooks are not in v1.
