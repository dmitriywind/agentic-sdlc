# Roadmap

What comes next for agentic-sdlc, in order. This repo does not run its own factory, so this file
is its backlog. A finished item leaves this file; the git log holds it.

## Now

Each item needs a real run, not more code. Cloud runtime facts live in
[contract section 10](../references/architecture.md) and
[claude-routine.md](../templates/runner/claude-routine.md).

| Item | Why | Done when |
|---|---|---|
| Two identities from the cloud | `organization` needs a review app; a cloud session acts as one account through the proxy. | A review routine fired by the cycle publishes a `forge verdict` that posts `review` and approves as a second identity from a cloud session. |
| The launcher on a real runner | Every workflow job, the pre-push hook, the runner setup and the MCP entry run the CLI through `.agents/bin/agentic-sdlc`; no real runner has run it. | The launcher installs the pinned CLI in CI and in a cloud session, and a workflow job and the MCP entry run through it. |
| One cycle on the pilot with the seven-skill pack | The navigator, `forge queue`, `forge land` and the holds verbs have not driven a real board. | One cycle on the pilot routes by `forge queue`, lands a CR with `forge land` and writes a heartbeat with no `errors`. |
| Pilot on a real product repo | Review and merge are not proved on a real repo yet. | Three scheduled cloud runs in a row write a heartbeat with no `errors`, and one ticket goes from Ready to Done with no hand fix. |
| The release workflow on a sandbox repo | The cut step passes the release token to `git push` through `GIT_CONFIG_*`; the workflow shell has only been read. | One `forge cut` pushes a release line on a sandbox repo. |
| Real clients against the MCP server and the plugin | The server answers a scripted stdio session in a cloud session on both shapes; no real client has connected. The plugin agents, the `bin/` shim and the reviewer's Bash limit are built from the docs. | One session each on Claude Code, Codex and Cursor lists the tools and runs one cycle; `claude plugin eval` passes once. |
| Telemetry against real collectors | `ledger export` is checked against the OTLP and CDEvents specs only. | One export is accepted by an OTLP collector and one CDEvent by a sink. |

## Next

| Item | Why |
|---|---|
| An approval class for security paths | `owners.security` is asked by the `escalate` skill only. A `paths.security` list would let the `approval` gate require a security owner's approval. |
| A token split in run rows | A run row holds one `tokens` total, so the OTLP export cannot fill `gen_ai.usage.input_tokens` and `output_tokens`, and names no provider. |
| Status history on the board port | `ledger measures` reads lead time from `createdAt` and `statusChangedAt`: no adapter gives the time a ticket first reached In progress. |
| Hooks and agents in the Codex and Cursor plugins | Their manifests carry the skills and the MCP server only; the guard hook and the tier agents ship for Claude Code alone. |

## Later

| Item | Why |
|---|---|
| An Agent Trace record from the `provenance` gate | The gate reports agent and human commits as JSON; the Agent Trace spec could not be read when it was built. |
| Source provenance attestations | The SLSA Source track map in [forges.md](forges.md) lists this as the largest gap: the gates decide, but nothing signs what they decided. |
| A bench token budget | `learning.bench_budget` caps runs and minutes; bench results carry no token count. |
