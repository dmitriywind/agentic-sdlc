# agentic-sdlc architecture (v2: the software factory)

Status: normative. This file is the contract every part of the package is built against. A change
here changes the parts in the same CR. It supersedes the 2026-11-09 audit record in `docs/audits/`.

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

An agent harness (Claude Code, Codex, Cursor, Antigravity, Grok, any other) runs the loop by
loading the `sdlc` skill. The package ships **no supervisor and no agent runner**. The one
exception is `bench run`, which starts the binding's `agent_command` headless on a past task.

Constraint: delivery is **trunk-based on Git**. One trunk, short-lived change branches in, release
branches out. No long-lived develop branch. No hotfix path.

## 2. Repository layout

```
.claude-plugin/plugin.json   Claude Code plugin manifest: skills, hooks, the MCP server
.claude-plugin/marketplace.json  this repo as a one-plugin marketplace
hooks/                       plugin hooks (hooks.json, guard.mjs) and the plugin's MCP launcher (mcp.mjs)
skills/                      the portable skill pack (Agent Skills format: <name>/SKILL.md)
  sdlc/                      navigator: contract, routing, cycle, the hold, branches
    SKILL.md
    references/statuses.md   statuses and Shipped
    references/board.md      board fields, lanes, sub-issues
    references/gates.md      gates, required checks, approval, In review hand-offs
    references/heartbeat.md  heartbeat v6 incl. the run ledger
    references/ports.md      how a skill calls the board, forge and VCS
  triage-signal/  backlog-grooming/  shape/  implement-spec/  review-pr/  release/
  escalate-to-human/
  verify-ux/                 drive a preview of the CR head for `computer-use` criteria
  judge-run/                 grade one finished run with the planned scorers
  improve-factory/           the self-improvement loop: one factory change with bench proof
scorers/                     the shipped scorer rubrics, copied to .agents/scorers/
templates/
  binding.yml                the binding template with every key documented
  gates/github/              GitHub Actions workflows and the trunk ruleset
  gates/gitlab/              .gitlab-ci.yml include
  gates/azure/               azure-pipelines.yml
  gates/bitbucket/           bitbucket-pipelines.yml
  gates/hooks/               pre-push
  mcp/                       the MCP server entry per harness
  runner/                    scheduler templates and the cycle and review prompts
src/
  bin.ts  cli.ts             CLI entry and dispatch
  exec.ts                    the one process helper (injectable for tests)
  ports.ts                   port interfaces and shared types
  binding.ts                 load and validate the binding
  install.ts                 init / validate / doctor
  board/   github.ts jira.ts linear.ts local.ts index.ts
  forge/   github.ts gitlab.ts azure.ts bitbucket.ts index.ts
  vcs/     git.ts index.ts
  gates.ts                   repo gates shared by every CI template
  dispatch.ts                start a stage on its executor
  ledger.ts                  read heartbeats and scores, aggregate runs, measures and learning
  bench.ts                   build and run bench cases
  mcp.ts                     the port verbs as MCP tools
references/architecture.md   this contract
docs/                        guides and diagrams; never normative
test/                        node:test, one file per module, fake exec only (no network)
```

## 3. Ports

A skill never calls `gh`, `glab`, `az`, `jira` or `git` for a board, forge or VCS step. It calls
the CLI verb below; the binding picks the adapter. A board with an MCP server may be driven
through the MCP tools the binding's `board.mcp` names instead; the verbs and their meaning stay the
same.

Every verb prints JSON on stdout and exits 0 on success, 1 on a refused or failed action (message
on stderr), 2 on a usage error. Ids are strings everywhere (`"123"`, `"PROJ-45"`, `"LIN-9"`).
Adapters that call an HTTP API retry 429 and 5xx responses with backoff (3 tries, honouring
`Retry-After`).

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
| `comment <id> --body-file <f>` | Add a comment | `{ id, url }` |
| `comments <id> [--last <n>] [--marker <text>] [--author <a>]… [--trusted]` | Comments, newest first; first-line and author filters (`--last` counts after them). `--trusted` is `--author` for every entry of `owners.bots`, `owners.product` and `owners.factory` | `Comment[]` |
| `close <id> --reason completed\|not_planned` | Close (and move to Done or Cancelled) | `Item` |
| `child <parent> <child>` | Link a sub-issue | `Item` |

