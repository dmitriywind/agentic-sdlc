# Forge: GitHub

v2 is Git only, and GitHub is the one forge. GitLab, Azure DevOps and Bitbucket were removed in
2.0.0-alpha.5: a CR there could change the pipeline file that ran its own gates. The adapter is
unit-tested against a fake process runner, not against GitHub itself yet.
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
installs are pinned: the project's `agentic-sdlc` devDependency (a `github:` spec; `init` sets
`allow-git=root` in `.npmrc` for npm 12) through `npm ci`, and each action
carries a `# pin to a commit SHA` note.

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
| Trunk | `ruleset.trunk.json`: one approving review, stale reviews dismissed, the four CI checks pinned to the Actions app (`review` and `human-approval` are not pinned: pin them to the review app when it is an App), linear history; a second ruleset for release branches, `.github/rulesets/release.json` |

One-time setup (private repos need a plan with Environments: Pro, Team or Enterprise):

1. Create Environment `agentic-review`. Deployment branches: selected branches, the trunk exactly,
   `gh-readonly-queue/<trunk>/*` and the release line glob (`<release_prefix>*`; without it a CR to a release line never gets `human-approval`). Store `AGENTIC_REVIEW_TOKEN` there and nowhere else. Only the jobs
   `approval-gate`, `carry-statuses` and the review job of the runner workflow (`github-actions-claude.yml`, `github-actions-codex.yml`) declare it, so no PR-ref run can read it.
2. Add `AGENTIC_FORGE_TOKEN` as a repo secret (`proofs-on-base` falls back to the read-only job token and
   its status post fails by design; the job's exit code is the check).
3. Release line only: create Environment `agentic-release` with the Product owner as required reviewer and deployment branches limited to the trunk. Store `AGENTIC_RELEASE_TOKEN` there: the release bot, the only bypass actor of `.github/rulesets/release.json`. The release skill starts `forge cut <revision> <version>`, which runs `agentic-sdlc-release.yml`; the Product owner's approval of that run is the go-ahead. The cycle never holds this token.
4. `init` installs `.github/workflows/agentic-sdlc-review-event.yml`, which holds no secret and relays review events to `human-approval`; it must stay in place or approvals do not update. A fork PR's review event carries no PR number, so its approval updates on the next PR event.

## Secret exposure
The review token is readable only in the trunk-only Environment `agentic-review`. The release token
is readable only in `agentic-release`, after the Product owner approves the run. Delivery tokens are
readable only by workflows on the trunk and the release lines. The trunk and release rulesets hold
this.

## Search lag
`forge closing <id>` uses GitHub search, and the search index can trail a merge. When the search
finds no merge for a ticket, `gate shipped` also reads the newest merged CRs, so a fresh merge
still ships.

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
