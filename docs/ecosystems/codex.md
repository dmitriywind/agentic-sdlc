# OpenAI Codex

## What you get
- Codex CLI with `codex exec` for headless runs.
- Codex cloud tasks and ChatGPT scheduled tasks.
- `openai/codex-action` for CI and `@codex` on GitHub.

OpenAI's `developers.openai.com/codex/*` pages redirect to `learn.chatgpt.com/docs/*`; links below use the final host.

## Install
```bash
npx --no agentic-sdlc init --harness codex --profile individual --board github --forge github --vcs git
```
Files it writes:
- `.agents/binding.yml`, the skills in `.agents/skills/` (the path Codex scans from the working directory up to the repo root: [docs](https://learn.chatgpt.com/docs/build-skills); `.codex/skills` is not listed), gate templates, and an `AGENTS.md` pointer (Codex reads `AGENTS.md`: [docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md)).
- An `agentic-sdlc mcp` entry under `[mcp_servers.agentic-sdlc]` in `.codex/config.toml` (project config loads for trusted projects only: [docs](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)). Or by hand: `codex mcp add agentic-sdlc -- npx --no agentic-sdlc mcp`.

The init log is the exact list; the `--harness` flag decides.

## Run one cycle by hand
```bash
codex exec --sandbox workspace-write "Load the sdlc skill and run one cycle."
```
Progress goes to stderr and the final message to stdout. `--json` gives JSONL events, `-o` writes the last message to a file.
The default sandbox is read-only, so set `workspace-write`. [docs](https://learn.chatgpt.com/docs/non-interactive-mode)
Prompt text: [`templates/runner/cycle-prompt.md`](../../templates/runner/cycle-prompt.md). Reviews run as a separate scheduled run with [`templates/runner/review-prompt.md`](../../templates/runner/review-prompt.md); only that run gets `AGENTIC_REVIEW_TOKEN` (`forge.review_runtime: separate`).

## Run without your machine - Individual
| Option | How | Limits |
|---|---|---|
| ChatGPT scheduled tasks | The "Scheduled" view in ChatGPT: time-based (custom or RRULE) or event-triggered (Gmail, Slack, GitHub PR activity; web and mobile only; cannot combine event and time). Skills work as `$skill-name`. [docs](https://learn.chatgpt.com/docs/automations) | Desktop tasks need the computer on. Web tasks cannot touch local folders. Webhook triggers are not mentioned on the page. Plan requirements and usage limits: not documented at the time of writing. |
| Codex cloud tasks | Start from web, desktop, mobile, CLI or GitHub; environments hold repos, secrets, network and setup scripts; runs while your computer sleeps. [docs](https://learn.chatgpt.com/docs/cloud) | Plan requirements, limits and a public API to start tasks: not documented at the time of writing. |
| CI cron with ChatGPT login | Seed `auth.json` (`codex login`, file credential store) in a secret manager; restore and write back each job; one `auth.json` per runner, never concurrent; tokens refresh about every 8 days. [docs](https://learn.chatgpt.com/docs/auth/ci-cd-auth) | The docs call it an advanced path for trusted runners, not public repos, and say "The right way to authenticate automation is with an API key". |

Template: [`templates/runner/github-actions-codex.yml`](../../templates/runner/github-actions-codex.yml). The documented auth input of
`openai/codex-action@v1` is `openai-api-key` only; ChatGPT login there: not documented at the time of writing ([docs](https://learn.chatgpt.com/docs/github-action)).

## Run without your machine - Enterprise
- `openai/codex-action@v1` with `openai-api-key`: wraps `codex exec`; inputs `prompt`, `sandbox`, `model`, `effort`, `safety-strategy` (default drops sudo), `allow-users`; output `final-message`. [docs](https://learn.chatgpt.com/docs/github-action)
- `codex exec` in any job runner with `CODEX_API_KEY` for the run. [docs](https://learn.chatgpt.com/docs/non-interactive-mode)
- Team Tasks run in the cloud through a team service account ([docs](https://learn.chatgpt.com/docs/automations)).
- GitLab, Azure and Bitbucket: run `codex exec` in the forge's CI, same as [`templates/runner/gitlab-ci-cycle.yml`](../../templates/runner/gitlab-ci-cycle.yml) with the Codex command.

How `executors` kinds map:

| Binding kind | Codex |
|---|---|
| `harness` | The Codex run that executes the cycle. |
| `managed` | No public API to start Codex cloud tasks is documented at the time of writing. Do not use. |
| `webhook` | Your own service that runs `codex exec` and writes to the board and forge. |
| `assign` | Assigning issues to Codex: not stated in the official GitHub page. Use an `@codex` comment instead (below). |
| `command` | `codex exec ...` as `run`. |

## Use it as a stage executor
`@codex review` on a PR starts a standard review (P0 and P1 only); `@codex security review`; any other `@codex ...` comment
starts a cloud task with the PR as context, for example fix CI ([docs](https://learn.chatgpt.com/docs/third-party/github)).
So a `command` executor for `review-pr` or `implement-spec` can post that comment through `forge comment`.
```yaml
executors:
  default: { kind: harness }
  implement-spec: { kind: command, run: "codex exec --sandbox workspace-write --skip-git-repo-check \"$(cat {prompt_file})\"", secrets: [AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN, CODEX_API_KEY], sandbox: container }
```
`secrets` are the only env vars the child receives; never list `AGENTIC_REVIEW_TOKEN` for an implementer.
Codex's own review is advisory. The `review` status and approval still come only from the review identity.

## Limits and unknowns
- Plan requirements and limits for cloud tasks and scheduled tasks: not documented at the time of writing.
- Webhook triggers for scheduled tasks: not documented at the time of writing.
- Issue assignment to Codex: not documented at the time of writing.
- ChatGPT login with `codex-action`: not documented at the time of writing.
