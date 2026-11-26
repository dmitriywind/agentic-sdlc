# Claude cloud scheduled task (routine)

Profile: individual or individual-api (also works on Team and Enterprise seats of the Claude plan). Research preview; needs a claude.ai login (not an API key, Bedrock or Vertex).
Install at: claude.ai/code/routines, or `/schedule` in Claude Code. The task belongs to, and acts as, one claude.ai account.
Usage: scheduled runs draw the same subscription usage as interactive work, and are rejected at the subscription usage limit unless usage credits are on. The shortest schedule interval is 1 hour; pick a minute off the hour (for example `7 */2 * * *`), since on-the-hour starts can be late.
Silent stops: the task turns off after 72 h without a GitHub connection, and a run row that says "Succeeded" does not prove work was done. Neither writes a heartbeat, so install the dead-man workflow (`agentic-sdlc-dead-man.yml`, installed by `init`).
Skills: a cloud session loads no repo plugin, only `.claude/skills/`. Install with
the package's `init --harness claude --no-plugin` (`npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v<version> init ...`) and commit `.claude/skills/` and `.mcp.json`.
Board: the GitHub proxy refuses GraphQL and every `orgs/*` and `users/*` route; the `github-issues` board is reached
through `repos/{owner}/{repo}/...` only, with the session's own GitHub auth.
Verify: Docker is available in a cloud session. A foreground command waits 2 minutes by default, up to 10, then can continue in the
background for up to 30 more minutes; set `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` in the environment to raise both. The cycle
runs `commands.fast_check` (it may run containers); `commands.verify` still runs in CI as the `Required` check.
Toolchains: Node, Python, Java, Go, Rust, PostgreSQL and Redis are pre-installed; anything else (.NET for example) needs the setup script (`dotnet-install.sh`).
Draft and merge: on a private repo on GitHub Free a draft CR is a PR with the `draft` label, and `forge automerge`
merges directly once every `forge.required_checks` entry is green; no gate blocks that merge.
Secrets: none for the model. The repo needs the Claude GitHub App or `/web-setup`; the session's `GH_TOKEN` is a placeholder the proxy replaces.
Models: set the binding's `models` to Claude ids, for example Sonnet for `fast` and `balanced`, Opus for `deep`.
One identity (`forge.review_identity` empty, the default): one routine, one cloud environment. The routine acts as your
GitHub account, and the cycle runs review/review itself.
- environment: AGENTIC_SDLC_UNATTENDED=1. No forge or board token: the proxy is the GitHub login.

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
6. Claude pushes to `claude/` branches unless the prompt directs another branch. Nothing enforces it: the proxy does not limit which
   branch a push updates (it rejects tag pushes and branch deletions), and a rule the connected GitHub access can bypass does not block a run's push.

## Environment setup script
The committed `.mcp.json` starts the MCP server through `.agents/bin/agentic-sdlc`, which installs the pinned CLI on first use.
Save this as the environment's setup script, so that install is done before the session starts
(Settings > Environment > Setup script). It runs as root, from the directory that holds the repo checkouts, before the
session starts, and cannot read the environment's secrets, so it installs only; `.agents/runner-setup.sh` also runs
`doctor`, which needs the tokens, so a cloud setup script never runs it (every other runtime does). Replace `<repo>` with the checkout's directory name.

```sh
if [ -d <repo> ]; then
  cd <repo>
  .agents/bin/agentic-sdlc validate || true   # installs the CLI pinned in .agents/cli.json
fi
```

The setup script is cached only when it finishes in about 5 minutes; a longer one runs on every session.
The pin is `.agents/cli.json` (`init` writes it). The install fetches the package from github.com through npm, so
the environment's network must reach github.com and the npm registry.
Unproved: this has not been run in a cloud session. Still open: confirm that the MCP server connects in the session
after this script, and that the script's result is cached across sessions.
