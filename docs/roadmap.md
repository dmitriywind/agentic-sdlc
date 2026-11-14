# Roadmap

What comes next for agentic-sdlc, in order. This repo does not run its own factory, so this file
is its backlog. A finished item leaves this file; the git log holds it.

## Now

Cloud runtime facts live in [contract section 10](../references/architecture.md) and
[claude-routine.md](../templates/runner/claude-routine.md).

| Item | Why | Done when |
|---|---|---|
| A board verb to set a milestone on an existing ticket | `backlog-grooming` sets milestones, but only `board create --milestone` can. | `board milestone <id> <name>` works on every adapter. |
| Two identities from the cloud | `organization` needs a review app; a cloud session acts as one account through the proxy. | A review routine posts `review` and approves as a second identity from a cloud session. |
| The MCP server in a cloud session | `.mcp.json` does not connect when the environment has no setup script: `node_modules` is not installed at session start. | The routine template's setup script installs it, and one cloud run lists the MCP tools. |
| Jira and Linear from the cloud | Both hosts are refused at the default network level. | The routine template adds the host to the environment's allowed domains and the token as a network secret; one cloud run lists the board. |
| Pilot on a real product repo | Review and merge are not proved on a real repo yet. | Three scheduled cloud runs in a row write a heartbeat with no `errors`, and one ticket goes from Ready to Done with no hand fix. |

## Next

| Item | Why |
|---|---|
| Owners as lists; optional operator, security and compliance owners | Teams have more than one owner per role. |
| `product.slo` and DORA measures | Error budget pauses feature work; P0 counted as change failure; rework rate. |
| Pin CI actions by SHA, on their current majors | Mutable `uses:` tags in the gate and runner templates; Dependabot can then keep the SHAs fresh. |
| MCP server on spec revision 2026-07-28 | The server negotiates up to 2025-11-25. The newer revision is reported to drop the initialize handshake and add a `resultType` on results: read the spec, then serve both shapes and add a conformance test. |
| Budgets per run | Only `cycle.time_budget_minutes` limits a cycle. A stage has no turn or token cap and `bench run` has no cost cap: add `executors.<stage>.max_turns`, a bench budget, and tokens per ticket in `ledger summary`. |
| Plugin agents for the tiers and the reviewer | A plugin `agents/` entry sets `tools`, `disallowedTools`, `maxTurns` and `model`, so "review-pr never runs CR code" becomes a tool list, not prose. Also a `bin/` shim (bare `agentic-sdlc`), `userConfig` for token env names, and plugin evals for skill triggering. |
| `init --upgrade` | `init` after a package upgrade keeps old workflows, hooks and runner prompts; `--force` also overwrites the binding and rulesets. Track installed template hashes like the skills lock, and never overwrite the binding. |
| Retry and bounded reads for the `gh` adapters | A GitHub secondary rate limit fails a cycle; `forge list --state merged` reads four calls per CR for every CR ever merged (`bench build`). Retry reads on 429 and rate-limit 403; add `--limit` and `--since`. |
| One strict flag parser for board, forge and vcs | `dispatch` and `init` refuse an unknown flag; `board list --bogus` still says "needs a value", and a missing `--body-file` path prints a bare ENOENT. |
| Guard `forge status` like `forge approve` in the hook | The MCP server hides both; the hook blocks only approve. |

## Later

| Item | Why |
|---|---|
| Scorers for shape quality and triage accuracy | `improve-factory` has no evidence for those two skills. |
| An `unscorable` scorer value | A judge with too little evidence has to guess a grade. |
| Agent provenance on commits and CRs | Trailers for agent, model and run id (Agent Trace is the emerging record), a gate that requires them, and a map of the gates to the SLSA Source track. |
| Plugin manifests for Codex and Cursor | Both now install plugins that bundle skills, hooks and MCP; today they get the pack through `init` only. |
| OpenTelemetry GenAI attributes and CDEvents on factory and deploy records | Standard telemetry for agent runs and deploys. |
| `signal-on-red` through a `forge run <id>` verb | Today it searches a window of 30 runs. |
