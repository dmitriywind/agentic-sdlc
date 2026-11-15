# agentic-sdlc architecture (the software factory)

Status: normative. This file is the contract every part of the package is built against. A change
here changes the parts in the same CR.

## 1. What the package is

A **software factory** that a project installs to deliver value continuously: a skill pack, a
binding template, and a CLI of ports and gates. It is defined in code, versioned in the repo it
serves, open to several boards, forges and tech stacks, and measured on the project's own data.

Three layers, each with one home:

| Layer | Home | Holds |
|---|---|---|
| Process | `skills/` (the Claude Code plugin, or `.agents/skills/` on install) | Every process rule. Generic. No project value. |
| Binding | `.agents/binding.yml` in the project | Every project value: board, statuses, commands, paths, owners, model tiers, executors. |
| Ports | `src/` → the `agentic-sdlc` CLI and MCP server | Board, forge and VCS adapters, repo gates, dispatch, the run ledger and the bench. Mechanism only, no process rule. |

An agent harness (Claude Code, Codex, Cursor, any other) runs the loop by
loading the `sdlc` skill. The package ships **no supervisor and no agent runner**. The one
exception is `bench run`, which starts the binding's `agent_command` headless on a past task.

Constraint: delivery is **trunk-based on Git**. One trunk, short-lived change branches in, release
branches out. No long-lived develop branch. A P0 fix starts release at once; there is no hotfix line.
`board.labels` keys: `human`, `bug`, `feature`, and `release` (marks a release request the Product
owner opens at Backlog).

## 2. Repository layout