`Item = { id, title, url, status, kind?, labels[], fields: Record<logicalField,string>, milestone?, parent?, children[], assignees[], createdAt, updatedAt, statusChangedAt? }`.
Logical fields: `size`, `priority`, `lane`, `shipped`, `release_version`. The binding maps each to
the tracker's field name (Jira custom field, Linear label group or custom field, GitHub Projects
field, local JSON key).

Adapters: `github` (Projects v2 via `gh`), `jira` (Cloud REST v3, transitions for Status), `linear`
(GraphQL API, workflow states for Status), `local` (`.agents/board.json`, for tests and solo
projects). Credentials only from env vars the binding names; never from a file in the repo.

### 3.2 Forge (`agentic-sdlc forge <verb>`): the change request (CR) host

| Verb | Effect | Output |
|---|---|---|
| `open --source <b> --title <t> --body-file <f> [--draft]` | Open a CR into the trunk | `CR` |
| `view <n>` / `view --sha <sha>` | One CR; by sha, the CR whose merge commit is `<sha>` | `CR` |
| `diff <n>` | Unified diff | text |
| `list [--state open\|merged\|all]` | CRs (default open); merged ones carry `mergeSha` | `CR[]` |
| `ready <n>` / `draft <n>` | Leave or return to draft | `CR` |
| `sync <n>` | Bring the CR's source up to the trunk tip | `CR` |
| `automerge <n>` | Merge when every required check is green | `CR` |
| `comment <n> --body-file <f>` | CR comment | `{ id, url }` |
| `status <sha> --context <c> --state pending\|success\|failure --description <d> [--url <u>]` | Commit status / external check, posted only with `options.review_token_env`. The `proofs-on-base` gate alone posts with `options.token_env` (the CI job's token); the CLI verb never does. Azure DevOps posts on the PR iteration whose head is `<sha>`, since branch policies read PR statuses | `{}` |
| `approve <n>` | Approving review as `review_identity`, with `options.review_token_env` | `{}` |
| `approvals <n>` | The CR's reviews | `{ user, state, sha }[]` |
| `runs [--ref <r>] [--failed]` | CI runs | `Run[]` |

`CR = { n, url, title, source, target, headSha, baseSha, mergeSha?, draft, state: 'open'|'merged'|'closed', behind, closes: string[], checks: {name, state}[], body }`.
`closes` is parsed from the body by the shared rule: exactly the lines `Closes <id>`.

Adapters: `github` (`gh`), `gitlab` (`glab` / REST v4, merge requests, "merge when pipeline
succeeds"), `azure` (Azure DevOps REST, PR policies, auto-complete), `bitbucket` (Cloud REST 2.0,
merge checks; auto-merge = the gate merges when green).

### 3.3 VCS (`agentic-sdlc vcs <verb>`): Git

| Verb | Effect |
|---|---|
| `start <name>` → `{ workdir, ref }` | fetch; worktree and branch from the trunk tip |
| `head` → `{ ref, sha }` | `HEAD` |
| `changed [--since <rev>]` → `string[]` | `diff --name-only` against the merge base |
| `base` → `{ sha }` | merge base with the trunk |
| `push` | push the current branch; refuses the trunk and a detached HEAD |
| `cut <rev> <release>` | push `<rev>` to `refs/heads/<release_prefix><release>` |
| `tag <name> <rev>` | annotated tag (gates only) |
| `tags [--prefix <p>]` → `{ name, sha }[]`, newest first | `tag --sort=-creatordate` |
| `drop <name>` | remove the worktree and delete its branch (bench only) |
| `checkout-tests <rev> <paths…>` | product code at `<rev>`, the given proof paths kept (the `proofs-on-base` gate) |
| (`snapshot(rev)`, API only) | detached worktree outside the root, for the bench |

The trunk, release prefix and name pattern come from the binding. "Branch" in skills means the
change line `start` creates.

### 3.4 Gates (`agentic-sdlc gate <name>`): run by CI, never by agents

| Gate | Guarantee |
|---|---|
| `branch-names` | A change line outside the binding's patterns is refused. |
| `linkage` | Posts check `ticket-linkage`: a product CR closes exactly one open ticket and names it in its source. |
| `proofs-on-base --cr <n>` | In the no-secrets `pull_request` job: runs the CR's new or changed proof files against the merge base's product code; posts status `proofs-on-base`, success when each new proof fails on base. |
| `approval --cr <n>` | Classifies the CR as `product-fast`, `product-full`, `tuning` or `guardrail` (§6.5) and posts status `human-approval`. Success for `product-fast`; for `tuning` when `tuning` is in `learning.auto_merge_classes`; for `product-full` (when `forge.human_approval` is `full-lane` or `always`) and for every product CR when `always`, only with an approving review on the head SHA by a human (not in `owners.bots`, not `forge.review_identity`); for `guardrail` only with an approval by `owners.factory`. Runs on CR events and on review submitted. Unknown paths, deletions or an unreadable head fail closed to `guardrail`. |
| `board-sync --cr <n> \| --sha <sha> --event opened\|ready\|draft\|merged` | CR events move its one ticket to In review; a merge into the trunk moves it to Done and sets Shipped Not shipped when empty. Held and done tickets are skipped. |
| `board-sync --event in-release --release <v>` | A release-line push sets Shipped In release on the tickets of version `<v>`. |
| `shipped <env> --sha <sha> --result success\|failure` | Only Done tickets whose CR merge is an ancestor of `<sha>` get `On <env>`; unknown ancestry ships nothing. A failure in the last environment returns In release tickets to the previous environment, clears the version and opens a held Signal. |
| `signal-on-red --run <id>` | A red trunk or release-line run opens a Signal with a redacted evidence bundle. Other refs are ignored. |
| `skill-regression` | A change under `paths.factory` keeps the skill pack valid: frontmatter, links, scorers. |

Checks:

- **`Required`** is a CI job, not a gate and not an agent: on `pull_request`, with no secrets, it
  runs `commands.install` and `commands.verify` on the CR head. The `proofs-on-base` gate runs in
  the same job. The GitHub CR workflow also triggers on `merge_group`, for merge queues.
- **`review`** is posted by `review-pr` as `forge.review_identity`.
- **Required checks**: `ticket-linkage`, `Required`, `proofs-on-base`, `review`,
  `human-approval`, `skill-regression`. The trunk ruleset pins each to its source app
  (`integration_id`); `doctor` warns when a required check is not pinned. No CODEOWNERS file:
  the `approval` gate enforces owner approval by class, so `tuning` can auto-merge.
- A dead-man job runs `ledger stale --max-hours <h>` on a schedule.

CI loads the binding from the **target** branch, never from the CR, and never runs CR code with
secrets. The trunk needs the review identity's approving review and every required check green.

## 4. The binding (`.agents/binding.yml`)

[`templates/binding.yml`](../templates/binding.yml) is the one reference: it lists every key with
its meaning and default, and `validate` checks the adapter options per adapter. Its top-level
groups are `version`, `profile`, `owners`, `board`, `forge`, `vcs`, `product`, `executors`, `mcps`,
`traces`, `models`, `agent_command`, `commands`, `paths`, the sizing and flow keys, `cycle`,
`heartbeat` and `learning`.

Keys this contract relies on by name:

- `forge.human_approval: full-lane | always | never` (default `full-lane`), `forge.review_identity`,
  `forge.review_runtime: separate | same`, `forge.options.review_token_env`,
  `forge.required_checks`.
- `commands.install`, `commands.verify` (the `Required` job), `commands.proofs_on_base` (the
  `proofs-on-base` gate: a command with `{files}`, run once per new proof file), `commands.preview` (optional: deploys
  a CR head for `verify-ux`), `commands.rollback`.
- `paths.factory`: a change only there is a **factory change**: no ticket, its own change pattern
  (`vcs.factory_change_pattern`), classified by the `approval` gate and checked by
  `skill-regression`.
- `learning.every_cycles`, `learning.min_evidence_runs`, `learning.bench_size`,
  `learning.bench_min_cases` (default 20), `learning.bench_trials` (default 3),
  `learning.auto_merge_classes` (template default `[]` until a bench baseline exists),
  `learning.judge_tier`, `learning.budget_usd_per_week`, `learning.human_sample`.

## 5. Skills

Each skill has frontmatter `name`, `description` and `metadata: { tier }`, plus
`disable-model-invocation: true` for skills only a person or the cycle starts (`release`,
`improve-factory`) and `user-invocable: false` for skills only another skill starts
(`triage-signal`, `shape`, `judge-run`, `verify-ux`, `escalate-to-human`). The body is a contract
pointer to `sdlc`, numbered steps each ending on a checkable **Done when**, then Rules. `tier` is
`fast`, `balanced` or `deep`; the binding's `models` maps it to a model. Board, forge and VCS steps
name the port verb, never a vendor CLI. Every process rule has one home in the skills; this
contract defines mechanism only.

## 6. The self-improvement loop

Visibility into every run, scored runs, a loop that proposes fixes to the factory itself, and
benchmarks built from the project's own past tasks to compare cost and quality across models,
executors and factory versions.

1. **Ledger.** Every run the cycle starts is one row in the heartbeat's `runs`: skill, skill
   version (content hash), ticket or CR, tier, model, executor, tokens, cost, minutes, outcome and
   `trace` (a reference into `traces.uri` when the executor stored its transcript). `ledger
   summary` adds `learning: { due, cyclesSince, spentWeekUsd }`, computed from heartbeats and run
   rows, so no skill keeps a counter. `ledger stale --max-hours <h>` exits 1 when the newest
   heartbeat is older.
2. **Scorers.** A scorer is a file `.agents/scorers/<name>.md`: frontmatter `name`, `applies_to`
   (skills, or `*`) and `scale` (`pass-fail` or `0-4`), and a body that is the rubric question.
   The package ships `done-conditions` (the 0–4 `score`), `redundant-tests`, `scope-creep`,
   `spec-adherence` and `over-engineering`.
3. **Judge.** `dispatch judge-run --run-model <m>` picks `models[learning.judge_tier]`, or the next
   tier when that is the run's own model, and prints `{ skip: true }` when none is independent.
   `ledger plan --run <id>` prints the applicable scorers, the evidence refs (trace, CR, diff) and
   the hard-fact cap (failed or timed-out outcome, red check, send-back, bounce, reopen, escape,
   bench oracle red). `judge-run` grades each scorer with the model. `ledger record --run <id>
   --file <scores.json>` validates scorer names and scales, applies the cap and posts one
   `<!-- scores -->` comment on the heartbeat ticket; `ledger` reads these. A **human grade**, a
   comment `agentic-sdlc:grade <run-id> <scorer> <value>` by `owners.product` or
   `owners.factory`, wins over both.
4. **Improve.** When `learning.due`, `improve-factory` reads the ledger and the measures, clusters
   failures by scorer and by normalised error, takes the worst cluster (at least
   `learning.min_evidence_runs` runs over two tickets), and proposes **one** factory change in a
   draft factory CR, which `review-pr` reviews (`dispatch --cr`).
5. **Classes and merge.** The `approval` gate classifies. `tuning` is only the `models` map, and a
   skill's `metadata.tier` when that skill has a bench suite; it merges on the agent review when
   `tuning` is in `learning.auto_merge_classes`. Everything else under `paths.factory`, including
   any change to skill text, is `guardrail` and waits for `owners.factory`.
6. **Prove.** The change runs on the bench against the current factory. `bench compare` needs at
   least `learning.bench_min_cases` shared cases and `learning.bench_trials` trials per case and
   compares the Wilson lower bound of the pass rate; fewer is `regressed`. The change must not
   lower it and must not raise cost by more than its gain.
7. **Bench.** `bench build` turns merged tickets into cases: the ticket and spec, the merge base,
   and the CR's own new proofs as the hidden oracle. Cases belong to **suites**
   (`.agents/bench/suites/<suite>.json`): `bench build --suite <name> [--paths <glob>]…
   [--per-size <n>]` picks a stratified set by Size and touched area; `bench propose --suite
   <name>` nominates past tickets, which a factory CR adds. `bench run --suite <s> (--model <id> |
   --executor <e>) [--factory <rev>]` replays cases in fresh worktrees outside the root and
   records pass rate, cost and minutes per case. `bench report --suite <s>` marks the Pareto front
   of quality against cost. Only `harness` and `command` executors run on the bench.
8. **Measures.** The heartbeat and `ledger summary` report what the board and ledger hold:
   cost per merged CR, learning spend share, and the heartbeat's measures (automation rate, DORA,
   cycle time, first-pass rate) as the cycle read them.
