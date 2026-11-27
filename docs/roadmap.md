# Roadmap

This repo's backlog, in order. A finished item leaves this file; the git log and the release tags
are the history.

## Now

| Item | Done when |
|---|---|
| The first real pilot cycle | On a real product repository, scheduled cloud routines run the cycle: three runs in a row write a heartbeat with no `errors`, and one ticket goes from Signal to Done with no hand fix. |
| Proof on real GitHub | Each is seen once on a real repo: a push removes the approval label and the gate then waits; the routine's Issue event trigger starts a cycle on a new Signal; every board and forge verb the cycle calls works over REST behind the cloud proxy. |
| One account passes the human gate | With one GitHub account as owner and as `owners.bots` (a cloud routine acts as the owner), the approval gate ignores the owner's label (`src/gates.ts` `approval`), so a Full-lane or factory change cannot be approved. A way for that one person to approve the head they saw, with the agent still unable to. |
| The phone board page | A Claude artifact page over the GitHub connector: live columns by `status:` label, a drag is a label change, a comment box, a new Signal button. |
| A guard for manual status moves | A workflow that reverses a status label change no rule allows, and says why in a comment. |

## Next

| Item | Why |
|---|---|
| Ledger-driven learning | Learn from heartbeat `errors`, rework counts and escalation clusters the ledger already holds, instead of a bench of 60 replays (20 cases, 3 trials) per side. |
| Sub-issue counts in `board list` | `list` leaves `children` empty; only `get` reads sub-issues, so `next` calls `get` per initiative. |
| MCP tools for `status`, `board bootstrap` and `forge whoami` | A session with MCP and no shell cannot install, repair or answer what waits. |
| The delivery workflow reads `product.environments` | It calls `gate shipped` with the fixed names `first-env` and `last-env`, which the gate refuses unless the binding names its environments so. |

## Candidates to cut

| Item | Why it may go |
|---|---|
| `init --profile organization` | Two identities need a second account and a second routine; the one flow has one person. |
| `board.scope` | Many repos on one board; the one flow has one repo. |
| The legacy `.agents/skills.lock.json` migration | `init` reads it once and removes it; it only serves installs made before `install.lock.json`. |
| Bench reporting by executor | `bench run --executor` and per-executor results; the one runtime is Claude Code. |
