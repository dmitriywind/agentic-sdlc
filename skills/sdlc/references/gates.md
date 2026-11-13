# Gates and the In review hand-offs

Read from [`sdlc`](../SKILL.md). The skills decide and act on tickets; the repo guarantees the
gates. Each gate is `agentic-sdlc gate <name>`, run by CI from the installed gate templates, never
by an agent. A guarantee the repo cannot keep is escalated to the Factory owner (Access), never
worked around.

## Gates and checks

| Gate or job | Posts | Outcome |
|---|---|---|
| CI job `Required` | check `Required` | On `pull_request`, with no secrets: `commands.install`, then `commands.verify` on the CR head. No agent posts it. |
| `proofs-on-base --cr <n>` | status `proofs-on-base` | Same no-secrets job: the CR's new or changed proof files run against the merge base's product code; success when each new proof fails there, or when a product CR changes only `paths.no_proof`. |
| `linkage` | check `ticket-linkage` | A product CR closes exactly one open ticket and names it in its source. |
| `approval --cr <n>` | status `human-approval` | Classifies the CR (`product-fast`, `product-full`, `tuning`, `guardrail`) and passes it only with the approvals the class needs; see Approval. |
| `branch-names` | check | A change line outside `vcs.change_pattern`, `vcs.factory_change_pattern`, `vcs.release_prefix` and the trunk cannot be pushed or merged. |
| `merged` | board move | A trunk push moves the one ticket its CR closes to Done, Shipped Not shipped when empty. No CR-pipeline gate writes the board. |
| `shipped <env>` | Shipped field | A green deploy to `<env>` writes On <env> (an In review ticket moves to Done first; `--version` records an artifact version); `--result rolled-back` steps back the tickets not in the revision now running; a failed deploy to the last environment returns the tickets to On <the environment before the last> and opens a held Signal; a Done ticket with no merged CR found is listed as unmatched in the output. |
| `signal-on-red` | a Signal | A red trunk or release-line run opens a Signal with a redacted evidence bundle. |
| `skill-regression` | check | A change under `paths.factory` keeps the skill pack valid: frontmatter, links, scorers. |
| dead-man job | a Signal | `agentic-sdlc ledger stale --max-hours <h>` fails when the newest heartbeat is older. |

The `review` status comes from `review-pr` as `forge.review_identity`. No merge until every
`forge.required_checks` entry is green (`ticket-linkage`, `Required`, `proofs-on-base`, `review`,
`human-approval`, `skill-regression`): that is the forge's branch protection, not a gate;
`agentic-sdlc doctor` reports it and warns when a required check is not pinned to its CI app.

## Approval

| Class | `human-approval` passes when |
|---|---|
| `product-fast` | Always; it merges on the agent review. When `forge.human_approval` is `always`, as `product-full`. |
| `product-full` | `forge.human_approval` is `never`, or an approving review on the head by a human: not in `owners.bots`, not `forge.review_identity`. |
| `tuning` | `tuning` is in `learning.auto_merge_classes`; otherwise as `guardrail`. |
| `guardrail` | An approving review on the head by `owners.factory`. |

The classes are defined in [`improve-factory`](../../improve-factory/SKILL.md) Rules.

## In review, hand-offs in order

| Step | Actor | Trigger | Proof | On failure, next actor |
|---|---|---|---|---|
| Draft CR opened | implement-spec | Fast check green | Draft CR closing the ticket; board shows In review | `ticket-linkage` red: implement-spec fixes the body |
| CI | CI | Every push | `Required` and `proofs-on-base` on the head | Read by review-pr as evidence |
| Review | review-pr; verify-ux for `computer-use` criteria | Draft CR at In review | Report comment with a row per criterion; a `<!-- verify-ux -->` comment per `computer-use` criterion set | Findings below |
| Findings | review-pr | An Important finding | Ticket at In progress with the findings | implement-spec fixes and pushes |
| Pass | review-pr | Every criterion proven, `Required` and `proofs-on-base` green on the head | `review` status and approval as the review identity; human approval requested when the class needs it; CR ready; auto-merge on | CR stays draft, review-pr reports |
| Human approval | A human owner | `human-approval` pending | Approving review on the head | None; the CR waits, visible in the heartbeat |
| Merge | Forge | All required checks green | Merge on the trunk; board Done, Not shipped | Behind the trunk: review-pr syncs the CR and reviews again |
| A required check red | review-pr | Ready CR, a required check red | CR back to draft, cause read | Cause in the diff or scope: review-pr fixes; else the ticket returns to In progress with the cause |
| A required check missing longer than `stall_minutes` | review-pr | Ready CR, check absent past the limit | Heartbeat `stalled` lists it | Same as red |
| A gate that never runs | escalate-to-human | No run at all for a gate | `needs-human` ask, reason Access | Factory owner restores the gate |
