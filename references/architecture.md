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

An agent harness (Claude Code, Codex, Cursor, Antigravity, Grok, any other) runs the loop by
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
  forge/   github.ts index.ts
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
`Retry-After`). A POST retries only 429, since a 5xx may come after the write.

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

### 3.2 Forge (`agentic-sdlc forge <verb>`): the change request (CR) host, GitHub

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
| `comments <n> [--last <k>] [--marker <text>] [--author <a>]… [--trusted]` | CR comments (review report, owner reply on a factory CR), newest first, system notes dropped; same filters as `board comments` (`--last` counts after them) | `Comment[]` |
| `status <sha> --context <c> --state pending\|success\|failure --description <d> [--url <u>]` | Commit status / external check, posted only with `options.review_token_env`. The verb refuses the contexts the gates own (`human-approval`, `ticket-linkage`, `proofs-on-base`). The `proofs-on-base` and `linkage` gates post with `options.token_env` (the CI job's token); the CLI verb never does. | `{}` |
| `approve <n>` | Approving review as `review_identity`, with `options.review_token_env` | `{}` |
| `approvals <n>` | The CR's reviews | `{ user, state, sha }[]` |
| `runs [--ref <r>] [--failed]` | CI runs | `Run[]` |
| `cut <revision> <version>` | Starts the release workflow `agentic-sdlc-release.yml`, which runs in Environment `agentic-release` (the Product owner approves it) and pushes the release line with the release bot's token. Returns the run this dispatch created: the newest run id above every id seen before it | `{ requested: true, run?, url? }` |

The forge may implement `closing(id)`: the merged CRs whose body closes ticket `id` (GitHub searches the body). Gates use it to look up a ticket's merges without listing every merged CR. The search index can trail a merge, so a ticket the search finds no merge for is also looked up in `list({ state: 'merged' })`.
`CR = { n, url, title, source, target, headSha, baseSha, mergeSha?, draft, state: 'open'|'merged'|'closed', behind, closes: string[], checks: {name, state}[], body, author, pushedAt? }`.
`closes` is parsed from the body by the shared rule: exactly the lines `Closes <id>`. `author` is the forge login that opened the CR, in the form comment authors use. `pushedAt` is when the head reached the forge: the creation time of the first check suite on `headSha` (absent before CI starts). Stall clocks after a push (`stall_minutes`) count from it.

Adapter: `github` (`gh`), the one forge: on other forges a CR can change the pipeline file that runs its own gates.

### 3.3 VCS (`agentic-sdlc vcs <verb>`): Git

| Verb | Effect |
|---|---|
| `start <name>` → `{ workdir, ref }` | fetch; reuse the change line `<name>` (its worktree, local branch or origin branch) when it exists, else a worktree and branch from the trunk tip |
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
change line `start` opens.

### 3.4 Gates (`agentic-sdlc gate <name>`): run by CI, never by agents

| Gate | Guarantee |
|---|---|
| `branch-names` | A change line outside the binding's patterns, the dependency lines `dependabot/` and `renovate/`, and the trunk is refused. |
| `linkage` | Posts check `ticket-linkage`: a product CR closes exactly one open ticket and names it in its source. |
| `proofs-on-base --cr <n>` | In the no-secrets `pull_request` job: runs the CR's new or changed proof files against the merge base's product code; posts status `proofs-on-base`, success when each new proof fails on base, or when a product CR changes only `paths.no_proof`. |
| `approval --cr <n>` | Classifies the CR as `product-fast`, `product-full`, `tuning` or `guardrail` (§6.5) and posts status `human-approval`. Success for `product-fast`; for `tuning` when `tuning` is in `learning.auto_merge_classes`; for `product-full` (when `forge.human_approval` is `full-lane` or `always`) and for every product CR when `always`, only with an approving review on the head SHA by a human (not in `owners.bots`, not `forge.review_identity`); for `guardrail` only with an approval by `owners.factory`. Runs on CR events and on review submitted. Unknown paths, deletions or an unreadable head fail closed to `guardrail`. A CR that mixes product and factory paths is `guardrail`; a product CR that touches `paths.lane_areas` is `product-full`. |
| `merged --sha <sha>` | Run on a trunk push. The CR merged at `<sha>` moves its one ticket to Done (`--only-from` its current status) and sets Shipped Not shipped when empty. Done records a fact: a held ticket moves and keeps its label; a Cancelled ticket stays. A push with no CR changes nothing. No CR-pipeline gate writes the board; besides this gate only `shipped` moves a ticket (In review to Done, when a deploy reports first). |
| `shipped <env> --sha <sha> --result success\|failure\|rolled-back [--version <v>]` | Only Done or In review tickets whose CR merge is an ancestor of `<sha>` get `On <env>` (an In review one moves to Done first); `--version` gives the ones without a Release Version that version, and the last environment tags it. `rolled-back`: tickets On `<env>` or later whose merges are not in `<sha>` (the revision now running) step back one environment and keep their version. Unknown ancestry changes nothing. A failure in the last environment returns the tickets of the version in flight to the previous environment, clears the version and opens a held Signal. |
| `signal-on-red --run <id>` | A red trunk or release-line run opens a Signal with a redacted evidence bundle. Other refs are ignored. |
| `skill-regression` | A change under `paths.factory` keeps the skill pack valid: frontmatter, links, scorers. |

Checks:

- **`Required`** is a CI job, not a gate and not an agent: on `pull_request`, with no secrets, it
  runs `commands.install` and `commands.verify` on the CR head. The `proofs-on-base` gate runs in
  its own job, also with no secrets: where it cannot post the status, its result is the check. The GitHub CR workflow also triggers on `merge_group`, for merge queues.
- **`review`** is posted by `review-pr` as `forge.review_identity`.
- **Required checks**: `ticket-linkage`, `Required`, `proofs-on-base`, `review`,
  `human-approval`, `skill-regression`. The trunk ruleset pins the four CI checks to their
  source app (`integration_id`); `review` and `human-approval` post with the review token, so pin them
  to the review app when it is an App. `doctor` warns when a required check is not pinned. No CODEOWNERS file:
  the `approval` gate enforces owner approval by class, so `tuning` can auto-merge.
- A dead-man job runs `ledger stale --max-hours <h>` on a schedule.

CI loads the binding from the **target** branch, never from the CR, and never runs CR code with
secrets. The trunk needs the review identity's approving review and every required check green.

## 4. The binding (`.agents/binding.yml`)

[`templates/binding.yml`](../templates/binding.yml) is the one reference: it lists every key with
its meaning and default, and `validate` checks the adapter options per adapter. It also requires `vcs.trunk`, `vcs.release_prefix` (ending in `/`) and `vcs.factory_change_pattern` to be non-empty and `vcs.tag_prefix` to be a string. Its top-level
groups are `version`, `profile`, `owners`, `board`, `forge`, `vcs`, `product`, `executors`, `mcps`,
`traces`, `models`, `agent_command`, `commands`, `paths`, the sizing and flow keys, `cycle`,
`heartbeat` and `learning`.

Keys this contract relies on by name:

- `owners.product`, `owners.factory` and each entry of `owners.bots`: one account name, or `{ board, forge }`
  when the board and the forge name the person differently. Board reads (ledger, dispatch, `board comments
  --trusted`, spec authors) use `board`; forge reads (the approval gate, `forge comments --trusted`) use `forge`.
- `heartbeat.ticket`: the id of the ticket that holds heartbeat comments; `validate` fails when it is empty.
  `init --board local` creates it (status Cancelled, so no route reads it) and sets it.
- `forge.human_approval: full-lane | always | never` (default `full-lane`), `forge.review_identity`,
  `forge.options.review_token_env`,
  `forge.required_checks`.
- `commands.install`, `commands.verify` (the `Required` job), `commands.proofs_on_base` (the
  `proofs-on-base` gate: a command with `{files}`, run once per new proof file), `commands.preview` (optional: deploys
  a CR head for `verify-ux`), `commands.rollback`, `commands.evidence_check` (exits 0 when every
  `product.evidence` kind exists for `{sha}`; the release ready check runs it).
- `product.delivery: release-line | continuous` (default `release-line`; continuous needs no
  `vcs.release_prefix` and has no In release), `product.evidence: [sbom | provenance | signature]`,
  `paths.no_proof` (globs a product CR may change with no proof file).
- `cycle.dedupe_minutes`: a second dispatch of the same skill and subject inside it is a double fire
  and is skipped (unset or 0: no check; the template sets 10). A run has finished when its own done line `<!-- agentic-sdlc:done <key> -->` appears after the
  dispatch marker (posted by a bot, or by the `assign` executor's user); other runs' comments never count. `dispatch` hands that line to every executor in its task.
  An unfinished run blocks a second dispatch until `stall_minutes`.
- `paths.factory`: a change only there is a **factory change**: no ticket, its own change pattern
  (`vcs.factory_change_pattern`), classified by the `approval` gate and checked by
  `skill-regression`.
- `learning.every_cycles`, `learning.min_evidence_runs`, `learning.bench_size`,
  `learning.bench_min_cases` (default 20), `learning.bench_trials` (default 3),
  `learning.auto_merge_classes` (template default `[]` until a bench baseline exists),
  `learning.judge_tier`, `learning.budget_usd_per_week` (`learning.due` is false once the week's learning spend reaches it).

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
   summary` adds `learning: { due, judge, cyclesSince, spentWeekUsd }` (`judge`: the weekly budget is not spent), computed from heartbeats and run
   rows, so no skill keeps a counter. `ledger stale --max-hours <h>` exits 1 when the newest
   heartbeat is older. The heartbeat's `learning` object carries `lastProposal` and
   `benchBaseline`; only `improve-factory` changes them and every heartbeat copies them forward
   (fields in `skills/sdlc/references/heartbeat.md`).
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
   any change to skill text, is `guardrail` and waits for `owners.factory`. A CR that mixes product
   and factory paths is also `guardrail`.
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

The executor kinds, their fields, and what `dispatch` prints are defined in `skills/sdlc/references/executors.md` (installed by init with the skill pack), which is part of this contract.

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
  `release` skill, and the deploy pipeline records the artifact version with `gate shipped --version`.
- Shipped options are derived: `Not shipped`, `On <env>` per environment, and `In release` before
  the last one (release-line only). The `shipped` gate takes any environment name. A product with no deploy uses its
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
hooks, the MCP server), so skills are named `/agentic-sdlc:<skill>`. `init --harness claude`
copies no skills; it generates one subagent per tier and adds an `@AGENTS.md` import to
`CLAUDE.md`. `--no-plugin` copies the skills to `.claude/skills` instead and writes `.mcp.json`, for a setup without the plugin, such as a cloud session. Codex, Cursor and Antigravity read `.agents/skills`, which `init` writes. Claude
headless runs pass `--permission-mode acceptEdits`, `--allowedTools` and `--max-turns`. The cycle
allows the CLI, the MCP server, `git add`, `git commit`, `git push` and the npm checks, and adds
`--disallowedTools` for `forge approve`. The review allows only the CLI and the MCP server.

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

**Two runtimes, two identities.** Every scheduler runs two jobs: the cycle (`templates/runner/cycle-prompt.md`), which never holds the
review token, and the review (`templates/runner/review-prompt.md`), which runs after the cycle
finishes (a job dependency, never its own clock), holds `forge.options.review_token_env` and runs
only `review-pr`, for product and factory CRs. `forge status` refuses the contexts the gates own
(`human-approval`, `ticket-linkage`, `proofs-on-base`). The implementer's `token_env` has no commit-status
write (a fine-grained token with Commit statuses: no access; `doctor` warns on a classic token with scope
`repo` or `repo:status`), and every required check is pinned to the app that posts it. The review runtime **never runs CR code**: it reads
`Required` and `proofs-on-base` from CI and runs no install or test command. So an implementer can
never post the `review` status or the approving review for its own CR, and a CR's code never sees
the review token. Unattended jobs set
`AGENTIC_SDLC_UNATTENDED=1`.
