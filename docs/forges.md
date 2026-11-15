# Forge: GitHub

Git only, and GitHub is the one forge: on other forges a CR can change the pipeline file that runs
its own gates. The adapter is
unit-tested against a fake process runner, not against GitHub itself yet.
Secrets: `AGENTIC_BOARD_TOKEN`, `AGENTIC_FORGE_TOKEN`, and with two identities `AGENTIC_REVIEW_TOKEN`
(the review identity). In a Claude cloud session the proxy is the forge login.

## Claude cloud sessions
In a cloud session the adapter calls only REST under `repos/{owner}/{repo}/…`, so every verb but
`closing` works behind a Claude cloud session's GitHub proxy, which refuses GraphQL (`gh pr`,
`gh issue`). `closing` uses `search/issues`, which the proxy refuses; the gates that use it run in CI. With
`CLAUDE_CODE_REMOTE=true`, `forge ready`, `forge draft` and `forge automerge` use the proxy's
`pulls/{n}/ccr/…` routes; those routes exist only in the cloud. The proxy injects the token: when the
env var that `token_env` names is unset in a cloud session, the adapter uses the proxy's token, so one
binding serves CI and the cloud. `review_token_env` never falls back.

A private repo on GitHub Free has no draft pull requests and no trunk protection. There a draft CR
is a ready PR with the `draft` label, and `forge automerge` merges directly once the CR is ready and
every `forge.required_checks` entry is green on its head (GitHub refuses auto-merge with nothing to
wait on). No gate can block that merge, so the review is the last check; `doctor` warns about it.

## The checks
| Check | Posted by | Notes |
|---|---|---|
| `Required` | CI job on `pull_request`, no secrets | `commands.install` then `commands.verify` on the CR head. No agent posts it. |
| `proofs-on-base` | gate, own no-secrets job | Each new or changed proof must fail on the merge base. |
| `ticket-linkage` | gate `linkage` | One `Closes <id>` for one open ticket. |
| `review` | `forge verdict`, or gate `review` | Two identities: `forge verdict` as the review identity, from the review runtime only. One identity: gate `review` in CI, from the newest trusted `verdict` comment on the head. |
| `human-approval` | gate `approval` | By class; see below. |
| `skill-regression` | gate | Factory changes keep the skill pack valid. |

Pin each required check to the app that posts it (on GitHub the ruleset's `integration_id`), so a
token that can write statuses cannot fake it. The trunk ruleset pins the four CI checks (`ticket-linkage`,
`Required`, `proofs-on-base`, `skill-regression`) to the Actions app. With two identities `review` and
`human-approval` post with the review token: pin them to the review app when it is an App. With one
identity CI posts both with the Actions token, and `init` pins them to Actions too. `agentic-sdlc doctor` warns when one is
not pinned.

The gate jobs on GitHub are named `linkage-gate` and `approval-gate`. `ticket-linkage` is a commit status
that the linkage job posts with its own `GITHUB_TOKEN`.

## Review identity and approval
**One identity** (`forge.review_identity` empty, the default of both individual profiles): `forge verdict`
posts only its report, since a Claude cloud session's proxy refuses commit-status writes. The CR
workflow's `review-gate` job runs on that comment and posts `review` from the newest trusted report on
the head (`agentic-sdlc gate review --cr <n>`). `forge approve` refuses, since GitHub refuses an
approving review from the CR's author. `init` writes a trunk ruleset that needs no approving review. The `approval` gate
posts `human-approval` with the CI job's token. A CR that needs a human waits until a collaborator
approves its head, or the owner merges it as admin (the ruleset lets admins bypass in a pull request).

**Two identities** (required for `organization`): `forge status` and `forge approve` use only
`forge.options.review_token_env` (the `forge.review_identity` account); without it they fail. The implementer's `token_env` cannot post
`review` or approve. Give the implementer's account no admin or bypass right, and keep
`AGENTIC_REVIEW_TOKEN` out of the implementer's runtime. The review runtime never runs CR code.
`forge status` refuses the contexts the gates own (`human-approval`, `ticket-linkage`, `proofs-on-base`).

The implementer's token must not write commit statuses. Code that a cycle runs (`npm test`, for
example) can read that token and post a status with raw HTTP. Use a fine-grained token with "Commit
statuses: no access". `doctor` warns when `token_env` is a classic token with scope `repo` or
`repo:status`. Pinned checks are the second guard: GitHub ignores a status for a pinned check when
another app or token posts it.

