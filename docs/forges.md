# Forges

v2 is Git only. Every forge runs the same gates (`agentic-sdlc gate ...`); only the wiring differs.
The adapters are unit-tested against a fake process runner, not against live forges yet.
Secrets everywhere: `AGENTIC_BOARD_TOKEN`, `AGENTIC_FORGE_TOKEN`, `AGENTIC_REVIEW_TOKEN` (the
review identity).

## The checks
| Check | Posted by | Notes |
|---|---|---|
| `Required` | CI job on `pull_request`, no secrets | `commands.install` then `commands.verify` on the CR head. No agent posts it. |
| `proofs-on-base` | gate, own no-secrets job | Each new or changed proof must fail on the merge base. |
| `ticket-linkage` | gate `linkage` | One `Closes <id>` for one open ticket. |
| `review` | `review-pr` as the review identity | From the review runtime only. |
| `human-approval` | gate `approval` | By class; see below. |
| `skill-regression` | gate | Factory changes keep the skill pack valid. |

Pin each required check to the app that posts it (on GitHub the ruleset's `integration_id`), so a
token that can write statuses cannot fake it. The trunk ruleset pins the four CI checks (`ticket-linkage`,
`Required`, `proofs-on-base`, `skill-regression`) to the Actions app. `review` and `human-approval` post with
the review token: pin them to the review app when it is an App. `agentic-sdlc doctor` warns when one is
not pinned.

The gate jobs on GitHub are named `linkage-gate` and `approval-gate`. `ticket-linkage` is a commit status
that the linkage job posts with its own `GITHUB_TOKEN`.

## Review identity and approval
`forge status` and `forge approve` use only `forge.options.review_token_env` (the
`forge.review_identity` account); without it they fail. The implementer's `token_env` cannot post
`review` or approve. Give the implementer's account no admin or bypass right, and keep
`AGENTIC_REVIEW_TOKEN` out of the implementer's runtime. The review runtime never runs CR code.
`forge status` refuses the contexts the gates own (`human-approval`, `ticket-linkage`, `proofs-on-base`).
GitLab, Azure DevOps and Bitbucket run `gate approval --fail-pending`: the job fails while approval waits,
so the job result is the merge gate.

The `approval` gate classifies each CR and posts `human-approval`:

| Class | Passes when |
|---|---|
| `product-fast` | Always (unless `forge.human_approval: always`). |
| `product-full` | (Also any product CR that touches `paths.lane_areas`.) `forge.human_approval: never`, or a human's approving review on the head (not a bot, not the review identity). |
| `tuning` | `tuning` is in `learning.auto_merge_classes`. |
| `guardrail` | `owners.factory` approved the head. A CR that mixes product and factory paths is `guardrail`. |

There is no CODEOWNERS file: the gate enforces owner approval, so `tuning` can auto-merge. The
gate reruns when a review is submitted:

| Forge | Event that reruns `approval` |
|---|---|
| GitHub | `pull_request_review` (submitted, dismissed) in `agentic-sdlc-cr.yml` |
| GitLab | approval webhook or the next MR pipeline; approx: re-run the pipeline after approving |
| Azure DevOps | approx: a Service hook on "pull request updated" that queues the gate pipeline |
| Bitbucket | The PR pipeline step `human-approval` runs on PR events. approx: a webhook relay runs the `agentic-approval` custom pipeline on the trunk after a review |

## CR pipelines and the binding
CR pipelines never let the CR choose the rules. GitHub runs the gates of `agentic-sdlc-cr.yml` on
`pull_request_target` with the base branch checked out (the CR head is fetched as objects only,
never run); the `Required` and `proofs-on-base` jobs run on plain `pull_request` with no secrets.
GitLab, Azure and Bitbucket add a worktree of the target branch and run every gate with `--root`
on it. `gate shipped` needs full history (fetch depth 0) and a git identity to tag. Actions and
installs are pinned: the project's `agentic-sdlc` devDependency (a `github:` spec; `init` sets
`allow-git=root` in `.npmrc` for npm 12) through `npm ci`, and each action
carries a `# pin to a commit SHA` note.

Delivery workflows serialise board writes: GitHub uses `concurrency: agentic-board` and GitLab uses
`resource_group: agentic-board`. One run at a time writes the tickets.

Trunk-based is enforced by trunk protection (change request only, green required checks, linear
history, no direct push except the bot) and release branches cut with `vcs cut` under
`release_prefix`. No develop branch.

"native" = the forge enforces it. "gate" = our CI job enforces it. "approx" = approximated.

## GitHub
| Guarantee | How |
|---|---|
| Branch names | `pre-push` hook (early) + gate `branch-names` in `agentic-sdlc-cr.yml` |
| Linkage, approval | jobs `linkage-gate` and `approval-gate`; required checks `ticket-linkage`, `human-approval` |
| Verify | job `Required` on `pull_request`, no secrets, plus `proofs-on-base` |
| Merged, shipped, signals | `agentic-sdlc-delivery.yml`: a trunk push runs `gate merged`, deploy runs run `gate shipped`, red CI runs run `signal-on-red`. A failed deploy opens one Signal with its env label |
| Release cut | `agentic-sdlc-release.yml` (release-line delivery only) |
| Auto-merge, merge queue | native; the CR workflow also triggers on `merge_group` |
| Trunk | `ruleset.trunk.json`: one approving review, stale reviews dismissed, the four CI checks pinned to the Actions app (`review` and `human-approval` are not pinned: pin them to the review app when it is an App), linear history; a second ruleset for release branches, `.github/rulesets/release.json` |