9. **Budget.** Judge, improve and bench spend stay under `learning.budget_usd_per_week`; over
   budget the loop reports and stops.

## 7. Executors: who runs each stage

The cycle orchestrator routes a ticket to a skill. The binding's `executors` says **who** runs
that skill. The default is the harness's own subagent.

```yaml
executors:
  default: { kind: harness }
  implement-spec: { kind: assign, user: coding-bot }
  review-pr: { kind: webhook, url_env: REVIEW_BOT_URL, token_env: REVIEW_BOT_TOKEN }
  release: { kind: command, run: "my-release-bot --ticket {ticket} --skill {skill}" }
  triage-signal: { kind: managed, api: claude, agent_env: TRIAGE_AGENT_ID, environment_env: TRIAGE_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY }
```

| Kind | Start | Result comes back by |
|---|---|---|
| `harness` | A subagent loads `.agents/skills/<skill>/SKILL.md` (or the plugin skill), model by its tier. | The subagent's own board and forge writes. |
| `command` | The CLI runs `run` with `{skill} {ticket} {cr} {workdir} {prompt_file}` filled in. | Exit code plus the bot's board and forge writes. |
| `webhook` | The CLI POSTs the task (`skill`, `ticket`, `cr`) as JSON to the URL. | The bot's board and forge writes; the next cycle reads them. |
| `managed` | The CLI starts a run on a managed-agent API, shaped by `api`: `claude` (Managed Agents `POST /v1/sessions`), `cursor` (Cloud Agents `POST /v1/agents`), `antigravity` (Gemini Interactions), or `generic` (`POST <endpoint>/sessions`). | Same. The run id goes in the ledger row. |
| `assign` | The CLI assigns the ticket (or CR) to the bot user and adds the skill name as a comment. | Same. |