The `approval` gate classifies each CR and posts `human-approval`:

| Class | Passes when |
|---|---|
| `product-fast` | Always (unless `forge.human_approval: always`). |
| `product-full` | (Also any product CR that touches `paths.lane_areas`.) `forge.human_approval: never`, or a human's approving review on the head (not a bot, not the review identity). |
| `tuning` | `tuning` is in `learning.auto_merge_classes`. |
| `guardrail` | `owners.factory` approved the head. A CR that mixes product and factory paths is `guardrail`. |

There is no CODEOWNERS file: the gate enforces owner approval, so `tuning` can auto-merge. The
gate reruns on `pull_request_review` (submitted, dismissed) in `agentic-sdlc-cr.yml`.

When the board is Jira or Linear, an owner has one name on the board and another on GitHub. Write
`owners.<role>: { board: <board account>, forge: <GitHub login> }`. The approval gate and
`forge comments --trusted` read the forge name. The ledger, dispatch and `board comments --trusted`
read the board name.

## CR pipelines and the binding
CR pipelines never let the CR choose the rules. GitHub runs the gates of `agentic-sdlc-cr.yml` on
`pull_request_target` with the base branch checked out (the CR head is fetched as objects only,
never run); the `Required` and `proofs-on-base` jobs run on plain `pull_request` with no secrets.
`gate shipped` needs full history (fetch depth 0) and a git identity to tag. Actions and
installs are pinned: the CLI by `.agents/cli.json` (a `github:` spec and a ref) through the launcher
`.agents/bin/agentic-sdlc`, which a secret-holding job takes from the base checkout, and each action by a 40-hex commit SHA with
its version in a trailing comment (`actions/checkout@<sha> # v7.0.1`). The installed workflows under
`.github/workflows` are the adopter's to keep fresh: Dependabot's `github-actions` ecosystem
(`.github/dependabot.yml`) bumps the SHA and the comment together. `doctor` warns when an installed
`agentic-sdlc-*.yml` has a `uses:` that is not a SHA. The pinned actions run on Node 24, so a self-hosted runner needs
Actions runner v2.327.1 or later.

Board writes from delivery runs are safe when they overlap: each gate reads a ticket again before it
writes and never lowers Shipped. The delivery workflow uses no concurrency group, because a group keeps only one pending run and
cancels older ones.

Trunk-based is enforced by trunk protection (change request only, green required checks, linear
history, no direct push except the bot) and release branches cut with `vcs cut` under
`release_prefix`. No develop branch.

## GitHub
| Guarantee | How |
|---|---|
| Branch names | `pre-push` hook (early) + gate `branch-names` in `agentic-sdlc-cr.yml` |
| Linkage, approval | jobs `linkage-gate` and `approval-gate`; required checks `ticket-linkage`, `human-approval` |
| Verify | job `Required` on `pull_request`, no secrets, plus `proofs-on-base` |
| Merged, shipped, signals | `agentic-sdlc-delivery.yml`: a trunk push runs `gate merged`, deploy runs run `gate shipped`, red CI runs run `signal-on-red`. A failed deploy opens one Signal with its env label |
| Release cut | `agentic-sdlc-release.yml` (release-line delivery only) |
| Auto-merge, merge queue | native; the CR workflow also triggers on `merge_group` |
| Trunk | `ruleset.trunk.json`: one approving review (none with one identity), stale reviews dismissed, the four CI checks pinned to the Actions app (with one identity `review` and `human-approval` too; with two, pin them to the review app when it is an App), linear history; a second ruleset for release branches, `.github/rulesets/release.json` |

