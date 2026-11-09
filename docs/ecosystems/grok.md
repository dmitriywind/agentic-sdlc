# xAI Grok

## What you get
- Grok Build CLI `grok`: early beta launched 2026-05-25 ([post](https://x.ai/news/grok-build-cli)). Announced for SuperGrok and X Premium+ subscribers; I could not confirm the current plan terms.
- Grok Bot: "AI teammates on a cloud computer" with scheduled routines and Slack triggers ([docs](https://docs.x.ai/grok-bot/overview)).
- The xAI API with a remote MCP tool ([docs](https://docs.x.ai/docs/guides/tools/remote-mcp-tools)).

This is the least documented ecosystem here. Treat the unknowns as real.

## Install
```bash
npx agentic-sdlc init --harness grok --profile individual --board github --forge github --vcs git
```
Files it writes:
- `.agents/binding.yml`, gate templates, and an `AGENTS.md` pointer (Grok walks `AGENTS.md` from the cwd to the repo root: [docs](https://docs.x.ai/build/features/skills-plugins-marketplaces)).
- Skills: Grok reads project `./.grok/skills/`, user `~/.grok/skills/` and `~/.agents/skills/`, and reads Claude Code skills (`.claude/skills`) automatically. A project `.agents/skills` is not documented at the time of writing. Grok cannot load the Claude Code plugin; `init --harness grok` copies the skills to both `.agents/skills/` and `.claude/skills/`.
- MCP: Grok's own MCP config path, format and transport: not documented at the time of writing (the page 404s). Grok reads Claude Code MCP config automatically, and `/mcps` manages servers. Run `grok inspect` to list the instructions, skills, hooks and MCP servers it found. If MCP is not picked up, use the CLI verbs: `npx agentic-sdlc ...`.

## Run one cycle by hand
```bash
grok -p "Load the sdlc skill and run one cycle." --output-format json --always-approve
```
Auth: browser sign-in on first launch, `grok login --device-auth` for headless hosts, or `XAI_API_KEY`. Flags: `-p`, `-m`, `-c`, `--cwd`,
`--output-format plain|json|streaming-json`, `--no-auto-update`. Exit codes and a GitHub Actions example: not documented at the time of writing.
[docs](https://docs.x.ai/build/cli/headless-scripting) Prompt text: [`templates/runner/cycle-prompt.md`](../../templates/runner/cycle-prompt.md). Reviews run as a separate scheduled run with [`templates/runner/review-prompt.md`](../../templates/runner/review-prompt.md); only that run gets `AGENTIC_REVIEW_TOKEN` (`forge.review_runtime: separate`).

## Run without your machine - Individual
Template and steps: [`templates/runner/grok.md`](../../templates/runner/grok.md).

| Option | How | Limits |
|---|---|---|
| Grok Bot routine | A scheduled routine or Slack trigger on the bot's cloud computer, with MCP or API custom tooling. [docs](https://docs.x.ai/grok-bot/overview) | Plans, API and GitHub triggers: not documented at the time of writing. Give it the CLI verbs or an `agentic-sdlc mcp --http` endpoint. |
| Grok Tasks or Automations on grok.com | Official xAI documentation: not found. Only third-party reports exist; do not rely on them. | Not documented at the time of writing. |
| CI cron with `grok -p` | Run `grok login --device-auth` once on the runner, or use `XAI_API_KEY`. | Whether headless use works on a SuperGrok login in CI, and its billing and terms: not documented at the time of writing. The docs say a prior `grok login` cached token is used. |

## Run without your machine - Enterprise
- `XAI_API_KEY` on any job runner with `grok -p`; enterprise OIDC/SSO and `/etc/grok/requirements.toml` exist, and `disable_api_key_auth` forces the IdP ([docs](https://docs.x.ai/build/enterprise)).
- The Responses API at `https://api.x.ai/v1` takes a remote MCP tool (`type: mcp`, `server_url`, `server_label`, `allowed_tools`, `authorization`). Streamable HTTP and SSE only; stdio is not supported. So expose the factory with `agentic-sdlc mcp --http` behind TLS and a bearer token ([docs](https://docs.x.ai/docs/guides/tools/remote-mcp-tools)).

How `executors` kinds map:

| Binding kind | Grok |
|---|---|
| `harness` | The `grok` run that executes the cycle. |
| `managed` | A call to the xAI API with the remote MCP tool pointing at the factory. A hosted-agent API with sessions: not documented at the time of writing, so you write the loop. |
| `webhook` | Your service runs the Grok API or CLI and writes to the board and forge. |
| `assign` | GitHub or issue triggers for Grok: not documented at the time of writing. |
| `command` | `grok -p ...` as `run`. |

## Use it as a stage executor
Only a `command` executor is documented enough to use:
```yaml
executors:
  default: { kind: harness }
  triage-signal: { kind: command, run: "grok -p \"$(cat {prompt_file})\" --always-approve --no-auto-update", secrets: [AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN, XAI_API_KEY], sandbox: container }
```
Keep it to low-risk stages first. Do not list the review token in its `secrets`.

## Limits and unknowns
- CLI is an early beta; plan terms are unconfirmed.
- Grok MCP config path, format and transport: not documented at the time of writing.
- Scheduling for consumer Grok: no official page found.
- Headless billing, exit codes and CI examples: not documented at the time of writing.
