# Ports: how a skill calls the board, forge and VCS

A skill never runs a vendor CLI for a board, forge or VCS step. It runs `agentic-sdlc <port> <verb>`;
the binding picks the adapter. Output is JSON; exit 0 ok, 1 refused or failed, 2 usage. Ids are
strings. If `board.mcp` names an MCP server, the same board actions may go through its tools; the
meaning of each verb is unchanged. Write bodies to a file and pass `--body-file`.

| Skill action | Verb |
|---|---|
| List the board once per cycle | `board list [--status <s>]… [--label <l>]` |
| Read one ticket | `board get <id>` |
| Create a ticket (always with a Status) | `board create --title <t> --body-file <f> --status <s> [--label <l>]… [--parent <id>] [--milestone <m>]` |
| Move a status (claim, hand-off, bounce) | `board move <id> <status> --only-from <s>` |
| Set or clear Size, Priority, Lane, Shipped, Release Version | `board set <id> <field> <value>` / `--clear` |
| Add or drop `bug`, `feature`, `needs-human`, `signal:<stream>` | `board label <id> add\|remove <label>` |
| Clear the assignee | `board assign <id> --none` |
| Ticket comment (spec, decision, ask) | `board comment <id> --body-file <f>` |
| Find a spec, heartbeat or evidence comment by a trusted author | `board comments <id> [--last <n>] [--marker <text>] --trusted` |
| Cancel or complete and close | `board close <id> --reason not_planned\|completed` |
| Link a sub-issue | `board child <parent> <child>` |
| Find duplicates | `board list --search <text>` |
| Find unboarded signals | `board list --label signal:<stream>` |
| Start a change line from the trunk | `vcs start <name>` (name per `vcs.change_pattern`) |
| Where am I, what changed, merge base | `vcs head`, `vcs changed [--since <rev>]`, `vcs base` |
| Publish the change line | `vcs push` |
| Cut a release line at a revision | `vcs cut <rev> <release>` |
| Open the draft CR | `forge open --source <b> --title <t> --body-file <f> --draft` |
| Read a CR (head, `closes`, checks, behind, `mergeSha`) | `forge view <n>` |
| Find the CR of a revision | `forge view --sha <sha>` |
| Last release tag | `vcs tags --prefix <vcs.tag_prefix>` (first row) |
| Read the diff | `forge diff <n>` |
| List open CRs | `forge list --state open` |
| Mark ready, or back to draft | `forge ready <n>`, `forge draft <n>` |
| Bring the CR up to the trunk | `forge sync <n>` |
| Merge when every required check is green | `forge automerge <n>` |
| CR comment (review report) | `forge comment <n> --body-file <f>` |
| Post the review status (review runtime only) | `forge status <sha> --context <c> --state success\|failure\|pending --description <d> [--url <u>]` |
| Approve as the review identity (review runtime only) | `forge approve <n>` |
| Read CR comments (review report, owner reply on a factory CR) by a trusted author | `forge comments <n> [--last <k>] [--marker <text>] --trusted` |
| Read the CR's reviews | `forge approvals <n>` |
| Read CI runs | `forge runs [--ref <r>] [--failed]` |
| Start a stage | `dispatch <skill> --ticket <id>` or `--cr <n>`, `[--run-model <m>]` |
| Runs, measures, learning due | `ledger runs`, `ledger summary` |
| Judge input and output | `ledger plan --run <id>`, `ledger record --run <id> --file <scores.json>` |
| Bench (improve-factory only) | `bench build\|run\|report\|compare` |

Gates (`agentic-sdlc gate <name>`) are run by CI, never by an agent.