One-time setup (private repos need a plan with Environments: Pro, Team or Enterprise):

1. Create Environment `agentic-review`. Deployment branches: selected branches, the trunk exactly,
   `gh-readonly-queue/<trunk>/*` and the release line glob (`<release_prefix>*`; without it a CR to a release line never gets `human-approval`). Store `AGENTIC_REVIEW_TOKEN` there and nowhere else. Only the jobs
   `approval-gate`, `carry-statuses` and the review job of the runner workflow (`github-actions-claude.yml`, `github-actions-codex.yml`) declare it, so no PR-ref run can read it.
2. Add `AGENTIC_FORGE_TOKEN` as a repo secret (`proofs-on-base` falls back to the read-only job token and
   its status post fails by design; the job's exit code is the check).
3. Release line only: create Environment `agentic-release` with the Product owner as required reviewer and deployment branches limited to the trunk. Store `AGENTIC_RELEASE_TOKEN` there: the release bot, the only bypass actor of `.github/rulesets/release.json`. The release skill starts `forge cut <revision> <version>`, which runs `agentic-sdlc-release.yml`; the Product owner's approval of that run is the go-ahead. The cycle never holds this token.
4. `init` installs `.github/workflows/agentic-sdlc-review-event.yml`, which holds no secret and relays review events to `human-approval`; it must stay in place or approvals do not update. A fork PR's review event carries no PR number, so its approval updates on the next PR event.

## GitLab
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the MR pipeline |
| Linkage, approval | jobs `ticket-linkage`, `human-approval`; enable "Pipelines must succeed" |
| Verify | job `Required` in the MR pipeline with no protected variables |
| Merged, shipped, signals | jobs in `agentic-sdlc.gitlab-ci.yml`; `gate merged` runs in the trunk push job; one Signal per failed deploy |
| Auto-merge | native (merge when pipeline succeeds, merge trains) |
| Trunk | protected branch, fast-forward merge, push by bot only; protected release branches |

Variables: `AGENTIC_FORGE_TOKEN`, `AGENTIC_BOARD_TOKEN`, `AGENTIC_REVIEW_TOKEN` are Protected, Masked and
hidden; "protected variables in MR pipelines" stays off. `AGENTIC_READ_TOKEN` is a project access token with
Reporter role and `read_api` scope, masked and not protected: `proofs-on-base` runs MR code and gets only this.
Limitation: environment scope is a name match an MR can declare, and protected variables do not reach MR
pipelines. So the secret-holding gates must run from the trigger relay on the default branch; the template
does not do this yet (tracked for the next release).

## Azure DevOps
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the PR build |
| Linkage, approval | the PR build (`ticket-linkage` job); required status check `agentic-sdlc/human-approval` |
| Verify | the PR build `Required`: its `Required` and `proofs-on-base` jobs hold no secret or token |
| Merged, shipped | wire `gate merged` into your trunk CI pipeline and `gate shipped` into each deploy pipeline yourself |
| Auto-merge | native (auto-complete) |
| Trunk | branch policy: required builds, squash/rebase only, bot-only push |

## Bitbucket
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the PR pipeline |
| Linkage, approval | PR pipeline steps `ticket-linkage`, `human-approval` as merge checks |
| Verify | PR pipeline step `Required` with no secured variables |
| Merged, shipped | trunk pipeline (`gate merged`), deploy steps (`gate shipped`) |
| Auto-merge | approx: scheduled custom pipeline `agentic-automerge` merges CRs with `<!-- agentic-sdlc:automerge -->` when green |
| Trunk | branch restrictions: successful build, no direct push, squash/fast-forward |

## Secret exposure
| Forge | Who can read the gate tokens | What holds |
|---|---|---|
| github | Review token: only the trunk-only Environment `agentic-review`. Delivery tokens: workflows on the trunk and release lines | The trunk and release rulesets (`.github/rulesets/release.json`) |
| gitlab | A contributor with push access, via MR-editable YAML | Advisory against them: restrict branch push to bots and owners, or wait for the relay |
| azure | A contributor with push access, via PR-editable YAML | Advisory against them: restrict branch push to bots and owners, or wait for the relay |
| bitbucket | A contributor with push access, via PR-editable YAML | Advisory against them: restrict branch push to bots and owners, or wait for the relay |

GitLab: never enable protected variables in MR pipelines. The sound routes are Ultimate external status checks or a pipeline execution policy; a default-branch relay posting with the MR head `pipeline_id` is unverified.

## Gaps
No native guarantee: Bitbucket auto-merge, Azure review events (service hook needed), GitLab approval
events outside a pipeline.

On GitLab, Azure DevOps and Bitbucket the author of an MR or PR can edit its pipeline file. A person with
push access can change the gates there. So these gates are advisory until a trunk-defined pipeline holds
them: a GitLab pipeline execution policy or an Azure DevOps required template. Bitbucket has no such control.

## Continuous delivery
With `product.delivery: continuous`, every environment deploys from the trunk. There is no release line, no
`release` skill and no release workflow. Wire each deploy to `gate shipped <env> --sha <sha> --result
success|failure|rolled-back --version <v>`, so the board records the artifact version.

## Non-code products
`product.environments` names the stages and `gate shipped <env>` takes any of them. Wire it to the
publish step: docs = site publish (preview, live); data = pipeline promote; ML = model registry
push or endpoint rollout; firmware = signed artifact upload or OTA channel; mobile = store upload
(internal, beta, store); library = registry publish. Use the same `workflow_run`/job wiring as the
deploy templates; the env names must match the binding.
