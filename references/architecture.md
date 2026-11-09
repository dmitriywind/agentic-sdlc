# agentic-sdlc architecture (v2: the software factory)

Status: normative. This file is the contract every part of the package is built against. A change
here changes the parts in the same PR.

## 1. What the package is

A **software factory** that any project installs to deliver value continuously. The factory is
critical infrastructure: defined in code, versioned in the repo it serves, open to any board, any
tech stack and any version control system, and measured on the project's own data.

Three layers, each with one home:

| Layer | Home | Holds |
|---|---|---|
| Process | `skills/` (copied to `.agents/skills/` on install) | Every process rule. Generic. No project value. |
| Binding | `.agents/binding.yml` in the project | Every project value: board, statuses, commands, paths, owners, model tiers. |
| Ports | `src/` → the `agentic-sdlc` CLI | Board, forge and VCS adapters, repo gates, the run ledger and the bench. Mechanism only, no process rule. |

The agent harness (Claude Code routines, managed agents, Codex, Gemini CLI, any other) runs the
loop by loading the `sdlc` skill. The package ships **no supervisor and no agent runner**. The
one exception is `bench run`, which starts the binding's `agent_command` headless on a past task.

Constraint: delivery is **trunk-based** on every VCS. One trunk, short-lived change branches (or
the VCS equivalent) in, release lines out. No long-lived develop branch. No hotfix path.

## 2. Repository layout

```
skills/                    the portable skill pack (Agent Skills format: <name>/SKILL.md)
  sdlc/                    navigator: contract, routing, cycle, statuses, lanes, learning loop
    SKILL.md
    references/heartbeat.md   heartbeat v5 incl. the run ledger
    references/ports.md       how a skill calls the board, forge and VCS
  triage-signal/  backlog-grooming/  shape/  implement-spec/  review-pr/  release/
  escalate-to-human/
  judge-run/               score one finished run against its skill's done conditions
  improve-factory/         the self-improvement loop: propose one factory change with proof
  bench/                   build and run benchmarks from the project's own past tasks
templates/
  binding.yml              the binding template with every key documented
  gates/github/            GitHub Actions workflows calling `agentic-sdlc gate …`
  gates/gitlab/            .gitlab-ci.yml include
  gates/azure/             azure-pipelines.yml
  gates/bitbucket/         bitbucket-pipelines.yml
  gates/hooks/             pre-push (git), pretxnchangegroup (hg), change-submit trigger (p4)
src/
  bin.ts  cli.ts           CLI entry and dispatch
  exec.ts                  the one process helper (injectable for tests)
  ports.ts                 port interfaces and shared types
  binding.ts               load and validate the binding
  install.ts               init / validate / doctor
  board/   github.ts jira.ts linear.ts local.ts index.ts
  forge/   github.ts gitlab.ts azure.ts bitbucket.ts swarm.ts index.ts
  vcs/     git.ts hg.ts p4.ts index.ts
  gates.ts                 repo gates shared by every CI template
  ledger.ts                read heartbeats, aggregate runs and measures
  bench.ts                 build and run bench cases
test/                      node:test, one file per module, fake exec only (no network)
```

## 3. Ports

A skill never calls `gh`, `glab`, `az`, `jira`, `git`, `hg` or `p4` for a board, forge or VCS
step. It calls the CLI verb below; the binding picks the adapter. A board with an MCP server may
be driven through the MCP tools the binding's `board.mcp` names instead; the verbs and their
meaning stay the same.

Every verb prints JSON on stdout and exits 0 on success, 1 on a refused or failed action (message
on stderr), 2 on a usage error. Ids are strings everywhere (`"123"`, `"PROJ-45"`, `"LIN-9"`).

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
| `comments <id> [--last <n>] [--marker <text>] [--author <a>]…` | Comments, newest first; first-line and author filters (`--last` counts after them) | `Comment[]` |
| `close <id> --reason completed\|not_planned` | Close (and move to Done or Cancelled) | `Item` |
| `child <parent> <child>` | Link a sub-issue | `Item` |

