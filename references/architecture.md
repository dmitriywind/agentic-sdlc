# agentic-sdlc architecture (the contract)

Status: normative. Every part of the package is built against this file; a change here changes the
parts in the same CR. It holds mechanism only: process rules live in `skills/` (the words, roles, trust
and waits in `skills/sdlc/references/contract.md`), cloud platform facts in
`templates/runner/claude-routine.md`.

## 1. What the package is

A software factory a project installs: a skill pack, a binding and a CLI of ports and gates.

| Layer | Home | Holds |
|---|---|---|
| Process | `skills/` (the Claude Code plugin, or a copy under `.agents/skills/`) | Every process rule. Generic. No project value. |
| Binding | `.agents/binding.yml` in the project | Every project value. |
| Ports | `src/`, the `agentic-sdlc` CLI and MCP server | Board, forge and VCS adapters, gates, dispatch, the run ledger, the bench. Mechanism only. |

Claude Code on a Claude subscription is the one agent runtime: it runs the loop by loading the `sdlc`
skill. The package ships no supervisor and no agent runner; the one exception is `bench run`, which
starts `agent_command` headless on a past task. Delivery is trunk-based on Git: one trunk, short-lived
change lines in, release lines out (release-line delivery only). No develop branch, no hotfix line.

## 2. Repository layout

```
.claude-plugin/          plugin.json (skills, hooks, MCP server) and marketplace.json (this repo as a one-plugin marketplace)
agents/                  plugin subagents: sdlc-fast, sdlc-balanced, sdlc-deep, sdlc-reviewer
bin/agentic-sdlc         plugin shim on the Bash PATH: the project's .agents/bin/agentic-sdlc, else its node_modules build, else dist/bin.js
evals/                   skill-triggering evals for `claude plugin eval`
hooks/                   hooks.json, guard.mjs (PreToolUse), session-start.mjs (SessionStart), mcp.mjs (the plugin's MCP launcher)
skills/                  seven phase skills and setup (section 5)
  sdlc/                  the navigator; routes.yml (read by `next`, section 11.3); references/contract.md, statuses.md, board.md
  plan/ build/ review/ ship/ learn/ escalate/ setup/
scorers/                 scorer rubrics, copied to .agents/scorers/
templates/
  binding.yml            every key init writes; unresolved values marked (section 4)
  gates/github/          the workflows, the issue form, the PR template, the trunk and release rulesets
  gates/hooks/pre-push
  bin/agentic-sdlc       the launcher init installs at .agents/bin/
  mcp/                   the .mcp.json entry `init --no-plugin` writes
  runner/                scheduler templates, cycle and review prompts, setup.sh
src/
  bin.ts cli.ts          entry and dispatch            exec.ts     the one process and HTTP helper (injectable)
  ports.ts               port types                    binding.ts  load and validate the binding
  install.ts             init, validate, doctor        status.ts   status (section 10)
  board/                 github-issues.ts local.ts index.ts
  forge/                 github.ts flow.ts util.ts index.ts
  vcs/                   git.ts index.ts
  gates.ts               the gates                     comments.ts the comment kinds (section 11.1)
  skills.ts              the skill pack reader         pristine.ts unedited package files (init --upgrade)
  dispatch.ts            start a step on its executor  next.ts     the cycle's work (section 11.3)
  ledger.ts              heartbeats, scores, measures  bench.ts    bench cases and runs
  mcp.ts                 the verbs as MCP tools
scripts/                 guide.mjs (docs/guide.html), known-hashes.mjs (templates/known-hashes.json), prune-features.mjs
docs/                    the guide and the roadmap; never normative
features/                the behaviour as executable Gherkin features on node:test; fake exec, no network
```

## 3. Ports

A skill never calls a vendor CLI or `git` for a board, forge or VCS step: it calls the verb below or
its MCP tool, and the binding picks the adapter. Every verb prints JSON on stdout and exits 0 on
success, 1 on a refused or failed action (message on stderr), 2 on a usage error. Ids are strings.
A verb takes only the flags it lists: an unknown flag, a value flag with no value or an unreadable
`--body-file` is a usage error; `--k=v` equals `--k v`.

Retries: an HTTP adapter retries 429 and 5xx with backoff (3 tries, honouring `Retry-After`); a POST
retries only 429, since a 5xx may follow a write. The `gh` adapters retry a read (`gh api` GET, `view`,
`list`) on 429, a 403 that names a rate limit, and 5xx, and a write only on 429 and rate limits; they
wait the `Retry-After` hint `gh` prints, else 1s then 2s. Credentials come only from env vars the
binding names, never from a file in the repo.

### 3.1 Board (`agentic-sdlc board <verb>`)

| Verb | Effect | Output |
|---|---|---|
| `list [--status <s>]… [--label <l>] [--search <text>] [--state all]` | Open items without `body`; `--state all` adds closed ones (Done, Cancelled) for `gate shipped`, `ledger measures` and `bench`; `--search` matches title and body words | `Item[]` |
| `get <id>` | One item with its fields and comment count | `Item` |
| `create --title <t> --body-file <f> --status <s> [--label <l>]… [--parent <id>] [--milestone <m>]` | New ticket | `Item` |
| `move <id> <status> [--only-from <s>]` | Set Status; with `--only-from`, refuse unless the item is still there | `Item` |
| `set <id> <field> <value>` / `set <id> <field> --clear` | Set or clear a logical field | `Item` |
| `label <id> add\|remove <label>` | Add or remove a label. Refuses to add `forge.approval_label` | `Item` |
| `assign <id> <user\|--none>` | Set or clear the assignee | `Item` |
| `milestone <id> <name>` / `milestone <id> --clear` | Set or clear the milestone (`github-issues`: it must exist) | `Item` |
| `comment <id> --body-file <f> [--kind <kind> [--ref <value>]]` | Comment; `--kind` stamps its marker (section 11.1) | `{ id, url }` |
| `comments <id> [--last <n>] [--kind <kind>] [--marker <text>] [--author <a>]… [--trusted]` | Newest first; `--last` counts after the filters. `--trusted` is `--author` for every `owners.bots` entry and every owner role | `Comment[]` |
| `close <id> --reason completed\|not_planned` | Close and move to Done or Cancelled | `Item` |
| `child <parent> <child>` | Link a sub-issue | `Item` |
| `hold <id> --kind <trigger> --body-file <f>` | Add `board.labels.human` and post the `ask` for the `escalate` trigger (lower case) | `Item` |
| `holds` | Held tickets. A reply is a comment after the last ask by an owner role, never by an `owners.bots`-only account; an account in both counts when its comment has no factory marker | `[{ id, kind, askedAt, replied, reply? }]` |
| `release <id>` | Remove `board.labels.human`; the Status stays | `Item` |
| `bootstrap` | Idempotent: create every label the binding names (`board.labels`, `board.env_labels`, `signal:<stream>` per `board.signal_streams`, `forge.approval_label`; on `github-issues` the `status:`, size and priority labels no field id replaces) and, while `heartbeat.ticket` is unset or unresolved, the heartbeat ticket, found again by its title `agentic-sdlc heartbeat` (`github-issues`: an open issue with no status label; `local`: status Cancelled) | `{ labels: { created }, heartbeat: { id, created } \| null }` |