One-time setup (private repos need a plan with Environments: Pro, Team or Enterprise):

1. Create Environment `agentic-review`. Deployment branches: selected branches, the trunk exactly,
   `gh-readonly-queue/<trunk>/*` and the release line glob (`<release_prefix>*`; without it a CR to a release line never gets `human-approval`). Store `AGENTIC_REVIEW_TOKEN` there and nowhere else. Only the jobs
   `approval-gate`, `carry-statuses` and the review job of the runner workflow (`github-actions-claude.yml`, `github-actions-codex.yml`) declare it, so no PR-ref run can read it.
2. Add `AGENTIC_FORGE_TOKEN` as a repo secret (`proofs-on-base` falls back to the read-only job token and
   its status post fails by design; the job's exit code is the check).
3. Release line only: create Environment `agentic-release` with the Product owner as required reviewer and deployment branches limited to the trunk. Store `AGENTIC_RELEASE_TOKEN` there: the release bot, a bypass actor of `.github/rulesets/release.json`. The shipped ruleset lets repo admins bypass too (`RepositoryRole` 5); to make the bot the only bypass actor, replace that entry with your release GitHub App (`actor_type: Integration`, its `actor_id`) after you import the ruleset. The release skill starts `forge cut <revision> <version>`, which runs `agentic-sdlc-release.yml`; the Product owner's approval of that run is the go-ahead. The cycle never holds this token.
4. Repo variables (Settings > Secrets and variables > Actions > Variables): the workflows need none for the CLI; its version is `.agents/cli.json` (a commit SHA is the immutable choice, a tag can move: `doctor` warns). The runner workflows read `AGENTIC_AGENT_CLI_VERSION`, an exact version of the Claude Code or Codex CLI, and fail without it.
5. `init` installs `.github/workflows/agentic-sdlc-review-event.yml`, which holds no secret and relays review events to `human-approval`; it must stay in place or approvals do not update. A fork PR's review event carries no PR number, so its approval updates on the next PR event.

## Agent provenance and the SLSA Source track

Gate `provenance` (binding `forge.provenance: off | warn | require`, default `off`) checks that every
commit an agent made on a change line ends with `Agent-Run` and `Agent-Model` trailers (the rule is in
the skill contract, section Provenance). Set `warn` to see the report on each CR. Set `require` to fail
the status `agent-provenance`, and then add `agent-provenance` to `forge.required_checks` and to the
trunk ruleset's required status checks (pin it to the Actions app); `validate` warns when `require` is
set without it. The trunk's squash merge drops the per-commit trailers, so the status and its report on
the CR are the record. The gate matches commits by author or committer in `owners.bots`: with one
identity, where the agent commits as the owner's own account, it cannot tell agent work from human work,
and a commit whose email the forge links to no account is matched by the name git recorded, which the
committer chooses.

The table maps what the shipped setup does to the requirements of the
[SLSA v1.2 Source track](https://slsa.dev/spec/v1.2/source-requirements). It is a map, not a claim of a level.

| Source-track requirement (level) | Provided by | Gap |
|---|---|---|
| Choose an SCS that can reach the level (L1) | GitHub, a version control system | GitHub issues no SLSA source provenance attestations itself, so no level above L1 can be shown from the SCS. |
| Revisions and repositories are uniquely identifiable (L1) | Git commit ids, the repository's URL | None. |
| Access controls on sensitive operations (L2) | Trunk ruleset: a CR with one approving review, required checks, no deletion; `owners.bots` hold no bypass right when the two-identity setup is followed | The shipped ruleset lets repo admins bypass in a pull request (`bypass_actors`); with one identity the implementer is the owner and holds that right. |
| Reliable change history: no force push, only descendants (L2) | `non_fast_forward`, `deletion` and `required_linear_history` rules on the trunk | The ruleset's bypass actors; squash merge rewrites the CR's commits into one. |
| Tags are not moved or deleted (L2) | Release ruleset: `creation`, `update`, `deletion`, `non_fast_forward` on release lines | Repo admins bypass (`always`); release tags are not covered by a tag ruleset. |
| Identity management, activity attributed to authenticated identities (L2) | GitHub accounts and the review identity; gate `provenance` attributes agent commits to a run and model | Commit authorship is a claim the committer sets unless commits are signed; no signed-commit rule ships. One-identity mode merges agent and human under one account. Trailers are the agent's own text, not signed. |
| Source provenance attestations for each revision, created with the branch update (L2) | None. `agent-provenance`, `human-approval` and `review` statuses are evidence on the CR | No attestation is issued or signed, and the statuses are not tied to the trunk revision. A squash merge makes a new revision with no provenance. |
| Continuous technical controls on named references, recorded in attestations (L3) | The trunk ruleset and required checks (`ticket-linkage`, `Required`, `proofs-on-base`, `review`, `human-approval`, `skill-regression`, `agent-provenance` when set) | Controls are enforced but not recorded in a Source VSA. |
| Human readable changes (L2) | The CR's diff on the forge | None. |
| Two-party review of protected branches (L4) | `forge.human_approval` (a human approval on the head for the Full lane, or `always`), `require_last_push_approval`, stale reviews dismissed | Fast-lane product CRs, `tuning` CRs and the review agent's approval need no second person; one-identity mode has no approving review at all; admin bypass. Agents count as a "Trusted Robot" only if the organization says so. |

## Secret exposure
The review token is readable only in the trunk-only Environment `agentic-review`. The release token
is readable only in `agentic-release`, after the Product owner approves the run. The release workflow hands it to the cut step only; checkout does not store it. The merge queue runs the queue commit's copy of the CR workflow with the review Environment, so keep `.github/**` in `paths.factory`. Delivery tokens are
readable only by workflows on the trunk and the release lines. The trunk and release rulesets hold
this.

## Self-hosted runners
Set the repo variables `AGENTIC_RUNS_ON` and `AGENTIC_RUNS_ON_TRUSTED` (Settings > Secrets and variables >
Actions > Variables) to a JSON label list, for example `["self-hosted","wm-code"]` and
`["self-hosted","wm-trusted"]`. Unset, both jobs run on `ubuntu-latest`. A self-hosted runner bills no
minutes, and one runner runs one job at a time.

Trust limits:
- Use a self-hosted runner only on a private repo. On a public repo a fork's CR runs its code on your machine.
  `doctor` fails this case.
- `AGENTIC_RUNS_ON` jobs run CR and agent code with the runner's OS user. Run that runner as its own OS user,
  or in a container or VM, with no access to your files, credentials, browser or other repos.
- `AGENTIC_RUNS_ON_TRUSTED` jobs hold the review, board, forge and release tokens. Give them a second runner
  with a second OS user, so CR code never reads what a secret job leaves on disk. `doctor` warns when one
  runner takes both kinds.
- Register each runner with `--ephemeral` where you can, so no job sees the workspace of the previous one.
- The Environments `agentic-review` and `agentic-release` still gate which jobs get those secrets. On a
  shared runner they no longer isolate the secrets on the machine itself.

## Search lag
`forge closing <id>` uses GitHub search, and the search index can trail a merge. When the search
finds no merge for a ticket, `gate shipped` also reads the newest merged CRs, so a fresh merge
still ships.

## Continuous delivery
With `product.delivery: continuous`, every environment deploys from the trunk. There is no release line, no
`ship` step and no release workflow. Wire each deploy to `gate shipped <env> --sha <sha> --result
success|failure|rolled-back --version <v>`, so the board records the artifact version.

## Non-code products
`product.environments` names the stages and `gate shipped <env>` takes any of them. Wire it to the
publish step: docs = site publish (preview, live); data = pipeline promote; ML = model registry
push or endpoint rollout; firmware = signed artifact upload or OTA channel; mobile = store upload
(internal, beta, store); library = registry publish. Use the same `workflow_run`/job wiring as the
deploy templates; the env names must match the binding.
