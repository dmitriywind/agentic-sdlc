# Any other runtime

Use this when your agent is not Claude, Codex or Cursor, or when you wire a bot by hand.
The factory needs three things from a runtime: the repo, network access, and one of the three tool routes below.
Contract: [`references/architecture.md`](../../references/architecture.md) section 10.

## What you get
| Route | The agent has | How it reaches the ports |
|---|---|---|
| Shell | A shell and Node | `.agents/bin/agentic-sdlc <group> <verb>` |
| MCP only | MCP, no shell | `agentic-sdlc mcp` exposes every port verb as an MCP tool |
| Vendor MCP tools only | A chat bot with a GitHub, Jira or Linear connector | The vendor tools that `board.mcp` maps to the port verbs |

Gates always run in the forge's CI, so trunk guarantees never depend on the runtime.

## Install
```bash
npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v0.1.1 init --harness generic --profile individual --board github --forge github --vcs git
```
It writes the CLI pin `.agents/cli.json`, the launcher `.agents/bin/agentic-sdlc` (everything runs through it; it installs the pinned CLI on first use), `.agents/binding.yml`, the skills in `.agents/skills/` (each named `sdlc-<skill>`; `sdlc` stays `sdlc`), the gate templates and an `AGENTS.md` pointer.
Point your tool at `.agents/skills/sdlc/SKILL.md` if it does not scan that path. The init log lists the files; the `--harness` flag decides.
Check the setup:
```bash
# upgrade later: run the new package's `init --upgrade`
.agents/bin/agentic-sdlc doctor
```

## Run one cycle by hand
Give the agent the prompt in [`templates/runner/cycle-prompt.md`](../../templates/runner/cycle-prompt.md):
"Load the sdlc skill and run one cycle." Every verb prints JSON; exit 0 is success, 1 a refused action, 2 a usage error.

## Route 1: shell
Run the agent headless from any scheduler (cron, CI, a job runner). Set the env var names the binding lists
(`AGENTIC_BOARD_TOKEN`, `AGENTIC_FORGE_TOKEN`). With one identity there is no review token and no second run. With two identities, do not give the cycle runtime `AGENTIC_REVIEW_TOKEN`:
schedule a second run right after it with [`templates/runner/review-prompt.md`](../../templates/runner/review-prompt.md)
(installed at `.agents/review-prompt.md`) and give the review token to that run only.
Set `AGENTIC_SDLC_UNATTENDED=1` in both.
[`templates/runner/setup.sh`](../../templates/runner/setup.sh) prepares a fresh runner.

## Route 2: MCP only
Stdio, inside the agent's session. Register the server in the tool's MCP config:
```json
{ "mcpServers": { "agentic-sdlc": { "command": ".agents/bin/agentic-sdlc", "args": ["mcp"] } } }
```
The server is stdio only; a bot that cannot spawn a process uses route 3.
- The server holds the board and forge tokens of the process that started it. Run it as the implementer identity, never with the review token.
- By default it leaves out `forge_approve` and `forge_status`. Only a server for the review runtime starts with `mcp --allow approve,status`; a one-identity cycle with no shell starts with `mcp --allow status`. Under the Claude Code plugin's hook, that runner also sets `AGENTIC_SDLC_ALLOW_STATUS=1`; the hook otherwise blocks `forge_status` outside the review role.

## Route 3: vendor MCP tools only
Map the vendor's tools to the board verbs in the binding:
```yaml
board:
  adapter: jira
  mcp:
    server: my-board-connector
    tools: { list: <tool>, get: <tool>, update: <tool> }
```
The verbs and their meaning stay the same. Forge verbs (`forge open`, `status`, `approve`) have no vendor-tool route in the template, so keep
those on a shell or the MCP server. Gates still run in CI. Keep this route for intake and triage bots, not for the full cycle.

## Limits and unknowns
- A runtime with neither shell nor MCP cannot run the cycle; it can still be an intake (create a Signals item).