`Item = { id, title, url, status, kind?, labels[], fields, milestone?, parent?, children[], assignees[],
createdAt, updatedAt, statusChangedAt? }`. Logical fields: `size`, `priority`, `lane`, `shipped`,
`release_version`; `board.fields` maps each to the tracker's name. `statusChangedAt` is when the ticket
entered its status; `github-issues` sets it to `closed_at` for a closed issue at Done only. `list` does
not read sub-issues (`children` is empty there); `get` does.

Adapters:

- `github-issues` (default): the repo's issues through `gh api repos/{owner}/{repo}/…`, REST only, so a
  Claude cloud session reaches it. Status and each field are labels `<name>:<value>` (`status:Ready`,
  `size:S`); `board.options.field_ids` maps them to organization issue fields instead (`doctor` checks the
  ids and options). An issue without a status label is off the board, except an open one with a
  `signal:<stream>` label, which reads as status `Signals`. `create` and every label write create missing
  labels; `close` closes the issue with its state reason. GitHub has no compare-and-swap: `--only-from`
  reads, then writes. Option `repo`.
- `local`: `.agents/board.json`, for tests and trying it out.

### 3.2 Forge (`agentic-sdlc forge <verb>`): GitHub

| Verb | Effect | Output |
|---|---|---|
| `open --source <b> --title <t> --body-file <f> [--draft]` | Open a CR into the trunk | `CR` |
| `view <n>` / `view --sha <sha>` | One CR; by sha, the CR whose merge commit it is | `CR` |
| `diff <n>` | Unified diff | text |
| `list [--state open\|merged\|all] [--limit <n>] [--since <iso>] [--checks]` | Newest update first; merged ones carry `mergeSha`. Without `--checks` each CR has `checks: []`, `behind` false and no `pushedAt` | `CR[]` |
| `ready <n>` / `draft <n>` | Leave or return to draft | `CR` |
| `sync <n>` | Bring the source up to the trunk tip | `CR` |
| `automerge <n>` | Arm auto-merge (low level; steps use `land`) | `CR` |
| `verdict <n> --pass\|--fail --body-file <f>` | Stamp the `verdict` marker for the head and the one `Verdict:` line, post the report; with a review identity also the review status and, on pass, the approving review (section 10) | `{ verdict, comment, status: 'posted'\|'ci' }` |
| `land <n> [--wait <minutes>]` | Wait, bounded (default `cycle.land_wait_minutes`, 5 when unset), until every `forge.required_checks` entry is green on the head, then arm auto-merge, or merge where the forge cannot arm it. Never merges a draft. A wait on a human approval is `blocked` with `needsHuman` | `{ state: merged\|armed\|waiting\|blocked, blocking: [{ check, state }], needsHuman?: { class, who } }` |
| `queue` | Every open CR with its one next action (below) | `[{ n, ticket?, class, action, reason, reworks, since?, held, release?: true }]` |
| `comment <n> --body-file <f> [--kind <kind> [--ref <value>]]` | CR comment | `{ id, url }` |
| `comments <n> [--last <k>] [--kind <kind>] [--marker <text>] [--author <a>]… [--trusted]` | As `board comments`; system notes dropped | `Comment[]` |
| `status <sha> --context <c> --state pending\|success\|failure --description <d> [--url <u>]` | Commit status with `options.review_token_env`, or with one identity the implementer's token. Refuses the contexts the gates own: `human-approval`, `ticket-linkage`, `proofs-on-base`, `agent-provenance` | `{}` |
| `approve <n>` | Approving review as `review_identity`. Refused with one identity | `{}` |
| `approvals <n>` | The CR's reviews | `{ user, state, sha }[]` |
| `runs [--ref <r>] [--failed]` | The newest 30 CI runs | `Run[]` |
| `run <id>` | One CI run; a missing one exits 1 | `Run` |
| `whoami` | The login the forge acts as (`gh api user`; where refused, the repo owner with `loginFrom: repo-owner`), the repo and its default branch when readable | `{ login, loginFrom, repo?, defaultBranch? }` |
| `cut <revision> <version>` | Start `agentic-sdlc-release.yml` (Environment `agentic-release`, which the Product owner approves); returns the run this dispatch created | `{ requested, run?, url? }` |

`queue`: `ticket` is the one id the CR closes (none for a factory or dependency CR), `class` the
approval class, `held` whether the ticket has `board.labels.human`, `release: true` on a held ticket
whose CR is `land` with `human-approval` green under a class that needs a human (the forge approval
answers the ask). `reworks` counts trusted fail verdicts and trusted `note`s. The review check and
`human-approval` never count as red, pending or missing here. The first match wins:

| Action | When |
|---|---|
| `escalate` | `reworks` reached `cycle.max_rework` (3 when unset) and another rework is due, or a required check other than review and `human-approval` is pending or missing longer than `stall_minutes` after `pushedAt` (no `pushedAt`: the clock has not started) |
| `rework` | a trusted fail verdict on the head, or a red required check; `wait` instead while the newest trusted `note` for the head names an open Signal (`--ref <head sha> <Signal id>`, else `Signal <id>` in the text) |
| `review` | no trusted verdict for the head |
| `sync` | a ready CR behind the trunk |
| `land` | a pass verdict on the head, the CR ready and open |
| `wait` | anything else |

`CR = { n, url, title, source, target, headSha, baseSha, mergeSha?, draft, state, behind, closes[], checks:
{ name, state }[], body, author, pushedAt? }`. `closes` is exactly the body lines `Closes <id>`. `pushedAt`
is the creation time of the first check suite on the head; stall clocks start there.

Port methods with no CLI verb: `commits(n)` (gate `provenance`; every commit oldest first, throws when
the list may be cut off at 250, so the gate fails closed); `closing(id)` (the merged CRs whose body
closes the ticket, by search; the index can trail a merge, so a miss also reads `list --state merged`);
`labelEvents(n)` and `unlabel(n, label)` (gate `approval` only; a forge without them has no label
approval); `whoami?()`.

Adapter `github` (`gh`), the one forge: on other forges a CR can change the pipeline file that runs
its own gates. Every verb but `closing` calls REST under `repos/{owner}/{repo}/…`, since a Claude cloud
session's proxy refuses GraphQL and every other path; `closing` uses `search/issues` and runs in CI.
With `CLAUDE_CODE_REMOTE=true`, `ready`, `draft` and `automerge` use the proxy's `pulls/{n}/ccr/…` routes,
and an unset `options.token_env` variable falls back to the proxy's token (`review_token_env` never
does); elsewhere an unset token fails. A repo that refuses draft PRs (private on GitHub Free) gets a ready
PR with the `draft` label, which `ready` removes and `draft` adds. Where GitHub refuses auto-merge (no
ruleset or branch protection), `automerge` merges (squash) only a non-draft CR with every required check
green on its head.