Every executor entry may also declare `mcps` (names from the binding's `mcps` map; the stage gets
only these), `secrets` (env var names the stage may receive; nothing else is passed), `sandbox`
(`cloud`, `container` or `local`) and `model` (`{ tier }` or `{ id }`). Secrets reach an executor
only when listed, and never through a board or CR comment.

`agentic-sdlc dispatch <skill> (--ticket <id> | --cr <n>) [--run-model <m>] [--workdir <d>]`
starts the executor and prints `{ kind, ref, startedAt }`; for `harness` it prints the instruction
for the orchestrator and starts nothing. The idempotency key is `<ticket or cr>-<skill>-<head
sha>`: a second dispatch with the same key inside `stall_minutes` prints `{ skipped: true }`. With
`AGENTIC_SDLC_UNATTENDED=1`, `dispatch` refuses a stage whose sandbox is `local` or unset. The
ledger row records `executor` and `ref`, so the bench and `improve-factory` compare executors as
they compare models.

## 8. Any product type

Nothing in the skills assumes a web app or a code product. The binding states what "verify" and
"shipped" mean for this product:

```yaml
product:
  environments: [staging, production]   # ordered; the last is where users get value
  proofs: [test, eval, visual, data-check, computer-use, manual]
```

- Shipped options are derived: `Not shipped`, `On <env>` per environment, and `In release` before
  the last one. The `shipped` gate takes any environment name. A product with no deploy uses its
  publish step as the last environment.
