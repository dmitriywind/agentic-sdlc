# Roadmap

What comes next for agentic-sdlc, in order. This repo does not run its own factory, so this file
is its backlog. A finished item leaves this file; the git log holds it.

## Now

Cloud runtime facts live in [contract section 10](../references/architecture.md) and
[claude-routine.md](../templates/runner/claude-routine.md).

| Item | Why | Done when |
|---|---|---|
| A board verb to set a milestone on an existing ticket | `backlog-grooming` sets milestones, but only `board create --milestone` can. | `board milestone <id> <name>` works on every adapter. |
| One identity proved in the cloud | One identity is the individual default; CI's `review` gate posts the status, since the cloud proxy cannot. | A cloud cycle reviews its own draft CR, posts `review` and the CR merges with no hand fix. |
| Two identities from the cloud | `organization` needs a review app; a cloud session acts as one account through the proxy. | A review routine posts `review` and approves as a second identity from a cloud session. |
| The MCP server in a cloud session | `.mcp.json` does not connect when the environment has no setup script: `node_modules` is not installed at session start. | The routine template's setup script installs it, and one cloud run lists the MCP tools. |
| Jira and Linear from the cloud | Both hosts are refused at the default network level. | The routine template adds the host to the environment's allowed domains and the token as a network secret; one cloud run lists the board. |
| Pilot on a real product repo | Review and merge are not proved on a real repo yet. | Three scheduled cloud runs in a row write a heartbeat with no `errors`, and one ticket goes from Ready to Done with no hand fix. |

## Next

| Item | Why |
|---|---|
| Owners as lists; optional operator, security and compliance owners | Teams have more than one owner per role. |
| `product.slo` and DORA measures | Error budget pauses feature work; P0 counted as change failure; rework rate. |
| Pin CI actions by SHA; fail when `AGENTIC_SDLC_VERSION` is unset | Mutable refs in gate templates. |

## Later

| Item | Why |
|---|---|
| Scorers for shape quality and triage accuracy | `improve-factory` has no evidence for those two skills. |
| Fold `verify-ux` into `review-pr` | Shorter skills, one home per rule. |
| OpenTelemetry GenAI attributes and CDEvents on factory and deploy records | Standard telemetry for agent runs and deploys. |
| `signal-on-red` through a `forge run <id>` verb | Today it searches a window of 30 runs. |