### 3.3 VCS (`agentic-sdlc vcs <verb>`): Git

| Verb | Effect |
|---|---|
| `start <name>` → `{ workdir, ref }` | Refuse a name that fits neither `vcs.change_pattern` nor `vcs.factory_change_pattern`; fetch; reuse the line's worktree or branch, else a worktree and branch from the trunk tip |
| `head` → `{ ref, sha }` | `HEAD` |
| `changed [--since <rev>]` → `string[]` | Files changed against the merge base |
| `base` → `{ sha }` | Merge base with the trunk |
| `push` → `{ ref, sha }` | Push the current branch; refuse the trunk and a detached HEAD |
| `cut <rev> <release>` | Push `<rev>` to `refs/heads/<release_prefix><release>` |
| `tag <name> <rev>` | Annotated tag (gates only) |
| `tags [--prefix <p>]` → `{ name, sha }[]` | Newest first |
| `drop <name>` | Remove the worktree and its branch (bench only) |
| `checkout-tests <rev> <paths…>` | Product code at `<rev>`, the proof paths kept (gate `proofs-on-base`) |

`snapshot(rev)` (API only) makes a detached worktree outside the root for the bench.

### 3.4 Gates (`agentic-sdlc gate <name>`): run by CI, never by agents

| Gate | Guarantee |
|---|---|
| `branch-names` | Refuses a change line outside the binding's patterns, the `dependabot/` and `renovate/` lines, and the trunk. |
| `linkage` | Status `ticket-linkage`: a product CR closes exactly one open ticket and names it in its source. |
| `proofs-on-base --cr <n>` | In the no-secrets job: runs the CR's new or changed proof files (`commands.proofs_on_base`, once per file) on the merge base's product code; status `proofs-on-base` passes when each fails there, or when the CR changes only `paths.no_proof`. Without the command it fails closed. |
| `approval --cr <n> [--pushed]` | Classifies the CR and posts `human-approval` by the rules of section 11.4. `--pushed` (CI on a push) first removes `forge.approval_label`. |
| `review --cr <n>` | One identity only: status `review` from the newest `verdict` comment for the head by a trusted author: success on `Verdict: PASS`, failure on `REMEDIATION REQUIRED`, pending with none. With two identities it does nothing. |
| `merged --sha <sha>` | On a trunk push: the CR merged at `<sha>` moves its one ticket to Done (`--only-from` its status) and sets Shipped `Not shipped` when empty; Done drops the human label; a Cancelled ticket stays. Only this gate and `shipped` move a ticket. |
| `shipped <env> --sha <sha> --result success\|failure\|rolled-back [--version <v>]` | Done or In review tickets whose merge is an ancestor of `<sha>` get `On <env>` (In review moves to Done first); `--version` fills an empty Release Version, and the last environment tags it. `rolled-back`: tickets On `<env>` or later whose merges are not in `<sha>` step back one environment. A failure in the last environment returns the version in flight to the previous environment, clears the version and opens a held Signal. Unknown ancestry changes nothing; Shipped never goes down on overlapping runs. |
| `evidence --sha <sha>` | Runs `commands.evidence_check` for `<sha>` when `product.evidence` is set (fails when the command is unset); passes when the list is empty. |
| `provenance --cr <n>` | Off unless `forge.provenance` is `warn` or `require`. Reads the commits through the forge (no CR code runs), posts `agent-provenance`. A commit whose author or committer is in `owners.bots` needs one well-formed `Agent-Run` and `Agent-Model` trailer each in its last paragraph; other commits are `human`; a merge committed by the forge's web identity (GitHub `web-flow`, by login, never by email) is `merge`; other merges are checked like a commit. `warn` always passes; `require` fails on a missing trailer or an unreadable commit. A squash drops the trailers, so the status is the record. With `require`, add the check to `forge.required_checks` and the ruleset (`validate` warns). |
| `signal --source <name> --title <text> [--body <text>]` | Files a Signal once, keyed by source and title (case and spacing aside): an open issue with `signal:<source>` and that title gets the body as a comment, else a new Signal with that label. Text is redacted. |
| `signal-on-red --run <id>` | A red trunk or release-line run files `signal` (source `ci`, title `CI red: <workflow> @ <ref>`), so a red trunk is one open Signal and each later red run comments on it. Other refs are ignored; a missing run fails. |
| `skill-regression` | A change under `paths.factory` keeps the pack valid: frontmatter, steps and files, links, forbidden words (section 5), every CLI call a skill names (the verb and each `--flag` exist, a `dispatch` names a step), scorers' `applies_to`. |

Checks and workflows (`templates/gates/github/`, installed by `init`):

- `agentic-sdlc-verify.yml`: the `Required` job on `pull_request`, no secrets: `commands.install`, then
  `commands.verify` on the CR head; `proofs-on-base` in its own no-secrets job (where it cannot post the
  status, its exit code is the check). It and the CR workflow also run on `merge_group`.
- `agentic-sdlc-cr.yml`: the other gates on `pull_request_target` with the base branch checked out; the CR
  head is fetched as objects, never run. It reruns `approval` on `labeled`, `unlabeled` and review events,
  and on a push runs it with `--pushed`. `agentic-sdlc-review-event.yml` (no secrets) relays review
  events to it; a fork PR's review event has no PR number and updates on the next PR event.
- `agentic-sdlc-delivery.yml`: a trunk push runs `merged`; the deploy runs named in
  `forge.deploy_workflows` run `shipped`; a red `forge.ci_workflow` run runs `signal-on-red`. No
  concurrency group, since one drops pending runs.
- `agentic-sdlc-release.yml`: `forge cut` (release-line only).
- `agentic-sdlc-dead-man.yml`: `ledger stale --max-hours <h>` on a schedule; on failure `gate signal
  --source factory`.
- `agentic-sdlc-signal.yml`: a `repository_dispatch` of type `signal` passes `client_payload.source`,
  `title` and `body` through env vars to `gate signal`. The issue form `.github/ISSUE_TEMPLATE/signal.yml`
  applies `signal:owner` and `status:Signals`, which must exist (`board bootstrap` creates them).
- Required checks: `ticket-linkage`, `Required`, `proofs-on-base`, `review`, `human-approval`,
  `skill-regression`; `agent-provenance` with `require`. `ruleset.trunk.json` pins them to their source app
  (`integration_id`); `doctor` warns when one is not pinned or the trunk has no enforced protection. No
  CODEOWNERS: the `approval` gate enforces owners by class. Actions are pinned by commit SHA; `doctor`
  warns on an installed `uses:` that is not.