`Item = { id, title, url, status, kind?, labels[], fields: Record<logicalField,string>, milestone?, parent?, children[], assignees[], createdAt, updatedAt, statusChangedAt? }`.
Logical fields: `size`, `priority`, `lane`, `shipped`, `release_version`. The binding maps each to
the tracker's field name (Jira custom field, Linear label group or custom field, GitHub Projects
field, local JSON key).

Adapters: `github` (Projects v2 via `gh`), `jira` (Cloud REST v3, transitions for Status), `linear`
(GraphQL API, workflow states for Status), `local` (`.agents/board.json`, for tests and solo
projects). Credentials only from env vars the binding names; never from a file in the repo.

### 3.2 Forge (`agentic-sdlc forge <verb>`) — the change request (CR) host

| Verb | Effect | Output |
|---|---|---|
| `open --source <b> --title <t> --body-file <f> [--draft]` | Open a CR into the trunk | `CR` |
| `view <n>` / `view --sha <sha>` | One CR; by sha, the CR whose merge commit is `<sha>` | `CR` |
| `diff <n>` | Unified diff | text |
| `list [--state open|merged|all]` | CRs (default open); merged ones carry `mergeSha` | `CR[]` |
| `ready <n>` / `draft <n>` | Leave or return to draft | `CR` |
| `sync <n>` | Bring the CR's source up to the trunk tip | `CR` |
| `automerge <n>` | Merge when every required check is green | `CR` |
| `comment <n> --body-file <f>` | CR comment | `{ id, url }` |
| `status <sha> --context <c> --state pending\|success\|failure --description <d> [--url <u>]` | Commit status / external check, posted only with `options.review_token_env` | `{}` |
| `approve <n>` | Approving review as `review_identity`, with `options.review_token_env` | `{}` |
| `runs [--ref <r>] [--failed]` | CI runs | `Run[]` |

`CR = { n, url, title, source, target, headSha, baseSha, mergeSha?, draft, state: 'open'|'merged'|'closed', behind, closes: string[], checks: {name, state}[], body }`.
`closes` is parsed from the body by the shared rule: exactly the lines `Closes <id>`.

