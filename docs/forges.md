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
token that can write statuses cannot fake it. `agentic-sdlc doctor` warns when one is not pinned.

## Review identity and approval
`forge status` and `forge approve` use only `forge.options.review_token_env` (the
`forge.review_identity` account); without it they fail. The implementer's `token_env` cannot post
`review` or approve. Give the implementer's account no admin or bypass right, and keep
`AGENTIC_REVIEW_TOKEN` out of the implementer's runtime. The review runtime never runs CR code.

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
| Bitbucket | approx: a webhook relay runs the `agentic-approval` custom pipeline on the trunk |

## CR pipelines and the binding
CR pipelines never let the CR choose the rules. GitHub runs the gates of `agentic-sdlc-cr.yml` on
`pull_request_target` with the base branch checked out (the CR head is fetched as objects only,
never run); the `Required` and `proofs-on-base` jobs run on plain `pull_request` with no secrets.
GitLab, Azure and Bitbucket add a worktree of the target branch and run every gate with `--root`
on it. `gate shipped` needs full history (fetch depth 0) and a git identity to tag. Actions and
installs are pinned: the project's `agentic-sdlc` devDependency (a `github:` spec; `init` sets
`allow-git=root` in `.npmrc` for npm 12) through `npm ci`, and each action
carries a `# pin to a commit SHA` note.

Trunk-based is enforced by trunk protection (change request only, green required checks, linear
history, no direct push except the bot) and release branches cut with `vcs cut` under
`release_prefix`. No develop branch.

"native" = the forge enforces it. "gate" = our CI job enforces it. "approx" = approximated.

## GitHub
| Guarantee | How |
|---|---|
| Branch names | `pre-push` hook (early) + gate `branch-names` in `agentic-sdlc-cr.yml` |
| Linkage, approval | gates; required checks `ticket-linkage`, `human-approval` |
| Verify | job `Required` on `pull_request`, no secrets, plus `proofs-on-base` |
| Board sync, shipped, signals | `agentic-sdlc-cr.yml`, `agentic-sdlc-delivery.yml` |
| Auto-merge, merge queue | native; the CR workflow also triggers on `merge_group` |
| Trunk | `ruleset.trunk.json`: one approving review, stale reviews dismissed, the six required checks pinned, linear history; a second ruleset for release branches |

## GitLab
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the MR pipeline |
| Linkage, approval | jobs `ticket-linkage`, `human-approval`; enable "Pipelines must succeed" |
| Verify | job `Required` in the MR pipeline with no protected variables |
| Board sync, shipped, signals | jobs in `agentic-sdlc.gitlab-ci.yml`; merged = trunk push job |
| Auto-merge | native (merge when pipeline succeeds, merge trains) |
| Trunk | protected branch, fast-forward merge, push by bot only; protected release branches |

## Azure DevOps
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the PR build |
| Linkage, approval | the PR build (`ticket-linkage` job); required status check `agentic-sdlc/human-approval` |
| Verify | the PR build `Required`: its `Required` and `proofs-on-base` jobs hold no secret or token |
| Board sync | opened/ready in the PR build; approx: merged and draft need a Service hook that queues a pipeline |
| Auto-merge | native (auto-complete) |
| Trunk | branch policy: required builds, squash/rebase only, bot-only push |

## Bitbucket
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the PR pipeline |
| Linkage, approval | PR pipeline steps `ticket-linkage`, `human-approval` as merge checks |
| Verify | PR pipeline step `Required` with no secured variables |
| Board sync | PR pipeline (ready), trunk pipeline (merged); approx: no draft event |
| Auto-merge | approx: scheduled custom pipeline `agentic-automerge` merges CRs with `<!-- agentic-sdlc:automerge -->` when green |
| Trunk | branch restrictions: successful build, no direct push, squash/fast-forward |

## Gaps
No native guarantee: Bitbucket auto-merge and draft event, Azure draft/merged events and review
events (service hook needed), GitLab approval events outside a pipeline.

## Non-code products
`product.environments` names the stages and `gate shipped <env>` takes any of them. Wire it to the
publish step: docs = site publish (preview, live); data = pipeline promote; ML = model registry
push or endpoint rollout; firmware = signed artifact upload or OTA channel; mobile = store upload
(internal, beta, store); library = registry publish. Use the same `workflow_run`/job wiring as the
deploy templates; the env names must match the binding.
