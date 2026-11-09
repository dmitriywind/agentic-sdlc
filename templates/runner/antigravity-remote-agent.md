# Antigravity remote agent / Gemini API agent

Profile: individual (remote agent, Google AI Pro/Ultra personal account) or enterprise (Gemini API).
Install at: the Antigravity CLI (`agy`) for the remote agent, or an HTTPS call for the API.
Secrets: AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN, AGENTIC_SDLC_UNATTENDED=1; AGENTIC_REVIEW_TOKEN for the review task only; the API path also needs a Gemini API key (set: variable name per the Gemini docs).
Two tasks (`forge.review_runtime: separate`): the cycle task runs `cycle-prompt.md` and never holds AGENTIC_REVIEW_TOKEN; the review task runs `review-prompt.md`, with the token, when the cycle ends (`AGENTIC_REVIEW_FIRE_CMD`, see `routine.md`).

Individual (remote agent):
1. Needs a Google AI Pro or Ultra personal account (not Workspace or Cloud business). Connect GitHub via OAuth; the repo is cloned into the remote workspace.
2. Start with `agy --remote-agent` (CLI 1.4.12 or later). Remote print mode has no MCP and no local plugins or skills, so use the shell route (`npx agentic-sdlc ...`) and read `.agents/skills/sdlc/SKILL.md` from the checkout.
3. Scheduling: the `/schedule` slash command takes a cron expression and an instruction (one for the cycle, one for the review just after it; the review token only in the review's session). Unknown: where it executes and whether your machine must stay on. Do not rely on it until verified.
4. Do not wrap `agy -p` in a CI job or third-party agent on a consumer plan: Google's FAQ says that is unsupported and may suspend the account.

Enterprise (Gemini API Antigravity agent, preview):
1. `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `agent: "antigravity-preview-09-2026"`, `environment: "remote"`, `background: true`; the sandbox can mount `AGENTS.md` and `.agents/skills/`.
2. Remote MCP is streamable HTTP only: host the server with `agentic-sdlc mcp --http` and a bearer token.
3. Triggers: a cron schedule (defaults: 5 consecutive failures, 600 s timeout). Cap spend with `max_total_tokens`. No webhooks are documented.
4. Prompt: the text of `cycle-prompt.md` below the `---` line; a second interaction, started by the cycle when it ends, sends `review-prompt.md` with the review token as its only extra secret. Unknown: the request fields for repo access and secrets (set: per the Gemini API docs).

Not found: GitHub or GitLab issue/PR triggers for Antigravity.