Adapters: `github` (`gh`), `gitlab` (`glab` / REST v4, merge requests, "merge when pipeline
succeeds"; also Heptapod for Mercurial), `azure` (Azure DevOps REST, PR policies, auto-complete),
`bitbucket` (Cloud REST 2.0, merge checks; auto-merge = the gate merges when green), `swarm`
(Helix Swarm reviews for Perforce; ready = request review, automerge = gate commits the shelf).

### 3.3 VCS (`agentic-sdlc vcs <verb>`)

| Verb | Git | Mercurial | Perforce |
|---|---|---|---|
| `start <name>` → `{ workdir, ref }` | fetch; worktree + branch from trunk tip | share + topic from trunk tip | new task stream from mainline, or a pending changelist |
| `head` → `{ ref, sha }` | `HEAD` | `.` | latest change in the workspace |
| `changed [--since <rev>]` → `string[]` | `diff --name-only` vs merge base | `status --rev` | `describe` / `opened` |
| `base` → `{ sha }` | merge base with trunk | ancestor with trunk | parent change |
| `push` | push branch | push topic | shelve the changelist |
| `cut <rev> <release>` | push `<rev>` to `refs/heads/<release_prefix><release>` | bookmark on `<rev>` | release stream / label at `<rev>` |
| `tag <name> <rev>` | annotated tag | `hg tag` | label |
| `tags [--prefix <p>]` → `{ name, sha }[]`, newest first | `tag --sort=-creatordate` | `hg tags` | `labels` |
| `drop <name>` | remove the worktree and delete its branch | remove the share dir | delete the client, revert the pending changelist |
| (`snapshot(rev)`, API only) → detached tree outside the root, for the bench | `worktree add --detach` in tmpdir | not supported | not supported |
| `checkout-tests <rev> <paths…>` | product code at `<rev>`, keep given test paths | same | same |

The trunk, release prefix and name pattern come from the binding. "Branch" in skills means the
VCS change line `start` creates.

### 3.4 Gates (`agentic-sdlc gate <name>`) — run by CI, never by agents

| Gate | Guarantee |
|---|---|
| `branch-names` | A change line outside the binding's patterns is refused. |
| `linkage` | A product CR closes exactly one open ticket and names it in its source. Output carries `class`: product, tuning or guardrail. |
| `factory-class --cr <n>` | Posts status `factory-owner`: success for a product CR, and for a tuning CR when `tuning` is in `learning.auto_merge_classes`; failure otherwise, so a guardrail CR merges only with the factory owner's code-owner approval. Unknown paths, deletions or an unreadable head fail closed to guardrail. |
| `board-sync --cr <n> \| --sha <sha> --event opened\|ready\|draft\|merged` | CR events move its one ticket to In review; a merge into the trunk moves it to Done and sets Shipped Not shipped when empty. Held and done tickets are skipped. |
| `board-sync --event in-release --release <v>` | A release-line push sets Shipped In release on the tickets of version `<v>`. |
| `shipped <env> --sha <sha> --result success\|failure` | Only Done tickets whose CR merge is an ancestor of `<sha>` get `On <env>`; unknown ancestry ships nothing. A failure in the last environment returns In release tickets to the previous environment, clears the version and opens a held Signal. |
| `signal-on-red --run <id>` | A red trunk or release-line run opens a Signal with a redacted evidence bundle. Other refs are ignored. |
| `skill-regression` | A change under `.agents/**` keeps the skill pack valid. |

CI loads the binding from the **target** branch, never from the CR, and never runs CR code with
secrets. The trunk needs one approving review (the review identity), code-owner review for
`paths.factory` (the factory owner), and the required checks green.

## 4. The binding (`.agents/binding.yml`)

The walletmate binding is the reference. v2 renames GitHub-specific keys to port keys:

```yaml
version: 2
owners: { product: <user>, factory: <user>, bots: [<user>] } # bots: the accounts the factory runs as; only their heartbeats are trusted
board:   { adapter: github|jira|linear|local, options: {...}, mcp?: {...}, statuses: [...], fields: {...}, labels: {...}, ... }
forge:   { adapter: github|gitlab|azure|bitbucket|swarm, options: { ..., token_env, review_token_env }, review_identity, review_runtime: separate|same, required_checks: [...], planned_checks: [...] }
# options keys per adapter are checked by `validate`; templates/binding.yml lists them. gitlab needs base_url (no default host).
vcs:     { adapter: git|hg|p4, trunk, change_pattern, factory_change_pattern, release_prefix, tag_prefix, version_scheme }
models:  { fast: <id>, balanced: <id>, deep: <id> } # skills name a tier, never a model
agent_command: "<headless agent command with {model} {prompt_file} {workdir}>" # bench only
commands: { setup, install, fast_check, verify, light_verify, rollback }
paths:   { guiding_narrative, roadmap_doc, importance_doc, glossary, review_checklist, test_standard, security_policy, pr_template, sources_before_question: [...], factory: [...], light_verify: [...], lane_areas: [...] }
sizes / ready_size_limit / fast_lane_max_size / priorities / p0_setters / max_subissue_depth / spec_marker / stall_minutes / parallel_agents
cycle:   { max_implementations, min_ready, time_budget_minutes, failure_limit }
heartbeat: { ticket: <id> }
learning: { every_cycles, min_evidence_runs, bench_size, auto_merge_classes: [tuning], judge_tier, budget_usd_per_week }
```

`orchestration_paths` becomes `paths.factory`: a change only there is a **factory change**: no
ticket, its own change pattern, gated by `skill-regression`.

## 5. Skills

Each skill keeps the walletmate shape: frontmatter (`name`, `description`, `tier`), a contract
pointer to `sdlc`, numbered steps each ending on a checkable **Done when**, then Rules. `tier` is
`fast`, `balanced` or `deep`; the binding maps it to a model. Board, forge and VCS steps name the
port verb, never a vendor CLI. Statuses, lanes, sizes, the needs-human hold, sub-issues, release
and Shipped semantics stay as in walletmate.

## 6. The self-improvement loop

Inspired by the "software factory that improves itself" model: visibility into every run, scored
runs, a loop that proposes fixes to the factory itself, and benchmarks built from the project's own
past tasks to compare cost and quality across models and factory versions.

1. **Ledger.** Every subagent run the cycle starts is one row in the heartbeat's `runs`: skill,
   skill version (content hash), ticket, tier, model, executor, tokens, cost, minutes, outcome,
   `score` (the done-conditions scorer), `scores` (one entry per scorer), and `trace` (a reference
   into `traces.uri` when the executor stored its full transcript).
2. **Scorers.** A scorer is a file `.agents/scorers/<name>.md` in the factory definition:
   frontmatter `name`, `applies_to` (skills, or `*`), `tier`, `scale` (`pass-fail` or `0-4`), and a
   body that is the rubric question (for example "Did the run write a test that duplicates an
   existing one?"). The package ships `done-conditions` (the 0–4 score), `redundant-tests`,
   `scope-creep`, `spec-adherence` and `over-engineering`. Adding, changing or deleting a scorer is
   a `guardrail` change.
3. **Judge.** `judge-run` runs every scorer that applies to a finished run, on
   `learning.judge_tier`, never the run's own model. A scorer reads the trace when one exists, and
   the diff, ticket and CR. Hard facts beat the judge: a send-back, a red verify, a reopened ticket
   or an escape caps `score`. A **human grade** wins over both: a comment
   `agentic-sdlc:grade <run-id> <scorer> <value>` by `owners.product` or `owners.factory` is a
   rescore, and humans may grade a sample to calibrate the judge.
4. **Improve.** Every `learning.every_cycles` cycles, `improve-factory` reads the ledger and the
   measures, clusters failures by scorer and by normalised error ("redundant-tests failed 37 times
   across 21 tickets"), takes the worst cluster (at least `learning.min_evidence_runs` runs), and
   proposes **one** factory change: a skill sentence, a binding value (tier, cycle number), or a
   gate. A rule enters a skill only after the same mistake appears twice.
4. **Prove.** The change runs on the bench against the current factory. It must not lower the
   bench score and must not raise cost by more than its gain. Proof goes in the factory CR.
5. **Merge.** Class `tuning` (the `models` tier mapping, a skill's `tier`, wording that adds no rule) auto-merges
   when the bench and `skill-regression` are green and the class is in
   `learning.auto_merge_classes`. Class `guardrail` (escalation triggers, lane areas, gates,
   required checks, non-negotiables, deleting any rule) always waits for `owners.factory`.
6. **Bench.** `bench build` turns merged tickets into cases: the ticket and spec, the merge base,
   and the CR's own new proofs as the hidden oracle. Cases belong to **suites**
   (`.agents/bench/suites/<suite>.json`, committed with the factory): `bench build --suite <name>
   [--paths <glob>]… [--per-size <n>]` picks a stratified set by Size (small, medium, hard) and
   touched area; `bench propose --suite <name>` asks the factory to nominate representative past
   tickets, which a factory CR adds. `bench run --suite <s> (--model <id> | --executor <e>)
   [--factory <rev>]` replays cases in fresh workdirs outside the root, runs the oracle and the
   suite's scorers, and records pass rate, scorer results, cost and minutes per case.
   `bench report --suite <s>` prints, per model or executor, quality against cost and marks the
   Pareto front. The front drives the `models` tier mapping, a `tuning` change.
7. **Measures.** The heartbeat and `ledger summary` report: automation rate (Done tickets with no
   `needs-human` hold and no human commit), the four DORA measures (deployment frequency to the
   last environment, lead time, change failure rate, time to restore), cycle time, first-pass rate,
   cost per merged CR, cost per delivered ticket, and the share of spend that went to scoring and
   bench.
8. **Budget.** Learning, scoring and bench spend stay under `learning.budget_usd_per_week`; over
   budget the loop reports and stops.

## 7. Executors: who runs each stage

The cycle orchestrator routes a ticket to a skill. The binding's `executors` says **who** runs
that skill. The default is the harness's own subagent. A project can give any skill to a managed
agent or a custom bot that has that skill installed.

```yaml
executors:
  default: { kind: harness }                      # a subagent of the running harness, model by the skill's tier
  implement-spec: { kind: assign, user: copilot-swe-agent }       # a hosted coding agent picked up by assignment
  review-pr: { kind: webhook, url_env: REVIEW_BOT_URL, token_env: REVIEW_BOT_TOKEN }
  release: { kind: command, run: "my-release-bot --ticket {ticket} --skill {skill}" }
  triage-signal: { kind: managed, api: claude, agent_env: TRIAGE_AGENT_ID, environment_env: TRIAGE_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY }
```

| Kind | Start | Result comes back by |
|---|---|---|
| `harness` | A subagent loads `skills/<skill>/SKILL.md`. | The subagent's own board and forge writes. |
| `command` | The CLI runs `run` with `{skill} {ticket} {cr} {workdir} {prompt_file}` filled in. | Exit code plus the bot's board and forge writes. |
| `webhook` | The CLI POSTs `{ skill, ticket, cr, binding_ref, callback }` to the URL. | The bot's board and forge writes; the next cycle reads them. |
| `managed` | The CLI starts a run on a managed-agent API, shaped by `api`: `claude` (Managed Agents `POST /v1/sessions`), `cursor` (Cloud Agents `POST /v1/agents`), `antigravity` (Gemini Interactions), or `generic` (`POST <endpoint>/sessions`). | Same. The run id goes in the ledger row. |
| `assign` | The CLI assigns the ticket (or CR) to the bot user and adds the skill name as a comment. | Same. |

Every executor entry may also declare the rest of the stage's agent definition:

```yaml
  implement-spec:
    kind: managed
    agent_env: IMPL_AGENT_ID
    token_env: AGENT_API_TOKEN
    endpoint_env: AGENT_API_URL
    mcps: [board, docs]          # names from the binding's `mcps` map; the stage gets only these
    secrets: [NPM_TOKEN]         # env var names the stage may receive; nothing else is passed
    sandbox: cloud               # cloud | container | local; unattended cycles refuse `local`
    model: { tier: balanced }    # or { id: <model id> } to pin one
```

`mcps` at the binding's top level maps a name to a server (`{ url | command, token_env? }`). The
stage's prompt is its skill. Secrets reach an executor only when listed, and never through a board
or CR comment.

`agentic-sdlc dispatch <skill> --ticket <id> [--cr <n>]` starts the executor and prints
`{ kind, ref, startedAt }`. For `harness` it prints the instruction for the orchestrator and
starts nothing. Every executor obeys the same skill and the same gates: tracker truth is the only
hand-off, and the reviewer executor is never the implementer executor of the same CR. The ledger
row records `executor` and `ref`, so the bench and `improve-factory` compare executors as they
compare models. Moving a skill to another executor is a `guardrail` change.

## 8. Any product type

Nothing in the skills assumes a web app or a code product. The binding states what "verify" and
"shipped" mean for this product:

```yaml
product:
  kind: service | web | mobile | desktop | library | data | ml | infra | firmware | docs | other
  environments: [staging, production]   # ordered; the last is where users get value. A library: [prerelease, registry]. Mobile: [internal, beta, store]. Docs: [preview, live]
  proofs: [test, eval, visual, data-check, computer-use, manual]  # kinds a criterion may name; `manual` always escalates for a human check
```

- **Computer-use verification.** A criterion with proof `computer-use` is proved by the
  `verify-ux` stage: an agent drives the built product in the first environment (or a preview) as
  a user would, and attaches evidence (steps, screenshots or a recording, the observed result) to
  the CR. `review-pr` dispatches it and grades the evidence like any other proof. Its executor is
  set like any stage, so a project can give it to a dedicated computer-use bot.

## 9. Intake and data ownership

- **Intake.** Work enters through the tools the team already uses. Any tool that creates a board
  item at Signals with a `signal:<stream>` label is an intake: a chat bot, the tracker's own form, a
  CR comment command, a monitoring alert. The factory needs no intake of its own.
- **Data ownership.** The board, the repo and `traces.uri` hold every fact, score and trace. The
  binding names the inference endpoints (`models` may point at any provider or self-hosted model)
  and where each stage runs (`sandbox`). Nothing leaves the project's own systems except calls to
  the providers the binding names.

```yaml
traces:
  uri: "s3://my-bucket/agentic/{run_id}.jsonl"   # optional; or a path under the repo's runtime dir; executors write, scorers read
```

- Shipped options are derived: `Not shipped`, `On <env>` per environment, and `In release` before
  the last one. The `shipped` gate takes any environment name.
- A criterion names its proof kind. `commands.verify` must run every non-manual kind.
- The bench oracle is the merged change's own new proofs (tests, eval cases, data checks), not only
  unit tests.
- Release lines, versions and the rollback command stay; a product with no deploy uses its
  publish step as the last environment.

## 10. Runtimes and profiles: no dependency on one machine

The factory needs no developer machine. Any scheduler that can start an agent with the repo and
network access runs one cycle with the prompt "Load the sdlc skill and run one cycle."

| Runtime | How it reaches the ports |
|---|---|
| Agent with a shell (Claude Code routine or scheduled task, Codex cloud task, Cursor background agent, Antigravity agent, CI cron with a headless agent CLI) | `npx agentic-sdlc <group> <verb>` |
| Agent with MCP but no shell | `agentic-sdlc mcp` exposes every port verb as an MCP tool (stdio; `--http` for a hosted endpoint with a bearer token) |
| Agent with only vendor MCP tools (for example a chat bot with a GitHub or Jira connector) | the vendor tools that `board.mcp` / `forge.mcp` map to the port verbs; gates still run in CI |

Gates always run in the forge's CI, so trunk guarantees never depend on the runtime.

`profile` in the binding picks the defaults:

| | `individual` (subscriptions only) | `enterprise` (APIs and managed agents) |
|---|---|---|
| Scheduler | The subscription's own scheduler (Claude scheduled tasks/routines, Codex cloud tasks, Cursor background agents, Grok tasks) or CI cron with a subscription-authenticated headless CLI | Any of those, plus a managed-agent platform or the org's job runner |
| Executors | `harness` only; `command` for a local headless CLI logged in with the subscription | All kinds: `managed`, `webhook`, `assign`, `command`, `harness` |
| Review identity | A second account or a fine-grained token for the reviewer | A forge app or bot account with its own token |
| Traces | None, or files in the runner's scratch dir | `traces.uri` on the org's storage |
| Bench | Small suites, run by `agent_command` with a subscription CLI, inside the weekly budget | Full suites across models and executors |
| MCP | stdio `agentic-sdlc mcp` inside the session | stdio, or a hosted `--http` endpoint for bots |

`init --profile individual|enterprise` writes these defaults. `validate` warns when an
`individual` binding names an executor kind that needs an API key.

**Two runtimes, two identities.** With `forge.review_runtime: separate` (the default), every
scheduler runs two jobs: the cycle (`templates/runner/cycle-prompt.md`), which never holds the
review token, and the review (`templates/runner/review-prompt.md`), which holds
`forge.options.review_token_env` and runs only `review-pr`. So an implementer can never post the
`review` status or the approving review for its own CR. `same` is allowed only with a warning.
Unattended jobs set `AGENTIC_SDLC_UNATTENDED=1`; `dispatch` then refuses a stage whose sandbox is
`local` or unset.
