# Claude cloud scheduled task (routine)

Profile: individual or individual-api (also works on Team and Enterprise seats of the Claude plan). Research preview; needs a claude.ai login (not an API key, Bedrock or Vertex).
Install at: claude.ai/code/routines, or `/schedule` in Claude Code. The task belongs to, and acts as, one claude.ai account.
Usage: scheduled runs draw the same subscription usage as interactive work. The shortest schedule interval is 1 hour.
Skills: a cloud session loads no repo plugin, only `.claude/skills/`. Install with
the package's `init --harness claude --no-plugin` (`npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v<version> init ...`) and commit `.claude/skills/` and `.mcp.json`.
Board: the GitHub proxy refuses GraphQL and every `orgs/*` and `users/*` route, so a `github` (Projects v2)
board is out of reach; `doctor` fails on it in a cloud session. Use one of:
- `github-issues`: reached through `repos/{owner}/{repo}/...`, with the session's own GitHub auth.
- `jira` or `linear`: both hosts are refused at the default network level; see "Jira and Linear" below.
A `github` board runs from GitHub Actions instead (`github-actions-claude.yml`); Actions is an option for any board.
Verify: a cloud session has no Docker daemon and stops a foreground command at 10 minutes (2 hours in the
background). The cycle runs `commands.fast_check`; `commands.verify` runs in CI as the `Required` check.
Draft and merge: on a private repo on GitHub Free a draft CR is a PR with the `draft` label, and `forge automerge`
merges directly once every `forge.required_checks` entry is green; no gate blocks that merge.
Secrets: none for the model. The repo needs the Claude GitHub App or `/web-setup`; the session's `GH_TOKEN` is a placeholder the proxy replaces.
Models: set the binding's `models` to Claude ids, for example Sonnet for `fast` and `balanced`, Opus for `deep`.
Proxy: Linear and Jira calls go out through the session's network proxy only when Node reads the proxy env:
add `NODE_USE_ENV_PROXY=1` to both environments (the cloud's Node 22 honours it and prints an `UNDICI-EHPA` experimental warning).
One identity (`forge.review_identity` empty, the default): one routine, one cloud environment. The routine acts as your
GitHub account, and the cycle runs review/review itself.
- environment: AGENTIC_SDLC_UNATTENDED=1, NODE_USE_ENV_PROXY=1, and a board token for Jira or Linear. No forge token: the proxy is the forge login.

1. Create the cloud environment for the repo with the env vars above and the setup script under "Environment setup script" below.
2. Cycle routine on it: paste the text of `cycle-prompt.md` below the `---` line as the prompt; pick the binding's `models.fast` model (Sonnet).
3. Trigger: a Schedule (custom cron, at least 1 hour apart). Limit: 100 scheduled runs per hour per account.

Two identities (`forge.review_identity` set): two routines, two cloud environments:
- cycle environment: the one above plus AGENTIC_REVIEW_FIRE_CMD. Never AGENTIC_REVIEW_TOKEN.
- review environment: the same plus AGENTIC_REVIEW_TOKEN and AGENTIC_SDLC_ROLE=review (the names your binding uses).

4. Review routine on the review environment: paste the text of `review-prompt.md` below the `---` line as the prompt, on an
   API trigger that the cycle fires when a CR needs a review (`AGENTIC_REVIEW_FIRE_CMD`, see `routine.md`).
5. Optional API trigger: `POST https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire`,
   `Authorization: Bearer <per-task token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, optional body `text`.
   Limit: 30 fires per hour per task.
6. A routine pushes only `claude/*` branches by default: set `vcs.change_pattern: claude/feature/<ticket>-<name>` and
   `vcs.factory_change_pattern: claude/sdlc/<name>` in the binding, or allow unrestricted branch pushes on the routine.

## Environment setup script
The committed `.mcp.json` starts the MCP server through `.agents/bin/agentic-sdlc`, which installs the pinned CLI on first use.
Save this as the environment's setup script, so that install is done before the session starts
(Settings > Environment > Setup script). It runs as root, from the directory that holds the repo checkouts, before the
session starts, and cannot read the environment's secrets, so it installs only; `.agents/runner-setup.sh` also runs
`doctor`, which needs the tokens, so do not use it here. Replace `<repo>` with the checkout's directory name.

```sh
if [ -d <repo> ]; then
  cd <repo>
  .agents/bin/agentic-sdlc validate || true   # installs the CLI pinned in .agents/cli.json
fi
```

The pin is `.agents/cli.json` (`init` writes it). The install fetches the package from github.com through npm, so
the environment's network must reach github.com and the npm registry.
Unproved: this has not been run in a cloud session. Still open: confirm that the MCP server connects in the session
after this script, and that the script's result is cached across sessions.

## Jira and Linear
Not yet proved in a cloud run. In the environment's network settings, add to the allowed domains:
- Linear: `api.linear.app` (the adapter posts to `https://api.linear.app/graphql` only).
- Jira Cloud: the host of the binding's `board.options.base_url`, `<site>.atlassian.net` (the adapter calls
  `<base_url>/rest/api/3/...` only, never `api.atlassian.com`).

Add the token as a network secret for that host (the proxy injects it into requests to the host; it is never sent to
GitHub). Match what the adapter sends:
- Linear: header `Authorization`, value the raw API key with no `Bearer` prefix (`lin_api_...`).
- Jira: header `Authorization`, value `Basic <base64(email:api-token)>`. A secret form that offers a username and
  password ("basic") takes the account email and the API token.

Both adapters refuse to run when their token env var is unset (`set <token_env> for the Linear board`; Jira also
needs `email_env`), and they send the header themselves. So set the env vars the binding names (`board.options.token_env`,
and `email_env` for Jira) in the environment to a placeholder value; whether the proxy then replaces the adapter's
header with the secret is unproved, so if it does not, put the real token in the env var as well. Also set
`NODE_USE_ENV_PROXY=1` (above), or Node ignores the proxy.