CI loads the binding from the target branch, never from the CR, and never runs CR code with secrets.
A job that holds a secret checks out the base ref, so its launcher and pin are the trunk's.

## 4. The binding (`.agents/binding.yml`)

[`templates/binding.yml`](../templates/binding.yml) holds every key `init` writes and names the
optional ones per group; this section and `validate` hold their meaning.

**Unresolved values.** A value `init` cannot know is the string `unresolved: <hint>` (owners,
`vcs.trunk` unless `origin/HEAD` names it, `commands.*`, `forge.ci_workflow`, `forge.deploy_workflows`,
`heartbeat.ticket` unless the board is `local`, `forge.review_identity` for `organization`).
`validate` fails on each (`<key> is unresolved: <hint>`); `validate --json` prints `{ ok, problems,
warnings, unresolved: [{ key, hint }] }`, exit 1 while a problem is left. `init` writes no unresolved
value into a generated file (it uses the default until `init --upgrade` reruns), leaves out each
`paths.*` file key whose file is missing, and `init` and `validate` print an `info:` line naming template
keys the binding lacks.

Keys:

- `version` (2), `profile: individual | organization` (`organization` requires `forge.review_identity`).
- `owners.product`, `owners.factory`, `owners.bots`; optional `owners.operator`, `owners.security`,
  `owners.compliance`. Each entry is a login or `{ board, forge }`; `product` and `factory` (and the
  optional roles) take a list, whose first entry is the primary. Board reads (ledger, dispatch, `board
  comments --trusted`) use `board`; forge reads (`approval`, `forge comments --trusted`) use `forge`. An
  unknown key is a warning; `forge.review_identity` must not be an owner.
- `board`: `adapter`, `options` (`repo`, `field_ids`), `statuses`, `fields`, `labels` (`human`, `bug`,
  `feature`, `release`), `env_labels`, `done_statuses`, `signal_streams`, optional `later_milestone` and
  `scope: { label, home, repos }` (section 10).
- `forge`: `adapter`, `options` (`repo`, `token_env`, `review_token_env`), `review_identity` (empty: one
  identity), `human_approval: full-lane | always | never` (default `full-lane`), `approval_label` (default
  `approved`; empty fails), `provenance: off | warn | require` (default `off`), `review_check_name`,
  `verify_check_name`, `required_checks`, `planned_checks` (wanted checks not yet supplied; `review/review`
  names each absent one), `ci_workflow`, `deploy_workflows` (at most two: first and last environment).
  `review_token_env` is set exactly when `review_identity` is, and never equals `token_env`. The workflow
  names reach a shell line, so `validate` takes only letters, digits, spaces and `. & ( ) + , / : # - _`.
  `validate` warns when `human_approval` is not `never` and every `owners.product` account is also a bot.
- `vcs`: `adapter`, `trunk`, `change_pattern`, `factory_change_pattern`, `release_prefix` (ends in `/`),
  `tag_prefix` (a string), `version_scheme: calver | semver`. `trunk`, `release_prefix` and
  `factory_change_pattern` must be non-empty.
- `product`: `environments` (ordered; the last is where users get value), `delivery: continuous |
  release-line` (`init` writes `continuous`; a binding without the key is `release-line`), `evidence:
  [sbom | provenance | signature]`, `proofs`, optional `slo: { change_failure_rate_max (0..1), window_days
  (> 0) }`.
- `executors`, `mcps`, `traces.uri` (must hold `{run_id}`), `agent_command` (section 7); `models: { fast,
  balanced, deep }`, the one home of the model choice.
- `commands`: `install`, `fast_check`, `verify`, `proofs_on_base` (with `{files}`); optional `setup`,
  `preview` (deploys a CR head for `review/verify`), `rollback`, `evidence_check` (with `{sha}`).
- `paths`: `guiding_narrative`, `roadmap_doc`, `importance_doc`, `glossary`, `review_checklist`,
  `test_standard`, `security_policy`, `pr_template`, `sources_before_question`, `factory` (a change only
  there is a factory change: no ticket, `vcs.factory_change_pattern`, checked by `skill-regression`),
  `lane_areas` (force the Full lane), `no_proof` (a product CR changing only these needs no proof).
- Sizing and flow: `sizes`, `ready_size_limit`, `fast_lane_max_size`, `priorities`, `p0_setters`,
  `max_subissue_depth`, `spec_marker` (the `spec` kind's marker), `stall_minutes` (above the longest
  step run), `parallel_agents`.
- `cycle`: `max_implementations`, `min_ready`, `time_budget_minutes`, `failure_limit`, `dedupe_minutes`
  (section 7), `max_rework` (default 3), `land_wait_minutes` (default 5; 0 allowed), optional
  `max_tokens_per_ticket` (`ledger summary` marks a ticket over it `overBudget`; the cycle dispatches it
  no further).
- `heartbeat.ticket`: the ticket that holds heartbeats; `validate` fails when it is empty.
- `learning`: `enabled` (default `false`), `every_cycles`, `min_evidence_runs`, `bench_size`,
  `bench_min_cases` (default 20), `bench_trials` (default 3), `bench_budget: { max_runs, max_minutes }`,
  `auto_merge_classes` (`[]` until a bench baseline exists), `judge_tier` (section 6).

## 5. Skills

Seven skills, one per phase: `sdlc` (the navigator), `plan`, `build`, `review`, `ship`, `learn`,
`escalate`; and `setup`, which no route dispatches: it installs or repairs the factory and answers from
`status`. A step is the unit that runs, named `<skill>/<step>`; a one-step skill is named by the skill.
`dispatch`, the ledger, the bench, a scorer's `applies_to`, the `executors` keys and the `Agent-Skill`
trailer all name a run this way.

- **Frontmatter**: `name`, `description` (a trigger sentence starting "Use when", never a summary of
  the workflow), and `metadata.steps: { <step>: { tier } }` (each step in `steps/<step>.md`) or
  `metadata.tier` (the body is the step). `tier` is `fast`, `balanced` or `deep`. `disable-model-invocation:
  true` marks `ship` and `learn`; `user-invocable: false` marks `plan`, `build`, `review`, `escalate`;
  the evals `internal-skills-not-direct` and `release-not-model-invoked` check both lists.
- **Body**: a multi-step SKILL.md is a table of its steps and their common rules. A step points to the
  contract, lists numbered steps each ending on a checkable **Done when**, then Rules.
- **Routes** are data in `skills/sdlc/routes.yml` (section 11.3); no skill restates one.
- **Forbidden content**: a skill names only `agentic-sdlc <group> <verb>` calls and binding keys; never a
  vendor, harness, runtime, identity setup, review token, vendor CLI, HTTP status, hard-coded check name,
  law or standard, or marker string. `skill-regression` enforces the list.
