# xAI Grok

Profile: individual (SuperGrok / X Premium+ login, beta) or enterprise (XAI_API_KEY, OIDC/SSO).
Install at: a CI job (adapt github-actions-claude.yml or gitlab-ci-cycle.yml, swapping the agent command) or a Grok Bot routine.
Secrets: XAI_API_KEY (CI), AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN; AGENTIC_REVIEW_TOKEN for the review job only.
Two jobs, both with `AGENTIC_SDLC_UNATTENDED=1`: the cycle job without AGENTIC_REVIEW_TOKEN, then a review job with it, run right after (as in `github-actions-claude.yml`).

1. Install the Grok Build CLI: `curl -fsSL https://x.ai/cli/install.sh | bash`. It is an early beta.
2. Auth in CI: set `XAI_API_KEY`, or run `grok login --device-auth` once on the host and reuse the cached token. Whether a subscription login is allowed in CI is not stated.
3. Skills: Grok reads `.claude/skills/` and `./.grok/skills/`; `init --harness grok` writes `.claude/skills/` as well as `.agents/skills/`. AGENTS.md is read from the cwd up to the repo root.
4. Headless cycle: `grok -p "<cycle prompt>" --always-approve --no-auto-update` (set: narrower approval if possible). Exit codes are not documented; read the heartbeat, not the exit code.
   Review job: the same command with the text of `review-prompt.md` below the `---` line.
5. MCP: Grok's own MCP config path and format were not found. It reads Claude Code MCP config automatically, so `.mcp.json` (written by `init --harness claude`) may work; `grok inspect` lists the MCP servers it sees. Otherwise use the shell route (`npx --no agentic-sdlc ...`). `init --harness grok` only prints the snippet.
6. Scheduling: no official page found for Grok Tasks or Automations. Grok Bot (cloud computer, schedule routines) exists but its plans and API are not described. Use a CI cron.
