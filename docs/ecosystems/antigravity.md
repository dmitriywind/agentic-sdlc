# Google Antigravity

## What you get
- Antigravity CLI `agy` (headless `agy -p`), the App, IDE and a Python SDK ([docs](https://antigravity.google/docs/getting-started)).
- Remote Agents: Google-managed cloud agents that run without your machine.
- A Gemini API "Antigravity agent" (preview) for API use.

## Install
```bash
npx --no agentic-sdlc init --harness antigravity --profile individual --board github --forge github --vcs git
```
Files it writes:
- `.agents/binding.yml`, the skills in `.agents/skills/` (the workspace path Antigravity reads, parents up to the repo root: [docs](https://antigravity.google/docs/skills)), gate templates, and an `AGENTS.md` pointer (Antigravity reads `AGENTS.md` or `GEMINI.md`, 24,000 bytes per file: [docs](https://antigravity.google/docs/rules)).
- An `agentic-sdlc mcp` entry in `.agents/mcp_config.json` (workspace scope; stdio `command,args,env,cwd`, or remote Streamable HTTP with `url` and `headers`: [docs](https://antigravity.google/docs/mcp)).

The init log is the exact list; the `--harness` flag decides. The CLI turns each skill into a slash command.

## Run one cycle by hand
```bash
agy -p "Load the sdlc skill and run one cycle." --output-format json
```
Needs a prior interactive login; an unauthenticated non-TTY run exits "authentication required". Unapproved tools are soft-denied
(exit 0) unless `permissions.allow` lists them or you pass `--dangerously-skip-permissions`. No API-key variable is documented.
[docs](https://antigravity.google/docs/cli/headless) Prompt text: [`templates/runner/cycle-prompt.md`](../../templates/runner/cycle-prompt.md). Reviews run as a separate scheduled run with [`templates/runner/review-prompt.md`](../../templates/runner/review-prompt.md); only that run gets `AGENTIC_REVIEW_TOKEN`.

## Run without your machine - Individual
| Option | How | Limits |
|---|---|---|
| Remote Agents | `agy --remote-agent` (CLI 1.4.12 or later). Google-managed cloud; GitHub repos come in by OAuth and are cloned into the remote workspace. Template: [`templates/runner/antigravity-remote-agent.md`](../../templates/runner/antigravity-remote-agent.md). [docs](https://antigravity.google/docs/remote-agents) | Google AI Pro or Ultra personal account only (not Workspace, Cloud business, free or Plus). In remote sessions print mode, MCP, and local plugins and skills are unavailable. Uploads are capped. |
| `/schedule` | A slash command: cron expression plus instruction. [docs](https://antigravity.google/docs/slash-commands) | Where it executes and whether your machine must stay on: not documented at the time of writing. |
| CI cron with `agy -p` | Cached login on a runner. | See the terms caveat. |

Terms caveat: the FAQ says `agy -p` is for scripting and CI, but wrapping `agy` inside third-party coding agents or applications is "not supported under consumer plans", and third-party tools using your Antigravity login may violate the ToS and get the account suspended ([FAQ](https://antigravity.google/docs/faq)). Whether a plain cron around `agy -p` for your own repo is allowed: not documented at the time of writing. The FAQ recommends a Gemini Enterprise or Google AI Studio API key for third-party agents.

Because remote sessions have no MCP and no local skills, the remote agent runs the CLI verbs from the repo checkout: `npx --no agentic-sdlc ...`.

## Run without your machine - Enterprise
Gemini API Antigravity agent (preview), through the Interactions API: `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `agent: "antigravity-preview-09-2026"` and `environment: "remote"` (or an environment id). It can mount `AGENTS.md` and `.agents/skills/` into the sandbox, use remote MCP over Streamable HTTP, and run with `background: true` plus poll or cancel. Triggers are cron schedules (default 5 consecutive failures, 600 s timeout). `max_total_tokens` caps spend. Billing is pay-as-you-go tokens. No webhooks documented. [docs](https://aistudio.google.com/docs/antigravity-agent.md.txt)

How `executors` kinds map:

| Binding kind | Antigravity |
|---|---|
| `harness` | The `agy` or remote agent run that executes the cycle. |
| `managed` | An Interactions API call with the Antigravity agent. `endpoint_env` the API URL, `token_env` the Gemini key. |
| `webhook` | Your service calls the Interactions API (the API itself has no inbound webhook). |
| `assign` | GitHub issue or PR triggers for Antigravity: not found at the time of writing. |
| `command` | `agy -p ...` as `run`, with the terms caveat above. |

## Use it as a stage executor
Hand `verify-ux` or `implement-spec` to the Antigravity agent through the API and keep the rest on the harness:
```yaml
executors:
  default: { kind: harness }
  implement-spec: { kind: managed, api: antigravity, token_env: GEMINI_API_KEY, sandbox: cloud, secrets: [NPM_TOKEN] }
```
Expose the board to it with `agentic-sdlc mcp --http` behind TLS (see [generic.md](generic.md)).

## Limits and unknowns
- Where `/schedule` runs: not documented at the time of writing.
- Official answer on subscription-based `agy -p` orchestration: not documented at the time of writing.
- GitHub triggers: not found.
- Gemini API agent limits and pricing are preview and not fully documented at the time of writing.