```
.claude-plugin/plugin.json   Claude Code plugin manifest: skills, hooks, the MCP server
.claude-plugin/marketplace.json  this repo as a one-plugin marketplace
.codex-plugin/plugin.json    Codex plugin manifest: skills and the MCP server (mcp.json)
.cursor-plugin/plugin.json   Cursor plugin manifest: skills and the MCP server (mcp.json)
agents/                      plugin subagents: sdlc-fast, sdlc-balanced, sdlc-deep, sdlc-reviewer
bin/agentic-sdlc             plugin shim: the CLI on the Bash PATH (the project's `.agents/bin/agentic-sdlc`, else its node_modules build, else dist/bin.js)
evals/                       plugin evals for skill triggering (`claude plugin eval`)
hooks/                       plugin hooks (hooks.json, guard.mjs) and the plugin's MCP launcher (mcp.mjs)
skills/                      the skill pack: seven skills, one per phase (section 5)
  sdlc/                      navigator: routing table and one cycle
    references/contract.md   words, roles, trust, waits and the rules every step follows
    references/statuses.md   statuses and Shipped
    references/board.md      board fields, lanes, sub-issues
  plan/      steps/triage.md steps/groom.md steps/shape.md   Signals, Ideas, Backlog to Ready
  build/                     Ready to In review: a draft CR
  review/    steps/review.md steps/verify.md                 In review to landed or sent back
  ship/                      the release line (release-line delivery only)
  learn/     steps/judge.md steps/improve.md                 the learning loop (learning.enabled)
  escalate/                  classify, ask, hold; run inside any step
scorers/                     the shipped scorer rubrics, copied to .agents/scorers/
templates/
  binding.yml                the binding template with every key documented
  gates/github/              GitHub Actions workflows and the trunk ruleset
  gates/hooks/               pre-push
  bin/                       the launcher init installs at .agents/bin/agentic-sdlc
  mcp/                       the MCP server entry per harness
  runner/                    scheduler templates and the cycle and review prompts
src/
  bin.ts  cli.ts             CLI entry and dispatch
  exec.ts                    the one process helper (injectable for tests)
  ports.ts                   port interfaces and shared types
  binding.ts                 load and validate the binding
  install.ts                 init / validate / doctor
  board/   github.ts jira.ts linear.ts local.ts index.ts
  forge/   github.ts index.ts
  vcs/     git.ts index.ts
  gates.ts                   repo gates shared by every CI template
  comments.ts                the comment-kind registry: kind to first-line marker (section 11.1)
  dispatch.ts                start a step on its executor
  ledger.ts                  read heartbeats and scores, aggregate runs, measures and learning
  bench.ts                   build and run bench cases
  mcp.ts                     the port verbs as MCP tools
  telemetry.ts               run and deploy records as OTLP traces and CDEvents (ledger export, the merged and shipped gates)
references/architecture.md   this contract
docs/                        guides and diagrams; never normative
features/                    the behaviour as executable Gherkin features (`<area>/*.feature`), their steps (`steps/`) and the runner (`support/`), on node:test; fake exec only (no network)
```

## 3. Ports

A skill never calls `gh`, `glab`, `az`, `jira` or `git` for a board, forge or VCS step. It calls
the CLI verb below; the binding picks the adapter. A board with an MCP server may be driven
through the MCP tools the binding's `board.mcp` names instead; the verbs and their meaning stay the
same.

Every verb prints JSON on stdout and exits 0 on success, 1 on a refused or failed action (message
on stderr), 2 on a usage error. Ids are strings everywhere (`"123"`, `"PROJ-45"`, `"LIN-9"`).
Adapters that call an HTTP API retry 429 and 5xx responses with backoff (3 tries, honouring
`Retry-After`). A POST retries only 429, since a 5xx may come after the write. The `gh` adapters
(board `github` and `github-issues`, forge `github`) retry the same way on what `gh` prints: a read
(`gh api` GET, `view`, `list`) retries HTTP 429, a 403 that names a rate limit and HTTP 5xx; a write
retries only 429 and rate limits. They wait the `Retry-After` hint `gh` prints, else 1s then 2s.
Every verb takes only the flags it lists: an unknown flag, a value flag with no value and a
`--body-file` that cannot be read are usage errors (exit 2); `--k=v` is the same as `--k v`.

### 3.1 Board (`agentic-sdlc board <verb>`)

| Verb | Effect | Output |
|---|---|---|
| `list [--status <s>]… [--label <l>] [--search <text>]` | Board items; `--search` matches title and body words | `Item[]` |
| `get <id>` | One item with fields and comments count | `Item` |
| `create --title <t> --body-file <f> --status <s> [--label <l>]… [--parent <id>] [--milestone <m>]` | New ticket on the board | `Item` |
| `move <id> <status> [--only-from <s>]` | Set Status. With `--only-from`, refuse (exit 1) unless the item is still there | `Item` |
| `set <id> <field> <value>` / `set <id> <field> --clear` | Set or clear a logical field | `Item` |
| `label <id> add\|remove <label>` | Add or remove a label | `Item` |
| `assign <id> <user\|--none>` | Set or clear the assignee | `Item` |
| `milestone <id> <name>` / `milestone <id> --clear` | Set or clear the milestone of an existing ticket, where `create --milestone` puts it (`github`: the issue's milestone; `github-issues`: the issue's milestone, which must exist; `jira`: `fixVersions`; `linear`: the `milestone:<name>` label; `local`: the item's `milestone`) | `Item` |
| `comment <id> --body-file <f> [--kind <kind> [--ref <value>]]` | Add a comment; `--kind` stamps the kind's marker as its first line, filled with `--ref` (section 11.1) | `{ id, url }` |
| `comments <id> [--last <n>] [--kind <kind>] [--marker <text>] [--author <a>]… [--trusted]` | Comments, newest first; kind, first-line and author filters (`--last` counts after them). `--trusted` is `--author` for every entry of `owners.bots`, `owners.product`, `owners.factory` and the optional `owners.operator`, `owners.security`, `owners.compliance` | `Comment[]` |
| `close <id> --reason completed\|not_planned` | Close (and move to Done or Cancelled) | `Item` |
| `child <parent> <child>` | Link a sub-issue | `Item` |
| `hold <id> --kind <trigger> --body-file <f>` | Adds `board.labels.human` and posts the ask with its `ask` marker for `<trigger>` (the `escalate` trigger, lower case) | `Item` |
| `holds` | The held tickets. A reply is a comment by any owner role, never `owners.bots`, after the last ask | `[{ id, kind, askedAt, replied: boolean, reply? }]` |
| `release <id>` | Removes `board.labels.human`; the ticket keeps its Status | `Item` |

`Item = { id, title, url, status, kind?, labels[], fields: Record<logicalField,string>, milestone?, parent?, children[], assignees[], createdAt, updatedAt, statusChangedAt? }`. `statusChangedAt` is when the ticket entered its status; `ledger measures` reads it for tickets at Done. `github-issues` sets it to the issue's `closed_at` for a closed issue at Done and leaves it unset otherwise; `github` (Projects) never sets it.
Logical fields: `size`, `priority`, `lane`, `shipped`, `release_version`. The binding maps each to
the tracker's field name (Jira custom field, Linear label group or custom field, GitHub Projects
field, local JSON key).

Adapters: `github` (Projects v2 via `gh`, for CI runtimes), `github-issues` (the repo's issues through
`gh api repos/{owner}/{repo}/…` REST only, so a Claude cloud session reaches it: Status and each logical
field are labels `<name>:<value>`, `status:` and the lower-cased field name, e.g. `status:Ready`, `size:S`;
an issue without a status label is off the board; `create` and every label write create missing labels;
`close` also closes the issue with its state reason; option `repo`), `jira` (Cloud REST v3, transitions for Status), `linear`
(GraphQL API, workflow states for Status), `local` (`.agents/board.json`, for tests and solo
projects). Credentials only from env vars the binding names; never from a file in the repo.

### 3.2 Forge (`agentic-sdlc forge <verb>`): the change request (CR) host, GitHub

| Verb | Effect | Output |
|---|---|---|
| `open --source <b> --title <t> --body-file <f> [--draft]` | Open a CR into the trunk | `CR` |
| `view <n>` / `view --sha <sha>` | One CR; by sha, the CR whose merge commit is `<sha>` | `CR` |
| `diff <n>` | Unified diff | text |
| `list [--state open\|merged\|all] [--limit <n>] [--since <iso date>] [--checks]` | CRs (default open), newest update first; merged ones carry `mergeSha`. `--limit` keeps the newest n; `--since` keeps CRs merged (state merged) or updated since the date. Without `--checks` each CR comes from the list payload with `checks: []`, `behind` false and no `pushedAt`: a caller that reads checks, `behind` or `pushedAt` passes `--checks`, which reads each CR as `view` does | `CR[]` |
| `ready <n>` / `draft <n>` | Leave or return to draft | `CR` |
| `sync <n>` | Bring the CR's source up to the trunk tip | `CR` |
| `automerge <n>` | Merge when every required check is green (low level; steps use `land`) | `CR` |
| `verdict <n> --pass\|--fail --body-file <f>` | Stamps the `verdict` marker for the CR head and the single `Verdict:` line, and posts the report. With `forge.review_identity` set it also posts the review status (`forge.review_check_name`) and, on pass, the approving review, with `options.review_token_env`; without one, CI's `review` gate turns the report into the status. A missing review token exits 1 naming an Access problem | `{ verdict, comment, status: 'posted'\|'ci' }` |
| `land <n> [--wait <minutes>]` | Waits, bounded (default `cycle.land_wait_minutes`, 5 when unset), until every `forge.required_checks` entry is green on the head, then arms auto-merge, or merges where the forge cannot arm it. A wait on a human approval is `blocked` with `needsHuman` (the approval class and the owner who must approve). Never merges a draft | `{ state: 'merged'\|'armed'\|'waiting'\|'blocked', blocking: [{ check, state }], needsHuman?: { class, who } }` |
| `queue` | Every open CR with the one next action the process must take (below) | `[{ n, ticket?, class, action: 'review'\|'rework'\|'land'\|'sync'\|'wait'\|'escalate', reason, reworks, since?, held, release?: true }]` |
| `comment <n> --body-file <f> [--kind <kind> [--ref <value>]]` | CR comment; `--kind` as in `board comment` | `{ id, url }` |
| `comments <n> [--last <k>] [--kind <kind>] [--marker <text>] [--author <a>]… [--trusted]` | CR comments (review report, owner reply on a factory CR), newest first, system notes dropped; same filters as `board comments` (`--last` counts after them) | `Comment[]` |
| `status <sha> --context <c> --state pending\|success\|failure --description <d> [--url <u>]` | Commit status / external check, posted with `options.review_token_env`; with one identity (`review_identity` empty), with the implementer's token. The verb refuses the contexts the gates own (`human-approval`, `ticket-linkage`, `proofs-on-base`, `agent-provenance`). The `proofs-on-base` and `linkage` gates post with `options.token_env` (the CI job's token); with two identities the CLI verb never does. | `{}` |
| `approve <n>` | Approving review as `review_identity`, with `options.review_token_env`. Refused with one identity: GitHub refuses an approval from the CR's author | `{}` |
| `approvals <n>` | The CR's reviews | `{ user, state, sha }[]` |
| `runs [--ref <r>] [--failed]` | CI runs (the newest 30) | `Run[]` |
| `run <id>` | One CI run by id; a run that does not exist fails (exit 1) | `Run` |
| `cut <revision> <version>` | Starts the release workflow `agentic-sdlc-release.yml`, which runs in Environment `agentic-release` (the Product owner approves it) and pushes the release line with the release bot's token. Returns the run this dispatch created: the newest run id above every id seen before it | `{ requested: true, run?, url? }` |

`queue` owns the CR decisions the skills only obey. `ticket` is the one id the CR closes (absent for a factory or dependency CR), `class` the approval gate's class, `held` whether its ticket carries `board.labels.human`, `release: true` on a held ticket whose CR is `land` with its `human-approval` status success under a class that needs a human (an approval on the forge alone answers a Sign-off ask; the navigator releases the hold), `since` when the row's state began, `reason` one line for the action. `reworks` counts the CR's trusted fail verdicts and trusted `note`s (a `note` names the cause of a red check or a request to a person's CR). A check named by `forge.review_check_name` or `human-approval` never counts as red, pending or missing here. The first match wins:

| Action | When |
|---|---|
| `escalate` | `reworks` has reached `cycle.max_rework` (3 when unset) and the CR needs another rework (the `rework` row below, without its `wait`), or a required check other than the review and human-approval statuses is pending or missing longer than `stall_minutes` after `pushedAt` (no `pushedAt`: the clock has not started) |
| `rework` | the head has a trusted fail verdict, or a required check is red (`wait` instead while the newest trusted `note` for the head names a Signal that is still open: the note's `--ref` is `<head sha> <Signal id>`; a `Signal <id>` in the text is read when the ref has none) |
| `review` | no trusted verdict for the head (a draft, or a ready CR whose head changed); review itself stops with no verdict while a check is pending |
| `sync` | a ready CR behind the trunk |
| `land` | a pass verdict on the head, the CR ready and open |
| `wait` | anything else |

The port also has `commits(n)`, used by gate `provenance` and not a CLI verb: every commit of the CR, oldest first, as `{ sha, message, author, committer, authorName, committerName, committerEmail, parents }` (logins empty when the forge links no account). It throws when the list may be cut off (GitHub lists at most 250 commits), so the gate fails closed.

The forge may implement `closing(id)`: the merged CRs whose body closes ticket `id` (GitHub searches the body). Gates use it to look up a ticket's merges without listing every merged CR. The search index can trail a merge, so a ticket the search finds no merge for is also looked up in `list({ state: 'merged' })`.
`CR = { n, url, title, source, target, headSha, baseSha, mergeSha?, draft, state: 'open'|'merged'|'closed', behind, closes: string[], checks: {name, state}[], body, author, pushedAt? }`.
`closes` is parsed from the body by the shared rule: exactly the lines `Closes <id>`. `author` is the forge login that opened the CR, in the form comment authors use. `pushedAt` is when the head reached the forge: the creation time of the first check suite on `headSha` (absent before CI starts). Stall clocks after a push (`stall_minutes`) count from it.

Adapter: `github` (`gh`), the one forge: on other forges a CR can change the pipeline file that runs its own gates. In a Claude cloud session every verb but `closing` calls REST under `repos/{owner}/{repo}/…` through `gh api`, because the session's GitHub proxy refuses GraphQL and every path outside the attached repos. `checks` come from the head's check runs and commit statuses. In a cloud session (`CLAUDE_CODE_REMOTE=true`) `ready`, `draft` and `automerge` use the proxy's routes `POST pulls/{n}/ccr/ready_for_review`, `POST pulls/{n}/ccr/convert_to_draft` and `PUT pulls/{n}/ccr/auto_merge`; elsewhere they use `gh pr ready`, `gh pr ready --undo` and `gh pr merge --auto --squash`. In a cloud session an unset `options.token_env` env var falls back to the proxy's token; `options.review_token_env` never falls back. `runs` and `cut` use `gh run` and `gh workflow` (REST). `closing` uses `search/issues`, which a cloud session refuses; gates run in CI, where it works. A repo that refuses draft pull requests (private on GitHub Free) gets a ready PR with the `draft` label: `CR.draft` is true while the label is on, `ready` removes it and `draft` adds it when the native route fails. When GitHub refuses to enable auto-merge (no ruleset or branch protection on the trunk), `automerge` merges the CR at its head (`PUT pulls/{n}/merge`, squash) only when it is not draft and every `forge.required_checks` entry is green there; otherwise it fails.

### 3.3 VCS (`agentic-sdlc vcs <verb>`): Git

| Verb | Effect |
|---|---|
| `start <name>` → `{ workdir, ref }` | refuses a name that fits neither `vcs.change_pattern` nor `vcs.factory_change_pattern`; fetch; reuse the change line `<name>` (its worktree, local branch or origin branch) when it exists, else a worktree and branch from the trunk tip |
| `head` → `{ ref, sha }` | `HEAD` |
| `changed [--since <rev>]` → `string[]` | `diff --name-only` against the merge base |
| `base` → `{ sha }` | merge base with the trunk |
| `push` → `{ ref, sha }` | push the current branch; refuses the trunk and a detached HEAD |
| `cut <rev> <release>` | push `<rev>` to `refs/heads/<release_prefix><release>` |
| `tag <name> <rev>` | annotated tag (gates only) |
| `tags [--prefix <p>]` → `{ name, sha }[]`, newest first | `tag --sort=-creatordate` |
| `drop <name>` | remove the worktree and delete its branch (bench only) |
| `checkout-tests <rev> <paths…>` | product code at `<rev>`, the given proof paths kept (the `proofs-on-base` gate) |
| (`snapshot(rev)`, API only) | detached worktree outside the root, for the bench |

The trunk, release prefix and name pattern come from the binding. "Branch" in skills means the
change line `start` opens.

### 3.4 Gates (`agentic-sdlc gate <name>`): run by CI, never by agents

| Gate | Guarantee |
|---|---|
| `branch-names` | A change line outside the binding's patterns, the dependency lines `dependabot/` and `renovate/`, and the trunk is refused. |
| `linkage` | Posts check `ticket-linkage`: a product CR closes exactly one open ticket and names it in its source. |
| `proofs-on-base --cr <n>` | In the no-secrets `pull_request` job: runs the CR's new or changed proof files against the merge base's product code; posts status `proofs-on-base`, success when each new proof fails on base, or when a product CR changes only `paths.no_proof`. |
| `approval --cr <n>` | Classifies the CR as `product-fast`, `product-full`, `tuning` or `guardrail` (§6.5) and posts status `human-approval`. Success for `product-fast`; for `tuning` when `tuning` is in `learning.auto_merge_classes`; for `product-full` (when `forge.human_approval` is `full-lane` or `always`) and for every product CR when `always`, only with an approving review on the head SHA by a human (an owner, member or collaborator of the repo, not in `owners.bots`, not `forge.review_identity`); for `guardrail` only with an approval by any `owners.factory` entry. Runs on CR events and on review submitted. Unknown paths, deletions or an unreadable head fail closed to `guardrail`. A CR that mixes product and factory paths is `guardrail`; a product CR that touches `paths.lane_areas` is `product-full`. |
| `review --cr <n>` | One identity only (`forge.review_identity` empty): posts status `review` on the head from the newest `verdict` comment for that head by a trusted author (`owners.bots` and every owner role): success on `Verdict: PASS`, failure on `REMEDIATION REQUIRED`, pending with no report. Posts with the CI job's token. With two identities it does nothing. |
| `merged --sha <sha>` | Run on a trunk push. The CR merged at `<sha>` moves its one ticket to Done (`--only-from` its current status) and sets Shipped Not shipped when empty. Done records a fact: a held ticket moves and keeps its label; a Cancelled ticket stays. A push with no CR changes nothing. No CR-pipeline gate writes the board; besides this gate only `shipped` moves a ticket (In review to Done, when a deploy reports first). |
| `shipped <env> --sha <sha> --result success\|failure\|rolled-back [--version <v>]` | Only Done or In review tickets whose CR merge is an ancestor of `<sha>` get `On <env>` (an In review one moves to Done first); `--version` gives the ones without a Release Version that version, and the last environment tags it. `rolled-back`: tickets On `<env>` or later whose merges are not in `<sha>` (the revision now running) step back one environment and keep their version. Unknown ancestry changes nothing. A failure in the last environment returns the tickets of the version in flight to the previous environment, clears the version and opens a held Signal. |
| `provenance --cr <n>` | Off unless `forge.provenance` is `warn` or `require`. Reads the CR's commits through the forge API (no CR code runs) and posts status `agent-provenance`. A commit whose author or committer is in `owners.bots` (forge names) needs well-formed `Agent-Run` and `Agent-Model` trailers (the last paragraph of the message, one value each); other commits are `human`; a merge commit whose committer is the forge's own web identity (GitHub: login `web-flow`; a committer email does not count, since the committer sets it, the branch update) is `merge`, and any other merge commit is checked like a commit of its author. Prints `{ commits: [{ sha, by, run?, model?, ok }], agentCommits, humanCommits, missing }`. `warn` always succeeds; `require` fails on a missing or malformed trailer and on commits it cannot read. A squash merge drops the trailers, so the status and report on the CR are the record; `merged` is untouched. Not in `forge.required_checks` by default: with `require`, add it there and to the trunk ruleset (`validate` warns otherwise). |
| `signal-on-red --run <id>` | Reads the run with `forge run <id>`; a red trunk or release-line run opens a Signal with a redacted evidence bundle. Other refs are ignored. A run that does not exist fails the gate. |
| `skill-regression` | A change under `paths.factory` keeps the skill pack valid: frontmatter, steps and their files, links, forbidden words (section 5), every CLI call a skill names (the verb exists, each `--flag` is one of its verb's, a `dispatch` names a step), scorers' `applies_to`. `test/skills-pack.test.ts` runs the same checks on `skills/`. |

Checks:

- **`Required`** is a CI job, not a gate and not an agent: on `pull_request`, with no secrets, it
  runs `commands.install` and `commands.verify` on the CR head. The `proofs-on-base` gate runs in
  its own job, also with no secrets: where it cannot post the status, its result is the check. The GitHub CR workflow also triggers on `merge_group`, for merge queues.
- **`review`** is posted by `forge verdict` as `forge.review_identity`. With one identity (section 10) the
  `review` gate posts it in CI from the newest trusted `verdict` comment on the head.
- **Required checks**: `ticket-linkage`, `Required`, `proofs-on-base`, `review`,
  `human-approval`, `skill-regression`; `agent-provenance` joins them only with `forge.provenance: require`. The trunk ruleset pins the four CI checks to their
  source app (`integration_id`); with two identities `review` and `human-approval` post with the review token, so pin them
  to the review app when it is an App. `doctor` warns when a required check is not pinned. No CODEOWNERS file:
  the `approval` gate enforces owner approval by class, so `tuning` can auto-merge.
- A dead-man job runs `ledger stale --max-hours <h>` on a schedule.

CI loads the binding from the **target** branch, never from the CR, and never runs CR code with
secrets. The trunk needs every required check green and, with two identities, the review identity's approving review.

## 4. The binding (`.agents/binding.yml`)

[`templates/binding.yml`](../templates/binding.yml) is the one reference: it lists every key with
its meaning and default, and `validate` checks the adapter options per adapter. It also requires `vcs.trunk`, `vcs.release_prefix` (ending in `/`) and `vcs.factory_change_pattern` to be non-empty and `vcs.tag_prefix` to be a string. Its top-level
groups are `version`, `profile`, `owners`, `board`, `forge`, `vcs`, `product`, `executors`, `mcps`,
`traces`, `models`, `agent_command`, `commands`, `paths`, the sizing and flow keys, `cycle`,
`heartbeat` and `learning`.

Keys this contract relies on by name:

- `owners.product`, `owners.factory` and each entry of `owners.bots`: one account name, or `{ board, forge }`
  when the board and the forge name the person differently. `owners.product` and `owners.factory` also take a
  list of such entries (any member counts as the owner; the first is the primary, the one a skill asks or
  assigns). `owners.operator`, `owners.security` and `owners.compliance` are optional roles of the same shape,
  default absent; `ownersFor` normalises every role to a list and `--trusted` includes them; their process
  meaning is in the `escalate` skill. An unknown key under `owners` is a warning; `forge.review_identity`
  must not be any owner. Board reads (ledger, dispatch, `board comments
  --trusted`, spec authors) use `board`; forge reads (the approval gate, `forge comments --trusted`) use `forge`.
- `heartbeat.ticket`: the id of the ticket that holds heartbeat comments; `validate` fails when it is empty.
  `init --board local` creates it (status Cancelled, so no route reads it) and sets it.
- `forge.provenance: off | warn | require` (default `off`): gate `provenance` (section 3.4). When it is
  not `off`, `dispatch` also prints `run` (the dispatch key when `cycle.dedupe_minutes` is above 0, else `<ticket>-<skill>-<start time>`) and
  puts it in the executor's task as the `Agent-Run` value; it is the run row's `id`.
- `forge.human_approval: full-lane | always | never` (default `full-lane`), `forge.review_identity`
  (empty: one identity), `forge.options.review_token_env` (set exactly when `review_identity` is, and
  never equal to `token_env`; `validate` fails otherwise), `forge.required_checks`.
- `telemetry: { otlp_endpoint_env, cdevents_sink_env, headers_env }` (all optional, default unset: nothing is
  sent): each key names an env var, never a URL or a token, and `validate` rejects a value that is not a
  variable name. Section 6.9 says what is exported and sent.
- `board.scope: { label, home, repos }` (unset: the board serves one repo): many repos on one board.
  Section 10 says what it does.
- `commands.install`, `commands.verify` (the `Required` job), `commands.proofs_on_base` (the
  `proofs-on-base` gate: a command with `{files}`, run once per new proof file), `commands.preview` (optional: deploys
  a CR head for `review/verify`), `commands.rollback`, `commands.evidence_check` (exits 0 when every
  `product.evidence` kind exists for `{sha}`; the release ready check runs it).
- `product.slo: { change_failure_rate_max: <0..1>, window_days: <n> }` (optional; unset: no error
  budget). `validate` rejects a rate outside 0 to 1 and a non-positive window.
- `product.delivery: release-line | continuous` (default `release-line`; continuous needs no
  `vcs.release_prefix` and has no In release), `product.evidence: [sbom | provenance | signature]`,
  `paths.no_proof` (globs a product CR may change with no proof file).
- `cycle.dedupe_minutes`: a second dispatch of the same skill and subject while the first marker is
  younger than it is a double fire and is skipped (unset or 0: no dispatch check at all; the template sets 10). A run has finished when its own done line `<!-- agentic-sdlc:done <key> -->` appears after the
  dispatch marker (posted by a bot, or by the `assign` executor's user); other runs' comments never count. `dispatch` hands that line to every executor in its task.
  An unfinished run blocks a second dispatch until `stall_minutes`, which must exceed the longest stage run.
- `executors.<stage>.max_turns`, `max_tokens`, `max_minutes` (optional positive integers, inherited from
  `executors.default`): per-run caps `dispatch` hands to the executor and prints as `limits`; the
  executor enforces them (section 7). A run that ends on one has outcome `capped`.
- `cycle.max_tokens_per_ticket` (optional): the tokens a ticket's runs may report in total; `ledger
  summary` marks a ticket over it `overBudget: true`, and the cycle dispatches it no further.
- `cycle.max_rework`: the most reworks (`reworks` of `forge queue`: fail verdicts and `note`s) a CR may take before
  `forge queue` says `escalate` instead of `rework` (positive integer; default 3 when unset; the template sets 3).
- `cycle.land_wait_minutes`: how long `forge land` waits for the required checks, and `ship` for a release run (whole
  minutes, 0 allowed; default 5 when unset; the template sets 5).
- `paths.factory`: a change only there is a **factory change**: no ticket, its own change pattern
  (`vcs.factory_change_pattern`), classified by the `approval` gate and checked by
  `skill-regression`.
- `learning.every_cycles`, `learning.min_evidence_runs`, `learning.bench_size`,
  `learning.bench_min_cases` (default 20), `learning.bench_trials` (default 3),
  `learning.bench_budget` (optional `{ max_runs, max_minutes }`: `bench run` refuses a plan of more runs
  than `max_runs` (cases x trials) unless `--allow-over-budget`, and starts no new case after
  `max_minutes`),
  `learning.auto_merge_classes` (template default `[]` until a bench baseline exists),
  `learning.judge_tier`, `learning.enabled` (default `false`: `learning.due` and `learning.judge` stay false).

## 5. Skills

Seven skills, one per phase: `sdlc` (the navigator), `plan`, `build`, `review`, `ship`, `learn` and
`escalate`. A **step** is the unit that runs, named `<skill>/<step>`; a one-step skill is named by
the skill (`build`, `ship`, `escalate`, `sdlc`). `dispatch`, the ledger's `skill` field, the bench,
a scorer's `applies_to`, the `executors` keys and the `Agent-Skill` trailer all name a run this way.

A stored run row that carries an earlier skill name is read as its step (`OLD_STEP_IDS` in `src/skills.ts`).

- **Frontmatter**: `name`, `description` (a trigger sentence), and `metadata.steps: { <step>: { tier
  } }` for a multi-step skill (each step in `steps/<step>.md`) or `metadata.tier` for a one-step
  skill (the step is the SKILL.md body). `tier` is `fast`, `balanced` or `deep`; `models` maps it to
  a model. `disable-model-invocation: true` marks skills only a person or the cycle starts (`ship`,
  `learn`); `user-invocable: false` marks a skill only the navigator or another step runs (`plan`, `build`,
  `review`, `escalate`). `sdlc` has neither flag. The `internal-skills-not-direct` and
  `release-not-model-invoked` evals check the two lists.
- **Body**: the SKILL.md of a multi-step skill is a table of its steps (what each runs on, its
  tier, what it ends with) and the rules common to them. A step points to
  `sdlc/references/contract.md`, lists numbered steps each ending on a checkable **Done when** (a
  status, a comment kind, a field or a CLI output a later run can verify), then Rules.
- **One home**: every process rule lives once in the skills; the words, roles, trust table and waits
  table live in the contract. This file defines mechanism only.
- **Forbidden content**: a skill names only `agentic-sdlc <group> <verb>` calls and binding keys.
  It never names a vendor, a harness, a runtime, a forge identity setup, a review token, a vendor
  CLI, an HTTP status, a hard-coded check name, a law or standard, or a marker string (a comment
  role is `--kind <kind>`). The `skills/` lint feature enforces the word list.
- **Names in installs**: under the plugin a skill is `agentic-sdlc:<name>`. A copied install
  (`.agents/skills`, `.claude/skills`) has no namespace, so `init` writes each skill as
  `sdlc-<name>` (directory and frontmatter `name`); `sdlc` stays `sdlc`. Skills refer to each other
  by name, never by path, so a copy keeps every link; links into `sdlc/references/` resolve in both.

## 6. The self-improvement loop

Visibility into every run, scored runs, a loop that proposes fixes to the factory itself, and
benchmarks built from the project's own past tasks to compare quality and time across models,
executors and factory versions. The loop is off unless `learning.enabled` is `true`; the bench
needs `agent_command`.

1. **Ledger.** Every run the cycle starts is one row in the heartbeat's `runs`: skill, skill
   version (content hash), ticket or CR, tier, model, executor, tokens, minutes, outcome and
   `trace` (a reference into `traces.uri` when the executor stored its transcript). `ledger
   summary` adds `learning: { due, judge, cyclesSince }` (`judge` and `due` are false unless
   `learning.enabled`), computed from heartbeats and run rows, so no skill keeps a counter. `ledger stale --max-hours <h>` exits 1 when the newest
   heartbeat is older. The heartbeat's `learning` object carries `lastProposal` and
   `benchBaseline`; only `learn/improve` changes them and, when `learning.enabled`, every heartbeat copies them forward
   (fields in section 11.2).
2. **Scorers.** A scorer is a file `.agents/scorers/<name>.md`: frontmatter `name`, `applies_to`
   (skills, or `*`) and `scale` (`pass-fail` or `0-4`), and a body that is the rubric question.
   The package ships `done-conditions` (the 0–4 `score`), `redundant-tests`, `scope-creep`,
   `spec-adherence`, `over-engineering`, `spec-quality` (`plan/shape`, 0–4) and `triage-accuracy`
   (`plan/triage`, judged from the ticket's later history). Any scorer value may be `unscorable`:
   the judge had too little evidence (a missing or unreadable ref) and gives a short `reason`. It is
   stored, `ledger summary` counts it per scorer (`unscorable: n`), and it is left out of medians,
   failure rates, failure clusters and the `learning.min_evidence_runs` count. The hard-fact cap
   applies to real grades only; a human grade may be `unscorable` too. While a hard fact caps the run, `unscorable` for `done-conditions` is refused by `ledger record` and ignored in a human grade.
3. **Judge.** `dispatch learn/judge --run-model <m>` picks `models[learning.judge_tier]`, or the next
   tier when that is the run's own model, and prints `{ skip: true }` when none is independent.
   `ledger plan --run <id>` prints the applicable scorers, the evidence refs (trace, CR, diff) and
   the hard-fact cap (failed, timed-out or capped outcome, red check, send-back, bounce, reopen, escape,
   bench oracle red). `learn/judge` grades each scorer with the model. `ledger record --run <id>
   --file <scores.json>` validates scorer names and scales, applies the cap and posts one
   `scores` comment on the heartbeat ticket; `ledger` reads these. A **human grade**, a
   comment `agentic-sdlc:grade <run-id> <scorer> <value>` by `owners.product` or
   `owners.factory`, wins over both.
4. **Improve.** When `learning.due`, `learn/improve` reads the ledger, clusters
   failures by scorer and by normalised error, takes the worst cluster (at least
   `learning.min_evidence_runs` runs over two tickets), and proposes **one** factory change in a
   draft factory CR, which `review/review` reviews (`dispatch --cr`).
5. **Classes and merge.** The `approval` gate classifies. `tuning` is only the `models` map, and a
   skill's `metadata.tier` when that skill has a bench suite; it merges on the agent review when
   `tuning` is in `learning.auto_merge_classes`. Everything else under `paths.factory`, including
   any change to skill text, is `guardrail` and waits for `owners.factory`. A CR that mixes product
   and factory paths is also `guardrail`.
6. **Prove.** The change runs on the bench against the current factory. `bench compare` needs at
   least `learning.bench_min_cases` shared cases and `learning.bench_trials` trials per case and
   compares the Wilson lower bound of the pass rate; fewer is `regressed`. The change must not
   lower it.
7. **Bench.** `bench build` turns merged tickets into cases: the ticket and spec, the merge base,
   and the CR's own new proofs as the hidden oracle. Cases belong to **suites**
   (`.agents/bench/suites/<suite>.json`): `bench build --suite <name> [--paths <glob>]…
   [--per-size <n>]` picks a stratified set by Size and touched area; `bench propose --suite
   <name>` nominates past tickets, which a factory CR adds. `bench run --suite <s> (--model <id> |
   --executor <e>) [--factory <rev>]` replays cases in fresh worktrees outside the root and
   records pass and minutes per case. `bench report --suite <s>` marks the Pareto front
   of pass rate against median minutes. Only `harness` and `command` executors run on the bench. Cases a spent `learning.bench_budget` left
   unrun are recorded `skipped: budget`, never as failures; `bench compare` and `bench report` treat
   such a result as incomplete (`regressed`, off the Pareto front), like too few cases. Bench results
   carry no token count, so the budget has no token cap.
8. **Measures.** `ledger summary` reports runs, median score, failure rate and minutes by skill,
   model, executor and scorer, and the failure clusters, and `tickets`: runs, tokens and minutes per ticket
   (top 20 by tokens, plus any over `cycle.max_tokens_per_ticket`, with `ticketTotals`). The heartbeat's optional `measures` (DORA,
   cycle time, first-pass rate) are off unless the runner prompt asks for them.
   `ledger measures [--days <n>]` (default 30) prints JSON computed from the board and the forge:
   `deployFrequency` (tickets at Done with Shipped on the last environment, last written in the
   window, per week), `leadTimeHours` (median from `createdAt` to entering Done, for tickets that
   reached Done in the window), `changeFailureRate` (P0 bugs and Signals opened in the window plus
   `signal:deploy` Signals, over changes shipped; a rollback opens no ticket, so it counts only
   through its Signal), `timeToRestoreHours` (median open to Done of those failures) and `reworkRate`
   (merged CRs closing a ticket that reached Done in the window, with a trusted `REMEDIATION REQUIRED`
   `verdict` report, over those CRs). Each carries its counts; a measure the data cannot give is
   `null` with a `why`. With `product.slo` set it adds `errorBudget: { max, windowDays, actual,
   exhausted }`, where `actual` is the change failure rate over `slo.window_days` and `exhausted` is `actual > max`,
   or true when the window has failures and no shipped change (`actual` is `null`, with a `why`); the cycle starts
   no new `feature` ticket while `exhausted` (skills/sdlc, Run one cycle step 1).
9. **Telemetry export** (opt-in; the mapping is `src/telemetry.ts`). `ledger export --format otlp|cdevents
   [--since <days|iso>] [--run <id>] [--out <file>] [--send]` prints, writes or sends the run rows.
   `otlp` is one OTLP/HTTP JSON document, one trace per heartbeat: an `invoke_workflow sdlc` span for the cycle and an
   `invoke_agent <skill>` span per run (OpenTelemetry GenAI conventions, stability `development`, schema
   `gen-ai-dev/1.42.0-dev`): `gen_ai.agent.name` is the skill, `gen_ai.agent.version` its content hash,
   `gen_ai.request.model` the row's model; a run that is not `done` gets status error and `error.type` = its
   outcome; ticket, CR, tier, executor, `ref`, tokens, minutes and scores are `agentic_sdlc.*` attributes, and each score is
   a `gen_ai.evaluation.result` event. A row holds one `tokens` total, so it is `agentic_sdlc.tokens`; no input/output
   split is invented, and `gen_ai.provider.name` is left out because no row knows the provider. Ids are hashes of
   the heartbeat comment id and the run id, so a re-export is the same document. `cdevents` prints CDEvents
   (spec 0.5.1) as JSON lines: `taskrun.finished` per run, `change.created` for the first `build` run per CR
   in the window and `change.reviewed` for each done `review/review` run. `--send` posts to the sinks the binding's
   `telemetry` names: OTLP to `<url>/v1/traces`, each CDEvent as a CloudEvents HTTP binary-mode request, both
   with the headers from `headers_env`, through `ctx.http`. The `merged` and `shipped` gates post their one
   event the same way, best effort: `change.merged` for a merged CR, `service.deployed` or `service.rolledback`
   with `environment.id` and `artifactId` `pkg:generic/<forge.options.repo>@<version or sha>`. A failed deploy has no CDEvents event, and
   with `forge.options.repo` unset the deploy has no service name, so no event is built. A failed send writes
   one line to stderr and never changes a gate's result.

## 7. Executors: who runs each step

The binding's `executors` says who runs each step, keyed `<skill>/<step>` (or the skill name for
every step of it); the default is the harness's own fresh-context worker.

```yaml
executors:
  default: { kind: harness }
  build: { kind: assign, user: coding-bot }
  review/review: { kind: webhook, url_env: REVIEW_BOT_URL, token_env: REVIEW_BOT_TOKEN }
  ship: { kind: command, run: "my-release-bot --ticket {ticket} --skill {skill}" }
  plan/triage: { kind: managed, api: claude, agent_env: TRIAGE_AGENT_ID, environment_env: TRIAGE_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY }
```

| Kind | Start | Result comes back by |
|---|---|---|
| `harness` | `dispatch` prints the task; the navigator runs it in a fresh context on the step's tier (Claude Code: `sdlc-<tier>` from `.claude/agents/`, else the plugin's `agentic-sdlc:sdlc-<tier>`; every `review/review` goes to `agentic-sdlc:sdlc-reviewer`). | The worker's own board and forge writes. |
| `command` | The CLI runs `run` with `{skill} {ticket} {cr} {workdir} {prompt_file} {mcps_file} {model} {max_turns} {max_tokens} {max_minutes}` filled in (`{skill}` is `<skill>/<step>`). | Exit code plus the bot's board and forge writes. |
| `webhook` | The CLI POSTs the task (`skill`, `ticket`, `cr`) as JSON to the URL. | The bot's board and forge writes; the next cycle reads them. |
| `managed` | The CLI starts a run on a managed-agent API, shaped by `api`: `claude` (Managed Agents `POST /v1/sessions`), `cursor` (Cloud Agents `POST /v1/agents`), `antigravity` (Gemini Interactions) or `generic` (`POST <endpoint>/sessions`). | Same. The run id goes in the ledger row. |
| `assign` | The CLI assigns the ticket (or CR) to the bot user and adds the step name as a comment. | Same. |

**Where `review/review` runs.** With `forge.review_identity` empty, it runs like any step. With it
set, a `dispatch review/review` outside the review runtime (`AGENTIC_SDLC_ROLE` not `review`) starts
nothing locally: it runs `AGENTIC_REVIEW_FIRE_CMD` once (or, with it unset, relies on the runner's job
dependency) and prints `{ kind: 'fire' }` (`via` is `review-runtime` or `job-dependency`); the cycle
writes no run row for it. An `executors` entry for `review/review` wins over this. Inside the review runtime the
same dispatch runs on its executor, and the review runtime's own `review` heartbeat holds the row.
The navigator never branches on this.

Every executor entry may also declare `mcps` (names from the binding's `mcps` map; the step gets
only these), `secrets` (env var names the step may receive; nothing else is passed), `sandbox`
(`cloud`, `container` or `local`) and `model` (`{ tier }` or `{ id }`). Secrets reach an executor
only when listed, and never through a board or CR comment. `review/verify` is the step that drives a
preview with test credentials: give it a browser in `mcps`, those credentials in `secrets` and a
`container` sandbox; it never holds the review token.

A step may cap a run: `max_turns`, `max_tokens` and `max_minutes`, positive integers inherited from
`executors.default`. `dispatch` hands them to the executor and prints them as `limits`; it enforces
none, because it detaches from the run.

| Kind | How the caps arrive | Who enforces |
|---|---|---|
| `harness` | `limits` in the printed task, and a sentence in the instruction. | The harness's turn limit, or the worker stopping at the cap. |
| `command` | `{max_turns}`, `{max_tokens}`, `{max_minutes}` in `run` (an unset cap fills as an empty quoted word), and `AGENTIC_SDLC_MAX_TURNS`, `AGENTIC_SDLC_MAX_TOKENS`, `AGENTIC_SDLC_MAX_MINUTES` in the child's environment (set only for a set cap). | The command's own flags, e.g. `claude -p --max-turns {max_turns}`. |
| `webhook` | `limits` in the JSON body. | The bot. |
| `managed` | A sentence in the task text; `limits` in the `generic` body. | The managed agent. |
| `assign` | A sentence in the dispatch comment. | The bot. |

A run that ends on a cap records outcome `capped`.

`agentic-sdlc dispatch <skill>[/<step>] [--ticket <id>] [--cr <n>] (at least one; none for
learn/improve) [--run <id>] [--run-model <m>] [--workdir <d>] [--unattended]` posts its `dispatch`
comment, starts the executor and prints `{ kind, ref, startedAt, key, done }`: `key` is the run's
done-line key (the `--ref` of its `done` comment) and `done` the stamped line; for `harness` it also
prints the instruction for the navigator (it names the done line, the key and, with provenance on, the run id) and starts nothing. The key is printed in every setup; the
`dispatch` comment and the checks below run only with `cycle.dedupe_minutes` above 0 (or for an
`assign` executor). The idempotency key is
`<ticket, cr or factory>-<skill>/<step>[-<run>][-<CR head sha>]`. A second dispatch with the same
key, while the `dispatch` comment is younger than `cycle.dedupe_minutes` or `stall_minutes`
(whichever is longer) and its run has not finished, prints `{ skipped: true }`. A run has finished
when its own `done` comment (`--kind done --ref <key>`) appears after the `dispatch` comment, posted
by a bot or by the `assign` executor's user; other runs' comments never count. So a double fire is
skipped for `dedupe_minutes`, and a run with no done line blocks a second dispatch until
`stall_minutes`: keep `stall_minutes` above the longest step run. With `dedupe_minutes` unset or 0
the check is off and no `dispatch` comment is posted. With `AGENTIC_SDLC_UNATTENDED=1`, `dispatch` refuses a step whose sandbox is
`local` or unset, except one that names `sandbox: local` when the runner sets `AGENTIC_SDLC_LOCAL=1`
(`templates/runner/local.md`). The ledger row records `executor` and `ref`, so the bench and
`learn/improve` compare executors as they compare models. `dispatch learn/judge` prints `{ skip:
true }` when no model independent of the run exists (section 6.3).

## 8. Any product type

Nothing in the skills assumes a web app or a code product. The binding states what "verify" and
"shipped" mean for this product:

```yaml
product:
  environments: [staging, production]   # ordered; the last is where users get value
  delivery: release-line                 # release-line | continuous
  evidence: [sbom, provenance, signature] # release evidence; commands.evidence_check proves it
  proofs: [test, eval, visual, data-check, computer-use, manual]
paths:
  no_proof: ["docs/**", "*.md"]          # a product CR changing only these needs no proof file
```

- `product.delivery: release-line` (the default) deploys the last environment from a release line the
  Product owner approves. `continuous` deploys every environment from the trunk: no release line, no
  `ship` step, and the deploy pipeline records the artifact version with `gate shipped --version`.
- Shipped options are derived: `Not shipped`, `On <env>` per environment, and `In release` before
  the last one (release-line only). The `shipped` gate takes any environment name. A product with no deploy uses its
  publish step as the last environment.
- A criterion names its proof kind. `commands.verify` runs every kind except `computer-use` and
  `manual`: scripted UI checks are `visual` or `test`. `computer-use` is agent-driven by
  `review/verify` on the `commands.preview` deployment of the CR head; `manual` escalates for a human
  check.
- The bench oracle is the merged change's own new proofs (tests, eval cases, data checks), not only
  unit tests.

## 9. Intake and data ownership

- **Intake.** Any tool that creates a board item at Signals with a `signal:<stream>` label is an
  intake: a chat bot, the tracker's own form, a CR comment command, a monitoring alert. The
  factory needs no intake of its own.
- **Data ownership.** The board, the repo and `traces.uri` hold every fact, score and trace. The
  binding names the inference endpoints (`models` may point at any provider or self-hosted model)
  and where each stage runs (`sandbox`). Nothing leaves the project's own systems except the telemetry the binding's `telemetry` keys name (off by default) and calls to
  the providers the binding names.

## 10. Runtimes and profiles: no dependency on one machine

Any scheduler that can start an agent with the repo and network access runs one cycle with the
prompt in `templates/runner/cycle-prompt.md`.

| Runtime | How it reaches the ports |
|---|---|
| Agent with a shell (Claude Code, Codex, Cursor, CI cron with a headless agent CLI) | `agentic-sdlc <group> <verb>`: the launcher `.agents/bin/agentic-sdlc`, on PATH in the plugin and the runner templates |
| Agent with MCP but no shell | `agentic-sdlc mcp` (stdio). The default tool list excludes `forge_approve` and `forge_status`; `mcp --allow approve,status` adds them, for the review runtime only. `initialize` answers the client's protocol version when the server supports it (2025-11-25 down to 2024-11-05), else the newest; a request whose `_meta` carries `io.modelcontextprotocol/protocolVersion` and `clientCapabilities` is served per revision 2026-07-28 with no handshake (`server/discover`, `tools/list`, `tools/call` only; results carry `resultType: "complete"`, `tools/list` and `server/discover` add `ttlMs` and `cacheScope`, a missing field is -32602, an unsupported version is -32022 with `data.supported`, `ping` is -32601); every tool carries a title and annotations (read-only, destructive, idempotent, open-world); `tools/call` checks arguments against the input schema and answers -32602 on a bad one; an object result also comes back as `structuredContent`. |
| Agent with only vendor MCP tools | the vendor tools that `board.mcp` maps to the board verbs; forge steps need a shell or the MCP server; gates still run in CI |

**The CLI pin.** The CLI ships from Git only (the npm name `agentic-sdlc` is another project) and is pinned
by a factory file, never by the product's `package.json`, so a product that is not a Node project needs nothing and an
upgrade is one factory change. `.agents/cli.json` is `{ "package": "github:dmitriywind/agentic-sdlc", "ref": "<ref>" }`;
`ref` is a 40-hex commit sha (immutable) or a version tag `v<version>` (a tag can move: `doctor` warns). `init` writes it
with the running package's `v<version>`, or `--ref <sha|vX.Y.Z>`. `init --upgrade` moves the ref to the running
package's, unless the file was edited to a sha that `init` did not write (the install lock tracks what it wrote);
`--force` or `--ref` moves it anyway. `.agents/bin/agentic-sdlc` is the one launcher (POSIX sh, installed executable):
it reads the pin and installs that ref once with
`npm i --prefix .agents/.cli/<ref> --ignore-scripts --allow-git=root --no-save --no-audit --no-fund "<package>#<ref>"`
(into a temporary folder, then renamed; npm's output goes to stderr), then execs
`node .agents/.cli/<ref>/node_modules/agentic-sdlc/dist/bin.js "$@"`. It refuses a ref or package that could read as
an option or leave the folder, and ends with one line when node or npm is missing or the ref cannot be fetched.
`init` adds `.agents/.cli/` to `.gitignore` once. Everything that runs the CLI goes through the launcher: every workflow
job, the pre-push hook, `runner-setup.sh` (which also puts `.agents/bin` on `PATH` in GitHub Actions) and the MCP entry
(`command: ".agents/bin/agentic-sdlc", args: ["mcp"]`). A job that holds a secret checks out the base ref only, so its
launcher and pin are the trunk's, never the CR's. `init` writes no dependency and no `.npmrc` into the product; when
`package.json` still pins `agentic-sdlc` as a devDependency it prints `npm rm agentic-sdlc`. `doctor` checks that
`.agents/cli.json` parses, that its ref is a sha or a version tag, and that the launcher exists and is executable.

**Local execution.** A scheduler on your own machine (`templates/runner/local.md`) runs the same cycle
prompt with no sandbox. An unattended `dispatch` refuses a `local` or unset sandbox, unless the stage
names `sandbox: local` and the runner sets `AGENTIC_SDLC_LOCAL=1`; an unset sandbox on a `harness` or `command` stage (after it inherits `executors.default.sandbox`) is always refused.

**Environment variables the mechanism reads.** `AGENTIC_SDLC_UNATTENDED=1` (dispatch refuses local
stages), `AGENTIC_SDLC_LOCAL=1` (local execution opt-in), `AGENTIC_SDLC_ROLE=review` (the plugin hook
allows `forge approve` and `forge status`, and its MCP launcher serves `forge_approve` and `forge_status`),
`AGENTIC_SDLC_ALLOW_STATUS=1` (the plugin hook allows `forge status` outside the review role; a one-identity runner that starts `mcp --allow status` sets it, nothing else needs it),
`CLAUDE_CODE_REMOTE=true` (a Claude cloud session: REST and `ccr` routes, the proxy token),
`AGENTIC_SDLC_PACKAGE` (the package root `init` copies from; tests set it). `dispatch` sets
`AGENTIC_SDLC_MAX_TURNS`, `AGENTIC_SDLC_MAX_TOKENS` and `AGENTIC_SDLC_MAX_MINUTES` in a `command` executor's child (section 7).

**Install and upgrade.** `init --upgrade` without `--harness` reuses the install's harness: `.claude/skills` means `claude --no-plugin`, tier agents `.claude/agents/sdlc-*.md` mean `claude`. A generated tier agent with no lock entry is regenerated when it names `npx --no agentic-sdlc`, and an `npx` agentic-sdlc entry in `.mcp.json` moves to the launcher (other servers untouched). `init` records the sha256 of every file it copies from the package (skills,
scorers, workflows, rulesets as patched, the pre-push hook, runner files, generated tier agents) in
`.agents/install.lock.json`; it reads the older `.agents/skills.lock.json` once. A re-run (`init --upgrade`
is the same run) updates a file still at its recorded hash, keeps an edited one and names the package file
with the new version, writes files new in the package, and reports as `stale` any recorded file the package no
longer ships, deleting none. A file with no lock entry, or a lock entry that does not match, counts as edited unless it equals the package's or its
hash is one a released version had (`templates/known-hashes.json`, appended by `npm run hashes` before each tag;
the delivery and verify workflows are compared with their binding values normalised, and `init` writes those values
from `vcs.trunk`, `vcs.release_prefix`, `product.delivery`, `commands.install` and `commands.verify`).
`--force` overwrites locally edited template files only. No flag rewrites `.agents/binding.yml` (to
regenerate it, delete it) or adds a second heartbeat ticket; `init` and `validate` print an `info:` line
listing the template's top- and second-level binding keys that the binding does not set.

Gates always run in the forge's CI, so trunk guarantees never depend on the runtime. A gate blocks a
merge only where the forge enforces it: `doctor` warns when the trunk has no enforced ruleset or branch
protection (an empty rule list, or the 403 a private repo on GitHub Free gets).

**Runners.** The GitHub templates read `runs-on` from two repo variables, as JSON: `AGENTIC_RUNS_ON` for the
jobs that run CR or agent code (`agentic-sdlc-verify.yml`, the runner's `cycle` job) and
`AGENTIC_RUNS_ON_TRUSTED` for the jobs that hold secrets (default: `AGENTIC_RUNS_ON`, then
`"ubuntu-latest"`). A self-hosted runner bills no minutes. `doctor` fails a self-hosted runner on a public
repo and warns when both variables name the same runner. Every job runs `bash`.

**Claude cloud session.** A cloud routine (`templates/runner/claude-routine.md`) is a full runtime on a
subscription. Its GitHub proxy refuses GraphQL and every `orgs/*` and `users/*` route; REST works under
`repos/{owner}/{repo}/...`. So it runs a `github-issues`, `jira` or `linear` board, never `github`
(Projects v2): `doctor` in a cloud session (`CLAUDE_CODE_REMOTE=true`) fails a `github` board, which runs
from GitHub Actions (`templates/runner/github-actions-claude.yml`) instead. Jira and Linear need their host in
the environment's allowed domains and the token as a network secret. A cloud session loads no repo plugin, so
it gets the skills from `.claude/skills` (`init --harness claude --no-plugin`). It has no Docker daemon and
stops a foreground command at 10 minutes: the cycle runs `commands.fast_check`, and `commands.verify` runs in
CI. The shortest schedule interval is 1 hour; runs draw subscription usage.

**Packaging per harness.** For Claude Code the package is a plugin (`.claude-plugin/`: skills,
hooks, the MCP server, `agents/` with a subagent per tier and `sdlc-reviewer`, `bin/` with the CLI on the Bash PATH, `evals/`), so skills are named `/agentic-sdlc:<skill>`. The plugin's tier agents are the default; `.claude/agents/sdlc-<tier>.md` from `init` carries the binding's models and is used when present (the names differ: `agentic-sdlc:sdlc-<tier>` against `sdlc-<tier>`). `sdlc-reviewer` has no Edit or Write tool, and the guard hook lets it run only `agentic-sdlc` commands in Bash, so `review/review` never runs CR code. Codex and Cursor each have a manifest (`.codex-plugin/`, `.cursor-plugin/`) for skills and MCP (`mcp.json`, `.agents/bin/agentic-sdlc mcp`); neither carries the hook or the agents. `init` always
copies the pack to `.agents/skills` (the gates and `validate` read it); `init --harness claude` generates one subagent per tier and adds an `@AGENTS.md` import to
`CLAUDE.md`. `--no-plugin` copies the skills to `.claude/skills` instead and writes `.mcp.json`, for a setup without the plugin, such as a cloud session. Codex and Cursor read `.agents/skills`, which `init` writes. Claude
headless runs pass `--permission-mode acceptEdits`, `--allowedTools` and `--max-turns`. The cycle
allows the CLI, the MCP server, `git add`, `git commit`, `git push` and the npm checks, and adds
`--disallowedTools` for `forge approve`. The review allows only the CLI and the MCP server.

`profile` in the binding picks one of three paths:

| | `individual` | `individual-api` | `organization` |
|---|---|---|---|
| Who pays | A subscription | A subscription, plus metered API keys | Metered API keys |
| Scheduler | The subscription's own (a Claude cloud routine, a Codex or Cursor scheduled task) or CI cron with a subscription-authenticated CLI | Any `individual` scheduler, plus a managed-agent deployment | A managed-agent platform, CI with an API key, or the org's job runner |
| Executors | `harness`; `command` for a CLI logged in with the subscription | All kinds: `managed`, `webhook`, `assign` too | All kinds; stages run on `managed` agents |
| Forge identities | One (default): yours | One (default), or two | Two: required |
| Traces | None, or local files | Local files, or `traces.uri` | `traces.uri` on the org's storage |
| Bench | Small suites inside the plan's usage limits | As the API budget allows | Full suites across models and executors |

`init --profile <p>` writes these defaults. `validate` fails an `organization` binding with no
`forge.review_identity`, and warns when an `individual` binding names an executor kind that needs
an API key, or an `organization` binding has no `managed` executor. The runner setup fails under
`individual` and `individual-api` when `ANTHROPIC_API_KEY` is set, since it outranks the subscription
token: `individual-api` names a managed executor's key otherwise (`executors.<skill>.token_env`).

**One identity or two.** `forge.review_identity` decides it.

- **One identity** (`review_identity` empty; the `individual` and `individual-api` default). The
  factory acts as one account, yours: on a Claude cloud routine, the proxy's GitHub login. There is
  one scheduled job, the cycle. It dispatches `review/review` like any other step, as a harness subagent
  with a fresh context that runs no CR code. `forge verdict` posts the report and no status: a Claude cloud
  session's proxy refuses commit-status writes (HTTP 403). The report comment starts the CR workflow
  (`issue_comment`), whose `review` gate posts the `review` status from the newest report on the head
  by a trusted author (`owners.bots` and every owner role) with the CI job's token.
  `forge land` then waits for that status and arms the merge. `forge verdict` gives no approving review, since
  GitHub refuses one from the CR's author, and `forge approve` refuses. `init` writes a trunk ruleset
  that needs no approving review and pins every required check to GitHub Actions. The
  `approval` gate posts `human-approval` with the CI job's token; a CR that needs a human waits until a
  collaborator approves its head, or the owner merges it as admin (the ruleset's admin bypass). The
  trade-off: the review is a separate context, not a separate account, so the trunk ruleset cannot
  prove that an agent did not post its own `review` status.
- **Two identities** (`review_identity` and `review_token_env` set; required for `organization`).
  Every scheduler runs two jobs: the cycle (`templates/runner/cycle-prompt.md`), which never holds the
  review token, and the review (`templates/runner/review-prompt.md`), which runs after the cycle
  finishes (a job dependency, or the cycle's fire command when a CR needs a review; never its own clock),
  holds `forge.options.review_token_env` and runs only `review/review`, for product and factory CRs. The
  implementer's `token_env` has no commit-status write (a fine-grained token with Commit statuses: no
  access; `doctor` warns on a classic token with scope `repo` or `repo:status`), and every required
  check is pinned to the app that posts it. So an implementer can never post the `review` status or
  the approving review for its own CR, and a CR's code never sees the review token.

In both, `forge status` refuses the contexts the gates own (`human-approval`, `ticket-linkage`,
`proofs-on-base`, `agent-provenance`), and `review/review` **never runs CR code**: it reads the required checks
from CI and runs no install or test command. The MCP server's default tool list has no `forge_status`,
so a one-identity cycle that has no shell starts it with `mcp --allow status`. Unattended jobs set
`AGENTIC_SDLC_UNATTENDED=1`.

**Who may post a verdict.** `forge verdict` has no hook rule: the setup decides. With no review identity any
runtime may call it, since the report is the only thing it posts and CI's `review` gate turns it into the status.
With `forge.review_identity` set it posts the review status and, on pass, the approving review with the token that
`forge.options.review_token_env` names; only the review runtime holds that token, so anywhere else the verb exits 1
with `Access:` and posts nothing. The `sdlc-reviewer` agent cannot write a file, so it calls the MCP tool
`forge_verdict` (the report as `body`) instead of the Bash verb with `--body-file`.

**One repo or many.** A binding belongs to one repo; each repo has its own install, cycle, heartbeat
ticket and pinned version.

- **One repo** (`board.scope` unset): the board serves one repo: a `github-issues` board, a Jira
  project or Linear team of its own, a `local` board.
- **Many repos, one board**: a GitHub Project needs no scope, since `board.options.repo` keeps one
  repo's issues. Any other shared board (one Jira project, one Linear team, one hub repo's
  `github-issues`) sets `board.scope` in each repo's binding. `board list` then returns only tickets
  with `board.scope.label` (`repo:<name>`), and `board create` adds that label. Exactly one repo sets
  `home: true` and lists every label in `repos`: it also lists the tickets with no `repo:` label, and
  `plan/triage` gives each one the label of the repo whose code it is about. Grooming, shaping and
  delivery stay inside each repo's scope.

## 11. Mechanism reference for the skills

What the skills rely on but never describe. Section 3 is the verb reference; this section holds the
rest.

### 11.1 Comment kinds

`board comment` and `forge comment` take `--kind <kind> [--ref <value>]` and stamp the kind's
marker as the first line; `comments --kind <kind>` filters by it. The exact first-line format of
each kind is defined once, in `src/comments.ts`; no skill spells one. The `spec` marker is the
binding's `spec_marker`.

| Kind | Written by | Where | `--ref` |
|---|---|---|---|
| `spec` | `plan/shape` (a later pass posts a new one; the newest trusted is the spec) | ticket | none |
| `verdict` | `forge verdict` only (`review/review`) | CR | the head (stamped by the verb) |
| `note` | `build` (the cause of a red check, a request to a person's CR author); the navigator (asking a person to update a CR behind the trunk) | CR | the head sha; with a Signal, `<head sha> <Signal id>` |
| `verify` | `review/verify` | CR | the head sha |
| `manual-check` | `review/review` | ticket | the head sha |
| `ask` | `board hold` (from `escalate`); `escalate` for a CR with no ticket (on the CR and on `heartbeat.ticket`); the navigator for a step with no ticket past `cycle.failure_limit` | ticket, CR, heartbeat ticket | the trigger, via `board hold --kind` |
| `heartbeat` | the navigator (`kind: cycle`), the review runtime (`kind: review`), `learn/improve` (`kind: learn`) | heartbeat ticket | none |
| `scores` | `ledger record` (`learn/judge`) | heartbeat ticket | none (the run id is in the JSON body) |
| `release-proposal` | `ship` | release request | the revision |
| `release-cut` | `ship` | release request | the version |
| `dispatch` | `dispatch` | the subject's ticket, else heartbeat ticket | the key |
| `done` | every run, last | the run's ticket; heartbeat ticket for a CR with no ticket | the key `dispatch` gave |

`comment --kind` refuses the kinds only one verb writes: `verdict` (`forge verdict`), `dispatch` (`dispatch`) and `scores` (`ledger record`).

An owner's grade is a comment `agentic-sdlc:grade <run-id> <scorer> <value>` (section 6.3).

### 11.2 Heartbeat

One `heartbeat` comment on `heartbeat.ticket` per cycle; it is also the run ledger. The body is the
marker line (stamped by `--kind heartbeat`), then the JSON object, bare or in a `json` code fence. `ledger runs` and `ledger summary` read only
heartbeats by `owners.bots`; `ledger summary` also prints `learning: { due, judge, cyclesSince }`,
so no skill keeps a counter. Scores are not written here: `ledger` joins `scores` comments and
grades to the run rows, and a human grade wins.

```json
{
  "kind": "cycle",
  "at": "ISO-8601 UTC time the cycle ended",
  "factory": "vcs head sha of the trunk the skills were read from",
  "runs": [{ "id": "", "skill": "build", "skillHash": "", "ticket": "", "cr": "", "tier": "", "model": "", "executor": "harness", "ref": "", "tokens": 0, "minutes": 0, "outcome": "done", "error": "", "trace": "" }],
  "errors": [{ "step": "", "id": "", "msg": "" }]
}
```

`at`, `factory`, `runs` and `errors` are required. Optional: `kind` (`cycle` by default, `review`,
`learn`; only `cycle` counts cycles), `did` (one line per result), `learning` (`lastProposal`,
`benchBaseline`; copied forward only when `learning.enabled`, changed only by `learn/improve`),
`measures` (off unless the runner prompt asks) and `budget` (`exhausted`, only when `ledger
measures` reported `errorBudget.exhausted` this cycle). A field the runner could not read is left
out and named in `errors`.

| Run key | Value |
|---|---|
| `id` | The `run` `dispatch` printed (with `forge.provenance` on; the `Agent-Run` trailer), else `<at>-<skill>-<ticket>`, or the executor's unique `ref`. |
| `skill`, `skillHash` | `<skill>/<step>`, and the `hash` string `ledger hash <skill dir>` printed at the run's start. |
| `ticket`, `cr` | The subject; empty when none. |
| `tier`, `model` | The step's tier and the model the binding mapped it to; for another executor what it reported, or empty. |
| `executor`, `ref` | The executor kind and the `ref` `dispatch` printed. |
| `tokens`, `minutes` | What the run reported, never guessed. `ledger summary` adds them per ticket. |
| `outcome` | `done`, `sent_back`, `failed`, `escalated`, `timeout` or `capped`; anything but `done` is a failure, and `capped` caps the score like `failed`. |
| `trace` | The run id that fills `traces.uri`, when the executor stored a transcript. |
| `error` | The first line of the cause, as the run or the gate stated it; the ledger clusters on it. |

`lastProposal`: when, its CR, the class the gate gave it, the targeted cluster, its evidence run
ids, and `open`, `merged`, `rejected` or `closed`. `benchBaseline`: the results file, factory
revision, model, executor, case count, pass rate and minutes of the trunk's last bench.

### 11.3 Checks and approval

- No merge until every `forge.required_checks` entry is green on the head; the forge's branch
  protection enforces it, `doctor` reports it, and `forge land` waits for it. The `review` status
  comes from `forge verdict` (with a review identity) or CI's `review` gate (without one).
- `forge.planned_checks` are wanted checks not yet supplied; `review/review` names each absent one.
- The `approval` gate's classes, which `forge land` reports as `needsHuman.class`:

| Class | Covers | `human-approval` passes when |
|---|---|---|
| `product-fast` | a Fast-lane product CR | always; with `forge.human_approval: always`, as `product-full` |
| `product-full` | a Full-lane product CR, or one touching `paths.lane_areas` | `forge.human_approval` is `never`, or a human (not `owners.bots`, not `forge.review_identity`) approved the head |
| `tuning` | only the `models` map, and a skill's tiers when it has a bench suite | `tuning` is in `learning.auto_merge_classes`; else as `guardrail` |
| `guardrail` | everything else under `paths.factory`, a mixed CR, anything unclassifiable | an `owners.factory` entry approved the head |
