# Forges and VCS

Every combination runs the same gates (`agentic-sdlc gate ...`); only the wiring differs.
Secrets everywhere: `AGENTIC_BOARD_TOKEN`, `AGENTIC_FORGE_TOKEN`, `AGENTIC_REVIEW_TOKEN` (the reviewer identity).

## Review identity
`forge status` and `forge approve` use only `forge.options.review_token_env` (the `forge.review_identity`
account); without it they fail. The implementer's `token_env` therefore cannot post `review`, `Required` or
`factory-owner`, nor approve. Trunk protection requires one approving review (stale approvals dismissed on push):
the review identity gives it through review-pr's `forge approve <n>`. On GitHub, `CODEOWNERS` maps `.agents/**`,
`.github/**` and `.claude/**` to `owners.factory`, so a factory change also needs that owner's approval.
Swarm has no statuses: only marker comments written by `options.review_user` count as checks.
Give the implementer's account no admin or bypass right, and keep `AGENTIC_REVIEW_TOKEN` out of the implementer's runtime.

## CR pipelines and the binding
CR pipelines never let the CR choose the rules: GitHub runs `agentic-sdlc-cr.yml` on `pull_request_target` with the
base branch checked out (the CR head is fetched as objects only, never checked out or run); GitLab, Azure and Bitbucket
add a git worktree of the target branch and run every gate with `--root` on it. `skill-regression` only reads files.
`gate shipped` needs full history (fetch depth 0) and a git identity to tag.
Trunk-based is enforced by trunk protection (change request only, green required checks, linear history,
no direct push except the bot) and release lines cut with `vcs cut` under `release_prefix`. No develop branch.

"native" = the forge enforces it. "gate" = our CI job enforces it. "approx" = approximated.

## GitHub + git
| Guarantee | How |
|---|---|
| Branch names | `pre-push` hook (early) + gate `branch-names` in `agentic-sdlc-cr.yml` |
| Linkage | gate; required check `ticket-linkage` |
| Board sync, shipped, signals | `agentic-sdlc-cr.yml`, `agentic-sdlc-delivery.yml` |
| Auto-merge | native |
| Review | `ruleset.trunk.json`: 1 approving review, code owner review, stale reviews dismissed; `CODEOWNERS` → owners.factory |
| Trunk | `ruleset.trunk.json` (ticket-linkage, review, Required, factory-owner; linear history); a second ruleset for release branches |

## GitLab + git
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the MR pipeline |
| Linkage | job `ticket-linkage`; enable "Pipelines must succeed" |
| Board sync, shipped, signals | jobs in `agentic-sdlc.gitlab-ci.yml`; merged = trunk push job |
| Auto-merge | native (merge when pipeline succeeds, merge trains) |
| Trunk | protected branch, fast-forward merge, push by bot only; protected release branches |

## GitLab/Heptapod + hg
| Guarantee | How |
|---|---|
| Branch names | `hg-pretxnchangegroup.sh` on the server (topics, bookmarks) |
| Linkage, board, signals | same GitLab pipeline file |
| Auto-merge | native |
| Trunk | topics land on default only through MRs; approx: no per-topic push protection |

## Azure DevOps + git
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the PR build |
| Linkage | build validation policy named `ticket-linkage` |
| Board sync | opened/ready in the PR build; approx: merged and draft need a Service hook that queues a pipeline |
| Auto-merge | native (auto-complete) |
| Trunk | branch policy: required build, squash/rebase only, bot-only push |

## Bitbucket + git
| Guarantee | How |
|---|---|
| Branch names | `pre-push` + gate in the PR pipeline |
| Linkage | PR pipeline step `ticket-linkage` as a merge check |
| Board sync | PR pipeline (ready), trunk pipeline (merged); approx: no draft event |
| Auto-merge | approx: scheduled custom pipeline `agentic-automerge` merges CRs with `<!-- agentic-sdlc:automerge -->` when green |
| Trunk | branch restrictions: successful build, no direct push, squash/fast-forward |

## Swarm + p4
| Guarantee | How |
|---|---|
| Branch names | `p4-change-submit.sh` trigger on stream names |
| Linkage, board, signals | approx: no CI events; run the gates from a Swarm webhook or a Jenkins/Helix job on review events |
| Auto-merge | approx: the gate commits the shelf when the review is approved and tests pass |
| Trunk | mainline stream, task streams in, release streams out; the trigger blocks direct submit to mainline except the bot |

## Gaps
No native guarantee: Bitbucket auto-merge and draft event, Azure draft/merged events (service hook needed),
Heptapod per-topic protection, and every Swarm CR event.

## Non-code products
`product.environments` names the stages and `gate shipped <env>` takes any of them. Wire it to the publish step:
docs = site publish (preview, live); data = pipeline promote; ML = model registry push or endpoint rollout;
firmware = signed artifact upload or OTA channel; mobile = store upload (internal, beta, store); library = registry publish.
Use the same `workflow_run`/job wiring as the deploy templates; the env names must match the binding.