- A criterion names its proof kind. `commands.verify` runs every kind except `computer-use` and
  `manual`: scripted UI checks are `visual` or `test`. `computer-use` is agent-driven by
  `verify-ux` on the `commands.preview` deployment of the CR head; `manual` escalates for a human
  check.
- The bench oracle is the merged change's own new proofs (tests, eval cases, data checks), not only
  unit tests.

## 9. Intake and data ownership

- **Intake.** Any tool that creates a board item at Signals with a `signal:<stream>` label is an
  intake: a chat bot, the tracker's own form, a CR comment command, a monitoring alert. The
  factory needs no intake of its own.
- **Data ownership.** The board, the repo and `traces.uri` hold every fact, score and trace. The
  binding names the inference endpoints (`models` may point at any provider or self-hosted model)
  and where each stage runs (`sandbox`). Nothing leaves the project's own systems except calls to
  the providers the binding names.

## 10. Runtimes and profiles: no dependency on one machine

Any scheduler that can start an agent with the repo and network access runs one cycle with the
prompt in `templates/runner/cycle-prompt.md`.

| Runtime | How it reaches the ports |
|---|---|
| Agent with a shell (Claude Code, Codex, Cursor, Antigravity, Grok, CI cron with a headless agent CLI) | `npx --no agentic-sdlc <group> <verb>` |
| Agent with MCP but no shell | `agentic-sdlc mcp` (stdio; `--http` for a hosted endpoint with a bearer token). The default tool list excludes `forge_approve` and `forge_status`; `mcp --allow approve,status` adds them, for the review runtime only. |
| Agent with only vendor MCP tools | the vendor tools that `board.mcp` maps to the board verbs; forge steps need a shell or the MCP server; gates still run in CI |