- **Names**: under the plugin `agentic-sdlc:<name>`; a copy (`.agents/skills`, `.claude/skills`) is
  `sdlc-<name>` (`sdlc` stays `sdlc`). Skills refer to each other by name, so a copy keeps every link.

## 6. The self-improvement loop

Off unless `learning.enabled`; the bench needs `agent_command`.

1. **Ledger.** Every run is a row in a heartbeat's `runs` (section 11.2). `ledger runs [--since <days>]
   [--skill <s>]` lists them; `ledger summary [--since <days>]` adds `learning: { due, judge, cyclesSince }`
   (false unless enabled), so no skill keeps a counter. `ledger stale --max-hours <h>` exits 1 when the
   newest heartbeat is older. `ledger hash <skill-dir>` prints a skill's content hash.
2. **Scorers.** `.agents/scorers/<name>.md`: frontmatter `name`, `applies_to` (steps or `*`), `scale`
   (`pass-fail` or `0-4`), the rubric as body. Shipped: `done-conditions` (the 0–4 `score`),
   `redundant-tests`, `scope-creep`, `spec-adherence`, `over-engineering`, `spec-quality` (`plan/shape`),
   `triage-accuracy` (`plan/triage`). A value may be `unscorable` with a `reason`: counted per scorer and
   left out of medians, failure rates, clusters and `min_evidence_runs`. While a hard fact caps the run,
   `ledger record` refuses `unscorable` for `done-conditions` and a human grade's is ignored.
3. **Judge.** `dispatch learn/judge --run-model <m>` takes `models[learning.judge_tier]`, or the next tier
   when that is the run's model, and prints `{ skip: true }` when none is independent. `ledger plan --run
   <id>` prints the scorers, the evidence refs and the hard-fact cap (failed, timed-out or capped outcome,
   red check, send-back, bounce, reopen, escape, bench oracle red). `ledger record --run <id> --file
   <scores.json>` validates names and scales, applies the cap and posts one `scores` comment. A comment
   `agentic-sdlc:grade <run-id> <scorer> <value>` by `owners.product` or `owners.factory` wins.
4. **Improve.** When `learning.due`, `learn/improve` proposes one factory change in a draft factory CR from
   the worst failure cluster (at least `min_evidence_runs` runs over two tickets).
5. **Classes.** The `approval` gate classifies it (section 11.4); `tuning` merges on the agent review only
   when listed in `learning.auto_merge_classes`.
6. **Prove.** `bench compare <a.json> <b.json>` needs `bench_min_cases` shared cases and `bench_trials`
   trials and compares the Wilson lower bound of the pass rate; fewer is `regressed`.
7. **Bench.** `bench build --suite <name> [--paths <glob>]… [--per-size <n>]` turns merged tickets into
   cases (ticket, spec, merge base, the CR's own new proofs as the hidden oracle) in
   `.agents/bench/suites/<suite>.json`; `bench propose --suite <name>` nominates tickets. `bench run --suite
   <s> (--model <id> | --executor <e>) [--factory <rev>]` replays cases in fresh worktrees outside the root
   (`harness` and `command` executors only). `bench report --suite <s>` marks the Pareto front of pass rate
   against median minutes. `bench_budget` refuses a plan over `max_runs` (cases x trials) unless
   `--allow-over-budget` and starts no case after `max_minutes`; unrun cases are `skipped: budget`, which
   makes a result incomplete. Results carry no token count.
8. **Measures.** `ledger summary` reports runs, median score, failure rate and minutes by skill, model,
   executor and scorer, the failure clusters, and tokens and minutes per ticket (top 20, plus any over
   budget). `ledger measures [--days <n>]` (default 30) computes from the board and forge:
   `deployFrequency`, `leadTimeHours`, `changeFailureRate` (P0 bugs and Signals opened in the window plus
   `signal:deploy` Signals, over changes shipped), `timeToRestoreHours`, `reworkRate` (merged CRs with a
   trusted `REMEDIATION REQUIRED` verdict). Each carries its counts; one the data cannot give is `null`
   with a `why`. With `product.slo` it adds `errorBudget: { max, windowDays, actual, exhausted }`
   (`exhausted` also when the window has failures and nothing shipped); while exhausted, `next` applies
   `skip_when_budget_exhausted`.

## 7. Executors: who runs each step

`executors` is keyed `<skill>/<step>`, else `<skill>`, else `default`:

```yaml
executors:
  default: { kind: harness }
  ship: { kind: command, run: "my-release-bot --ticket {ticket} --skill {skill}" }
```

| Kind | Start | Result comes back by |
|---|---|---|
| `harness` | `dispatch` prints the task; the navigator runs it in a fresh context on the step's tier (`.claude/agents/sdlc-<tier>` when present, else `agentic-sdlc:sdlc-<tier>`; `review/review` always on `sdlc-reviewer`) | the worker's board and forge writes |
| `command` | the CLI runs `run` with `{skill} {ticket} {cr} {workdir} {prompt_file} {mcps_file} {model} {max_turns} {max_tokens} {max_minutes}` filled | exit code plus the bot's writes |

An entry may also set `mcps` (names from the `mcps` map; the step gets only these), `secrets` (env var
names; nothing else is passed, and never through a comment), `sandbox` (`cloud`, `container`, `local`),
`model` (`{ tier }` or `{ id }`) and the caps `max_turns`, `max_tokens`, `max_minutes` (positive
integers, inherited from `default`). `dispatch` enforces no cap: it prints them as `limits` (harness: in
the task and its instruction) or fills them into `run` (an unset cap fills as an empty quoted word) and
sets `AGENTIC_SDLC_MAX_TURNS`, `_MAX_TOKENS`, `_MAX_MINUTES` for a set cap. A run that ends on a cap is
`capped`. `review/verify` drives a preview: give it a browser in `mcps`, test credentials in `secrets`
and a `container` sandbox; it never holds the review token.

`dispatch <skill>[/<step>] [--ticket <id>] [--cr <n>] [--run <id>] [--run-model <m>] [--workdir <d>]
[--unattended]` (a ticket or CR, except `learn/improve`) prints `{ kind, ref, startedAt, key, done }`
(`harness`: also the instruction, which names the done line and key) and starts the executor. The key is
`<ticket, cr or factory>-<skill>/<step>[-<run>][-<CR head sha>]`. With `cycle.dedupe_minutes` above 0 it
posts a `dispatch` comment, and a second dispatch with the same key prints `{ skipped: true }` while that
comment is younger than the longer of `dedupe_minutes` and `stall_minutes` and the run has not finished.
A run has finished when its own `done` comment (`--kind done --ref <key>`) by a bot follows the
`dispatch` comment. The cycle's own claim (`dispatch sdlc`) goes stale after `cycle.time_budget_minutes`,
and a `kind: cycle` heartbeat by a bot after the claim also ends it. With `forge.provenance` on,
`dispatch` also prints `run` (the key, or `<ticket>-<skill>-<start time>` without dedupe), the
`Agent-Run` value and the row's `id`. With `AGENTIC_SDLC_UNATTENDED=1` it refuses a step whose sandbox
is `local` or unset, except `sandbox: local` with `AGENTIC_SDLC_LOCAL=1`.

**Where `review/review` runs.** With `forge.review_identity` empty, like any step. With it set, a
dispatch outside the review runtime (`AGENTIC_SDLC_ROLE` not `review`) starts nothing: it runs
`AGENTIC_REVIEW_FIRE_CMD` once (or relies on the runner's job dependency) and prints `{ kind: 'fire',
via }`; the cycle writes no row for it. An `executors` entry for `review/review` wins. The navigator
never branches on this.

## 8. Any product type

Nothing in the skills assumes a web app. `product.environments` names the stages and `gate shipped
<env>` takes any of them; a product with no deploy uses its publish step as the last environment.
Shipped options are derived: `Not shipped`, `On <env>` per environment, and `In release` before the last
(release-line only). `release-line` deploys the last environment from a release line the Product owner
approves (`ship`); `continuous` deploys every environment from the trunk, with no release line and no
`ship`, and the deploy records the version with `gate shipped --version`; missing evidence
(`gate evidence`) reports the last deploy as failed. A criterion names its proof kind: `commands.verify`
runs every kind except `computer-use` (driven by `review/verify` on the `commands.preview` deployment)
and `manual` (escalated for a person). The bench oracle is the merged change's own new proofs.

## 9. Intake and data ownership

- **Intake.** Anything that creates a board item at Signals with a `signal:<stream>` label is an intake:
  the issue form, a `repository_dispatch` of type `signal`, `signal-on-red`, the dead-man workflow, a
  `shipped` failure, or an issue labelled `signal:<stream>` by hand (it lists as Signals with no status
  label).
- **Data ownership.** The board, the repo and `traces.uri` hold every fact, score and trace. Nothing
  leaves the project's systems except calls to the model providers the binding names.

## 10. Runtimes, install and trust

Any scheduler that can start Claude Code with the repo and network access runs one cycle with
`templates/runner/cycle-prompt.md` (`routine.md` lists the templates; platform limits are in
`claude-routine.md`).

| Runtime | Reaches the ports through |
|---|---|
| Claude Code with a shell (interactive, a cloud routine, CI with the headless CLI) | `agentic-sdlc <group> <verb>`: the launcher `.agents/bin/agentic-sdlc`, on PATH in the plugin and the runner templates |
| Claude Code with MCP and no shell | `agentic-sdlc mcp` (stdio) |

**MCP server.** The tools are the board verbs but `bootstrap`, the forge verbs but `whoami`, the VCS
verbs but `tag` and `checkout-tests`, `dispatch`, and `ledger runs|summary|plan|record|hash|stale`. The
default list leaves out `forge_approve` and `forge_status`; `mcp --allow approve,status` adds them. It
serves both protocol eras: the `initialize` handshake (2025-11-25 down to 2024-11-05) and, for a request
whose `_meta` carries the protocol version and client capabilities, revision 2026-07-28 with no
handshake. `tools/call` checks arguments against each tool's schema.

**The CLI pin.** The CLI ships from Git only (the npm name `agentic-sdlc` is another project).
`.agents/cli.json` is `{ "package": "github:dmitriywind/agentic-sdlc", "ref": "<ref>" }`, a 40-hex sha
or a tag `v<version>` (a tag can move: `doctor` warns). `init` writes the running package's tag, or
`--ref`. `.agents/bin/agentic-sdlc` (POSIX sh) installs the ref once with `npm i --prefix
.agents/.cli/<ref> --ignore-scripts --allow-git=root --no-save --no-audit --no-fund "<package>#<ref>"`
(into a temporary folder, then renamed; npm output to stderr) and execs its `dist/bin.js`. It refuses a
ref or package that could read as an option or leave the folder, and ends with one line when node or npm
is missing or the fetch fails. Every workflow job, the pre-push hook, `runner-setup.sh` and the MCP entry
run through it. `init` adds `.cli/` and `work/` to `.agents/.gitignore`, writes nothing into
`package.json` or `.npmrc` (and prints `npm rm agentic-sdlc` when a devDependency pins it). `doctor`
checks the pin and that the launcher is executable.

**Install and upgrade.** `init [--profile individual|organization] [--harness claude] [--board
github-issues|local] [--forge github] [--vcs git] [--no-plugin] [--ref <sha|vX.Y.Z>] [--upgrade]
[--force]`. It always copies the pack to `.agents/skills` (the gates and `validate` read it), generates
`.claude/agents/sdlc-<tier>.md` from `models`, and adds an `@AGENTS.md` import to `CLAUDE.md`.
`--no-plugin` also copies the skills to `.claude/skills`, writes `.mcp.json`, writes the plugin's
`agents/sdlc-reviewer.md` to `.claude/agents/` (MCP tools `mcp__agentic-sdlc__*`, skill `sdlc-review`),
copies the scripts `hooks/hooks.json` runs to `.agents/hooks/` and merges its entries into
`.claude/settings.json` (adds what is missing, keeps every other key). `init --upgrade` treats
`.claude/skills` as `--no-plugin`, and writes only under `paths.factory`, so the result is a factory CR;
a change it would make to a root file (`AGENTS.md` block, `.mcp.json`, `CLAUDE.md` import) is printed as
`kept <file>: ...`. `init` records the sha256 of every file it copies in `.agents/install.lock.json`
(a legacy `.agents/skills.lock.json` is read once and removed). A rerun updates a file still at its
hash, keeps an edited one, writes new files and reports dropped ones as `stale`. A file with no matching
lock entry counts as edited unless it equals the package's or a released version's hash
(`templates/known-hashes.json`, written by `npm run build`; workflows compared with their binding values
normalised). `--upgrade` moves the pin unless it holds a sha `init` did not write; `--force` or `--ref`
moves it, and `--force` overwrites edited template files. No flag rewrites the binding.

**Status.** `agentic-sdlc status` (no binding needed) prints one JSON report. Without a binding:
`{ installed: false, install: "agentic-sdlc init --no-plugin" }`. With one: `{ installed, ok, problems,
unresolved, warnings, waiting, cycle, heartbeat, broken, person }`. `waiting` lists each hold (`{ kind:
hold, ticket, ask, since, replied }`) and each open, ready CR whose `human-approval` is not green under a
class that needs an approver (`{ kind: approval, cr, url, ticket?, class, who, label }`). `cycle` is
`next` in short; `heartbeat` the newest trusted heartbeat's time and age; `broken` every failed read and
`next`'s errors. `person` is the steps only the person can take (the Claude GitHub App, the cloud routine
with its prompt and triggers, the trunk ruleset, the optional GitHub connector, the approval decision
when every product owner is a bot), each `{ step, where, text?, verified }` (`null`: the CLI cannot
check it; a step verified true is left out). With binding problems it stops after `problems`,
`unresolved`, `warnings` and `person`. Exit 1 when anything is broken or invalid. It decides nothing.

**Session start.** The `SessionStart` hook prints a few lines: with a binding, that `sdlc` runs a cycle,
`setup` installs, repairs or answers what waits, and board, forge and VCS work goes through the CLI;
without one, a line offering `setup`.

**Packaging.** The plugin (`.claude-plugin/`) carries the skills, hooks, the MCP server, `agents/` and
`bin/`. Its tier agents set `model` and `effort` (fast: sonnet, low; balanced: sonnet, medium; deep:
opus, high); `sdlc-reviewer` (sonnet, medium, `maxTurns` 60) has no Edit or Write, and the guard hook
lets it run only `agentic-sdlc` in Bash, so `review/review` never runs CR code. A project's
`.claude/agents/sdlc-<tier>.md` wins when present. Headless runs pass `--permission-mode acceptEdits`,
`--allowedTools` and `--max-turns`; the cycle allows the CLI, the MCP server, `git add|commit|push` and
the npm checks and disallows `forge approve`; the review allows only the CLI and the MCP server.

**Runners.** The GitHub workflows read `runs-on` from repo variables as JSON: `AGENTIC_RUNS_ON` for jobs
that run CR or agent code, `AGENTIC_RUNS_ON_TRUSTED` for jobs that hold secrets (default
`AGENTIC_RUNS_ON`, then `"ubuntu-latest"`). `doctor` fails a self-hosted runner on a public repo and warns
when both name the same runner. Every job runs `bash`. The runner workflow
(`github-actions-claude.yml`) needs the repo variable `AGENTIC_AGENT_CLI_VERSION`, and
`runner-setup.sh` refuses to start when `ANTHROPIC_API_KEY` is set, since it outranks the subscription
token and bills the API.

**Claude cloud session.** The proxy refuses GraphQL and every route outside `repos/{owner}/{repo}/…`, so
the board and forge use REST there (section 3). A cloud session loads no repo plugin: install with
`--no-plugin`. A stopped routine writes no heartbeat, so the dead-man workflow runs outside it.

**Environment variables.** `AGENTIC_SDLC_UNATTENDED=1` (dispatch refuses local stages),
`AGENTIC_SDLC_LOCAL=1` (local opt-in), `AGENTIC_SDLC_ROLE=review` (the guard hook allows `forge
approve` and `forge status`, the MCP launcher serves them), `AGENTIC_SDLC_ALLOW_STATUS=1` (the hook allows
`forge status` outside the review role, for a one-identity `mcp --allow status`), `AGENTIC_REVIEW_FIRE_CMD`
(section 7), `CLAUDE_CODE_REMOTE=true` (cloud routes, the proxy token), `AGENTIC_SDLC_PACKAGE` (the
package root `init` copies from; tests set it).

**Profiles.** `individual` (one identity by default) and `organization` (two identities, required). Both
run on the subscription; no path uses a metered API key.

**One identity** (`review_identity` empty). The factory acts as one account, the owner's; in a cloud
routine, the proxy's login. One scheduled job, the cycle, dispatches `review/review` as a fresh-context
subagent that runs no CR code. `forge verdict` posts only the report: a cloud session's proxy refuses
commit-status writes (observed in pilot runs, not documented, can change). The report comment starts the
CR workflow, whose `review` gate posts the status with the CI job's token. `forge approve` refuses, since
GitHub refuses an approval from the CR's author; the installed trunk ruleset needs no approving review
and pins every required check to GitHub Actions. A CR that needs a human waits for a collaborator's
approval of its head or the owner's `forge.approval_label` (section 11.4). What the label proves: a
deliberate act outside the agent's tool surface, not a second identity. The guard hook refuses every
agent write of it (`board label … add`, the `board_label` MCP tool, a `gh`, `curl` or `wget` command
naming a label and it) and `board label` refuses it; an agent that reached GitHub another way could still
apply it. The review is a separate context, not a separate account, so the ruleset cannot prove an agent
did not post its own `review` status or label. The shipped ruleset lets repo admins bypass in a pull
request, and the routine acts as the owner.

**Two identities** (`review_identity` and `review_token_env` set). Two jobs: the cycle, which never holds
the review token, and the review (`templates/runner/review-prompt.md`), started after the cycle by a job
dependency or `AGENTIC_REVIEW_FIRE_CMD`, never on its own clock; it holds the review token and runs only
`review/review`. `forge verdict` posts the status and, on pass, the approval with that token; anywhere
else it exits 1 with `Access:` and posts nothing. The implementer's token has no commit-status write (a
fine-grained token, Commit statuses: no access; `doctor` warns on a classic `repo` or `repo:status`
token), and every required check is pinned to the app that posts it, so an implementer cannot post
`review` or approve its own CR, and CR code never sees the review token. The review token lives only in
Environment `agentic-review` (the trunk, the merge queue and release lines as deployment branches); the
release token only in `agentic-release`, after the Product owner approves the run. Keep `.github/**` in
`paths.factory`.

In both: `forge status` refuses the gate contexts, `review/review` never runs CR code (it reads CI and
runs no install or test), untrusted text is data, and unattended jobs set `AGENTIC_SDLC_UNATTENDED=1`.
`forge verdict` has no hook rule: the token decides. The `sdlc-reviewer` agent cannot write a file, so
it posts through the `forge_verdict` MCP tool.

**One repo or many.** A binding belongs to one repo, with its own install, cycle, heartbeat ticket and
pin. With `board.scope` set, many repos share one hub repo's `github-issues` board: `board list` returns
only items with `scope.label` (`repo:<name>`) and `board create` adds it; the one repo with `home: true`
lists every label in `repos` and also sees unlabelled items, which `plan/triage` labels.

## 11. Mechanism reference for the skills

### 11.1 Comment kinds

`comment --kind <kind> [--ref <value>]` stamps the kind's marker as the first line; `comments --kind`
filters by it. Each format is defined once, in `src/comments.ts`; the `spec` marker is `spec_marker`.

| Kind | Written by | Where | `--ref` |
|---|---|---|---|
| `spec` | `plan/shape` (the newest trusted is the spec) | ticket | none |
| `verdict` | `forge verdict` only | CR | the head (stamped) |
| `note` | `build`; the navigator (asking a person to update a CR) | CR | the head; with a Signal `<head> <Signal id>` |
| `verify` | `review/verify` | CR | the head |
| `manual-check` | `review/review` | ticket | the head |
| `ask` | `board hold`; `escalate` for a CR with no ticket (CR and heartbeat ticket); the navigator past `cycle.failure_limit` | ticket, CR, heartbeat ticket | the trigger |
| `heartbeat` | `ledger heartbeat` (`kind: cycle`), the review runtime (`review`), `learn/improve` (`learn`) | heartbeat ticket | none |
| `scores` | `ledger record` only | heartbeat ticket | none |
| `release-proposal` | `ship` | release request | the revision |
| `release-cut` | `ship` | release request | the version |
| `dispatch` | `dispatch` only | the subject's ticket, else heartbeat ticket | the key |
| `done` | every run, last | the run's ticket; heartbeat ticket for a CR with no ticket | the key |

### 11.2 Heartbeat

One `heartbeat` comment on `heartbeat.ticket` per cycle; it is also the run ledger. The body is the
marker line, then the JSON, bare or in a `json` fence. `ledger` reads only heartbeats by `owners.bots`
and joins `scores` comments and grades to the rows.

```json
{
  "kind": "cycle",
  "at": "ISO-8601 UTC end time",
  "factory": "the sha of `vcs head` for the trunk the skills were read from",
  "runs": [{ "id": "", "skill": "build", "skillHash": "", "ticket": "", "cr": "", "tier": "", "model": "", "executor": "harness", "ref": "", "tokens": 0, "minutes": 0, "outcome": "done", "error": "", "trace": "" }],
  "errors": [{ "step": "", "id": "", "msg": "" }]
}
```

Required: `at`, `factory` (a hex sha, or `board comment --kind heartbeat` refuses it), `runs`, `errors`.
Optional: `kind` (`cycle` default, `review`, `learn`; only `cycle` counts cycles), `did`, `learning`
(`lastProposal`: when, CR, class, cluster, evidence runs, state; `benchBaseline`: results file, factory,
model, executor, cases, pass rate, minutes; copied forward only when enabled, changed only by
`learn/improve`), `measures`, `budget` (`exhausted`). A field the runner could not read is left out and
named in `errors`.

| Run key | Value |
|---|---|
| `id` | The `run` `dispatch` printed, else `<at>-<skill>-<ticket>`, or the executor's `ref` |
| `skill`, `skillHash` | `<skill>/<step>`, and `ledger hash` at the run's start |
| `ticket`, `cr` | The subject; empty when none |
| `tier`, `model`, `executor`, `ref` | The step's tier and mapped model, the executor kind and `dispatch`'s `ref` |
| `tokens`, `minutes` | What the run reported, never guessed |
| `outcome` | `done`, `sent_back`, `failed`, `escalated`, `timeout` or `capped`; all but `done` are failures |
| `error` | The first line of the cause; the ledger clusters on it |
| `trace` | The run id in `traces.uri`, when stored |

`ledger heartbeat [--file <report.json>] [--next <next.json>] [--key <key>]` writes it: `report.json` is
`{ runs, errors, did }`, `next.json` the output of `next` (its `errors` first, its `budget` copied). It
sets `kind`, `at`, `factory` (left out with an error when VCS cannot say) and `learning`; fills
`skillHash`, `tier`, `model` and `executor` a row left out; posts the heartbeat, then the done line of
`--key` (default `<heartbeat.ticket>-sdlc`), and prints `{ heartbeat, done, key, ... }`.

### 11.3 Next: the cycle's work

`next [--ticket <id>] [--idle-exit]` reads the open tickets (`board get` where a row needs children or
blockers), `board holds`, the open CRs and their `forge queue` rows, the ledger, and with `product.slo`
the error budget; applies `routes.yml` from `.agents/skills/sdlc/` (the package's when the install has
none); and prints:

```json
{ "idle": false, "holds": ["7"], "work": [{ "step": "build", "ticket": "7", "reason": "Ready" }],
  "later": [], "errors": [{ "step": "next", "msg": "forge queue: ..." }], "budget": "exhausted" }
```

- `holds`: replied holds and the tickets of queue rows with `release: true`; a held ticket routes only
  when listed here.
- `work`, `later`: `{ step, ticket?, cr?, head?, run?, runModel?, trigger?, reason }` in the order of the
  routes' `groups`; navigator steps always in `work`, others up to `parallel_agents`, the rest in `later`.
- `errors`: what could not be read; the rest is still routed. `idle`: no entry, hold or error; with
  `--idle-exit` it also writes the heartbeat and done line and prints them as `heartbeat`.

`routes.yml` holds four lists. `tickets`: the first row whose conditions all hold routes a ticket (held
tickets and the heartbeat ticket match none). Conditions: `status`, `label`, `children` (`none`, `some`,
`all-closed`), `blocked` (an open `Blocked by <id>` body line), `cr` (`none`, `open`, `by-person`),
`no_open_title`, `not`, and any field or `milestone` (`set`, `unset`, a value); `step: queue` routes by the
CR's queue row. `crs`: per queue action, its step and group (`no_ticket: false`, `by_person` once per
head). `groups`: order, with `sort` (`{ label }`, `priority`, `unblocks`, `oldest`), `cap`, `fill` (`{
status, to }`), `skip_when_budget_exhausted`, and `from: unscored-runs` or `from: learning-due`. `guards`:
`over_budget` replaces a dispatch for an `overBudget` ticket; `repeat` replaces one whose step and subject
failed in each of the last `cycle.failure_limit` heartbeats on the same `factory`. `{$a.b}` is a binding
key (a negative index counts from the end), `{id}` the ticket id; a condition on an unset key fails.

### 11.4 Checks and approval

No merge until every `forge.required_checks` entry is green on the head: the forge enforces it, `doctor`
reports it, `forge land` waits for it. The `approval` gate's classes, which `forge land` reports as
`needsHuman.class`:

| Class | Covers | `human-approval` passes when |
|---|---|---|
| `product-fast` | a Fast-lane product CR | always; with `forge.human_approval: always`, as `product-full` |
| `product-full` | a Full-lane product CR, or one touching `paths.lane_areas` | `human_approval` is `never`; or a review approving the head by an owner, member or collaborator outside `owners.bots` and not `review_identity`; or the label from `owners.product` |
| `tuning` | only the `models` map, and a skill's tiers when it has a bench suite | `tuning` is in `learning.auto_merge_classes`; else as `guardrail` |
| `guardrail` | anything else under `paths.factory`, a CR mixing product and factory paths, unknown paths, deletions, an unreadable head | an `owners.factory` entry approved the head, or applied the label |

The label (`forge.approval_label`) approves the head when its last event on the CR is `labeled`, by an
account the class asks for, not a forge bot, not `review_identity`, after the
head's `pushedAt`; no `pushedAt`, no label approval. Every push removes it (`gate approval --pushed`), so
it approves exactly the head the owner saw. An owner listed in `owners.bots` too (one account in every
role) counts: no agent tool writes the label (the guard hook, `board label` and the MCP tool refuse it),
so the label is a deliberate act outside the agent's tools. It is not proof of a second person.