Gates always run in the forge's CI, so trunk guarantees never depend on the runtime.

**Packaging per harness.** For Claude Code the package is a plugin (`.claude-plugin/`: skills,
hooks, the MCP server), so skills are named `/agentic-sdlc:<skill>`. `init --harness claude`
copies no skills; it generates one subagent per tier and adds an `@AGENTS.md` import to
`CLAUDE.md`. Codex, Cursor and Antigravity read `.agents/skills`, which `init` writes. Claude
headless runs pass `--permission-mode acceptEdits`, `--allowedTools` for the CLI, `git push` and
the MCP server, and `--max-turns`; the cycle job adds `--disallowedTools` for `forge approve`.

`profile` in the binding picks the defaults:

| | `individual` (subscriptions only) | `enterprise` (APIs and managed agents) |
|---|---|---|
| Scheduler | The subscription's own scheduler or CI cron with a subscription-authenticated headless CLI | Any of those, plus a managed-agent platform or the org's job runner |
| Executors | `harness` only; `command` for a local headless CLI logged in with the subscription | All kinds |
| Review identity | A second account or a fine-grained token for the reviewer | A forge app or bot account with its own token |
| Traces | None, or files in the runner's scratch dir | `traces.uri` on the org's storage |
| Bench | Small suites inside the weekly budget | Full suites across models and executors |

`init --profile individual|enterprise` writes these defaults. `validate` warns when an
`individual` binding names an executor kind that needs an API key; the individual runner fails
when `ANTHROPIC_API_KEY` is set, since it outranks the subscription token.

**Two runtimes, two identities.** With `forge.review_runtime: separate` (the default), every
scheduler runs two jobs: the cycle (`templates/runner/cycle-prompt.md`), which never holds the
review token, and the review (`templates/runner/review-prompt.md`), which runs after the cycle
finishes (a job dependency, never its own clock), holds `forge.options.review_token_env` and runs
only `review-pr`, for product and factory CRs. The review runtime **never runs CR code**: it reads
`Required` and `proofs-on-base` from CI and runs no install or test command. So an implementer can
never post the `review` status or the approving review for its own CR, and a CR's code never sees
the review token. `same` is allowed only with a warning. Unattended jobs set
`AGENTIC_SDLC_UNATTENDED=1`.
