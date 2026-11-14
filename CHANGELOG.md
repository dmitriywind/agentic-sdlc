# Changelog

All notable changes to this package. Versions follow semver. A release is a `v<version>` Git tag; the package is
not on npm.

## Unreleased

- GitHub templates read `runs-on` from the repo variables `AGENTIC_RUNS_ON` (jobs that run CR or agent code) and `AGENTIC_RUNS_ON_TRUSTED` (jobs that hold secrets), and run `bash` on every runner, so a self-hosted runner (no billed minutes, Windows too) works. `doctor` fails a self-hosted runner on a public repo and warns when one runner takes both kinds of job.
- A Claude cloud routine cannot reach GitHub Projects: the runner docs say to use GitHub Actions with a `github` board, and `doctor` in a cloud session says so when the board probe fails.

## 2.0.0-alpha.5 (2026-11-14)

- Breaking: GitHub is the one forge. The GitLab, Azure DevOps and Bitbucket adapters, their gate templates and `gitlab-ci-cycle.yml` are removed, because a CR there could change the pipeline file that ran its own gates. `gate approval --fail-pending` is removed; `forge cut` is a required port verb and the release skill always cuts through it.
- Breaking: `templates/binding.yml` writes `heartbeat.ticket: ""`, and `validate` fails on an empty heartbeat ticket. `init --board local` creates the heartbeat ticket (status Cancelled) and sets its id.
- `owners.product`, `owners.factory` and each `owners.bots` entry take a name or `{ board, forge }`. Board reads use the board name; the approval gate and `forge comments --trusted` use the forge name.
- `CR.pushedAt`: when the head reached the forge (the first check suite on the head). review-pr and the heartbeat's `stalled` count `stall_minutes` from it.
- `doctor` warns when the implementer token is a classic token with scope `repo` or `repo:status`, since cycle code could post commit statuses with it.
- `gate shipped` also reads the newest merged CRs for a ticket the search finds no merge for, so a merge the search index does not show yet still ships.
- Skill rules made exact: implement-spec sends a Full-lane ticket with no trusted spec to Backlog; review-pr posts no report while anything is pending, grades a DEVIATED criterion with an updated spec as DONE, grades only a bot's verify-ux comment, escalates (Access) a missing verify-ux run or a check that never reported on a ready CR, and sends back only a red one; any owner reply settles a P0 hold; a run with no ticket records proceed on its CR; shape keeps the initiative's Priority and posts only the closing comment on an initiative; backlog-grooming moves a closed parent to Done or Cancelled before it closes it; triage-signal or the Product owner writes P0; after the time budget the cycle starts no judge or learn; a step with no ticket asks owners.factory with one comment on the heartbeat ticket; triage moves evidence only for a duplicate; branch-names allows dependabot/ and renovate/ lines; a failure with one environment returns tickets to Not shipped; the contract names learning.lastProposal and learning.benchBaseline. Tests cover the trunk-checkout push, non-JSON hook input and --stdin-prepush.

## 2.0.0-alpha.4 (2026-11-14)

- Round 5 review fixes: a run ends only with its own done line (no other comment counts; the assign hand-off names the line, and the assignee may post it); a command start counts only once the child has a pid; a refused (4xx) or unreachable request still writes the done line; dependency bots match exact logins; the failure reset leaves a ticket whose version changed; `forge cut` finds its run by run id, not by clock.
- Round 4 review fixes: every executor gets the done line in its task (harness instruction, command prompt, webhook and managed bodies); a run on its own ticket ends with any later bot comment, on the heartbeat ticket only with its done line, and same-second timestamps count; `dispatch sdlc` claims before any executor or sandbox check; a failed start writes the done line only before a request leaves; a heartbeat with a leading agentic-sdlc line still parses; rollback and the failure reset read each ticket again before writing; dependency bot logins such as `renovate-bot` match; `forge cut` returns only a run created by this dispatch; `bench run` treats a null budget as no cap and rejects an empty `--budget`.
- Round 3 review fixes: a dependency CR needs both the bot branch and the bot author; a merge queue commit gets `ticket-linkage` from the linkage job; the GitHub delivery workflow has no concurrency group (a group drops pending runs); a rollback in an earlier environment leaves tickets that are further on; `merged` fails on a forge error and treats only "no change request" as a direct push; a dispatched run ends with `<!-- agentic-sdlc:done <key> -->`, a failed start writes it, and `dispatch sdlc` only claims; `ledger summary` shows `learning.judge`, and the cycle judges only under the budget; `forge cut` returns the workflow run; `bench run --budget` rejects a non-number and stops at equality; `shipped` lists only Done tickets as unmatched; a failed linkage status post fails the job on GitHub.
- Stress test round 2. Board writers no longer race: the gates read a ticket again before each write (GitLab trunk jobs also share `resource_group: agentic-board`), `shipped` reads a ticket again before it writes and never lowers a newer Shipped, `merged` writes Not shipped only when the field is still empty and tolerates `shipped` moving the ticket first, and `release` sets In release before the cut. `shipped` waits only the one ticket of unknown ancestry, overwrites the version with `--version`, and opens one Signal per environment and sha, with its `env:` label. `linkage` posts status `ticket-linkage` on the head with the job's own token (the GitHub gate jobs are renamed `linkage-gate` and `approval-gate`, so a job's check run never stands in for a status), and passes `dependabot/` and `renovate/` CRs with no ticket. New `gate evidence --sha` and `forge cut <revision> <version>` (GitHub: `agentic-sdlc-release.yml`, an Environment the Product owner approves, holding the release bot token). Heartbeats have a `kind` (cycle, review, learn); only cycles count toward `learning.due`; the review runtime and improve-factory write their own. dispatch blocks a second start while the previous run has not finished (until `stall_minutes`), keeps judge markers on the heartbeat ticket, and a judge with no known run model is skipped. `bench run --budget`. Routing covers a ready CR with no review, a ticket at In review with no CR, a person's CR (hand-off, no cap), dependency CRs, and skips a release request waiting on the owner. A trusted owner reply releases a hold. review-pr reviews each head once, never syncs a person's CR, drafts a CR before sending its ticket to Backlog, and asks a manual check per head. validate warns on a non-numeric GitHub heartbeat ticket and on env labels with no environment, and fails an empty release prefix.
- Release evidence and compliance: `product.evidence: [sbom, provenance, signature]` and `commands.evidence_check`; the release ready check runs it on the chosen revision, and validate warns when evidence has no check. The rollback precondition is now a green rollback run shown by `forge runs` or linked by a trusted comment. triage-signal escalates at once (Legal) a security report with a legal reporting deadline that `SECURITY.md` names, such as the EU CRA 24-hour early warning.
- Scale: the GitHub board reads only the issues of `board.options.repo`, so several repos can share a Project; its item cap is 5000. Forges may implement `closing(id)` (GitHub and GitLab do, by body search), and `gate shipped` looks up merges per candidate ticket instead of the last 100 merged CRs.
- Delivery model: `product.delivery: release-line | continuous`. Continuous ships every environment from the trunk (no release line, no In release, `vcs.release_prefix` not required); the GitHub delivery workflow reads `env.DELIVERY` and doctor checks it. `gate shipped --version <v>` records an artifact version (store build, package, model) and tags it in the last environment. `gate shipped --result rolled-back` steps back the tickets not in the revision now running (model pin, halted rollout, flag kill). `paths.no_proof` lets a docs-only or config-only product CR pass proofs-on-base. The adoption guide maps web, mobile, library, data/ML and content products to the binding.
- Cycle: each run walks every routing row (release requests and Done P0s, then In progress rework, then Ready up to `cycle.max_implementations`, then Backlog), so a full Ready queue no longer starves releases or rework. Judge and learn run at the start of the cycle on the previous heartbeat's runs, so their own rows reach this heartbeat. `learning.due` is false once the week's learning spend reaches `learning.budget_usd_per_week`. `dispatch improve-factory` needs no subject; `dispatch --run <id>` keys judge runs per run. The dedupe window is `cycle.dedupe_minutes` (template 10), catching double fires only; the marker is posted before the executor starts. `cycle.time_budget_minutes` defaults to 45, below the runner timeout. `judge_tier` defaults to `fast`. `learning.human_sample` is removed. review-pr never treats a pending `review` or `human-approval` as stalled, and handles a red check on a draft CR.
- Breaking: `forge.review_runtime` is removed; review-pr always runs in its own runtime. `forge status` refuses the contexts `human-approval`, `ticket-linkage` and `proofs-on-base`, so no agent can forge a gate. `gate approval --fail-pending` fails the job while approval waits (GitLab, Azure and Bitbucket templates use it). The GitHub runner review job takes `AGENTIC_REVIEW_TOKEN` from the `agentic-review` Environment. The trunk ruleset requires last-push approval. The release go-ahead reads only `owners.product` comments. `forge.review_check_name` cannot name a gate context.
- Breaking: one writer per board transition. `gate board-sync` is gone. `gate merged --sha` (trunk push only) moves a merged ticket to Done; held tickets move and keep the label, Cancelled ones stay. implement-spec moves its ticket to In review after `forge open` and after a rework push; a CR a person opened is handed to review-pr, which never pushes to it. `release` sets Shipped In release at the cut. No CR-pipeline job on any forge writes the board. `shipped` ships a merged ticket still at In review (and moves it to Done) and resets a failed release by its version. The delivery workflow no longer runs `signal-on-red` for deploy runs, so one failed deploy opens one Signal. `CR` gains `author`.
- Docs: `docs/adoption.md` (choose the setup, one repo, many repos, migration, upgrade), `docs/use-cases.md` (actors, 19 use cases, team shapes), `docs/behaviour/` (20 Gherkin feature files, 174 scenarios, each with its source and, for CLI mechanism, the proving test), `docs/roadmap.md`, and three new flows (routing by status, intake, the needs-human hold).
- AGENTS.md: a behaviour change updates its feature file, flow and use case in the same change.

## 2.0.0-alpha.3 (2026-11-11)

- Skills: backlog-grooming discovers an Idea the Product owner moved to Backlog (outcome, user, metric, one plain question when missing), tickets tech debt only with a cost, and files a removal ticket for each flag. New docs/operating-baseline.md (recommendations by team shape, repo and board baseline, 2026-27 operate).
- Skills: release resumes without re-posting while a proposal awaits a reply and never cherry-picks (a cut takes one trunk revision); routing skips release for one environment; a `manual` criterion gets one ask and a PENDING grade; escalate treats a new diff as no new fact; rework and factory-CR owner replies read `forge comments`.
- Fix: gate templates. The GitHub Shipped step runs only for a push-triggered deploy of the trunk or a release line (last env only from a release line); trunk and release prefix come from one env source; Azure and Bitbucket headers no longer claim PR-run jobs hold no secrets; docs/forges.md gains Secret exposure.
- Mechanism: `forge comments` reads CR comments on all four forges (shared filter with `board comments`); validate requires vcs.trunk, release_prefix (ending in /), factory_change_pattern and tag_prefix; `gate shipped` tags before the board write and keeps existing tags; Jira and Linear paging fails closed on no progress; doctor checks the delivery workflow env and warns that gitlab, azure and bitbucket gates run from editable YAML; init installs a release-lines ruleset.

- Skills: review-pr escalates (Access) a required check still pending or never reported past `stall_minutes` instead of waiting forever; the pack ships a default stack-neutral review checklist (`skills/review-pr/references/checklist.md`: access, injection, secrets, dependencies, data, model features, WCAG 2.2 AA, reversibility) that review-pr and implement-spec apply before the project checklist.
- Skills: routing never sends an initiative to shape; the release request is a Backlog ticket labelled `board.labels.release` (new binding label) that release comments on and closes; a Done P0 On <env before last> starts release, which opens the request; the rollback proof is a run since the previous release tag.
- Skills: escalate-to-human settles a trigger an owner already answered (a trusted owner reply after the last `### Needs human` comment, unless new facts appeared), so a P0 or Full-lane ticket can move; shape calls escalate-to-human in the Lane step and stops on an initiative.
- Fix: board adapters page Jira and Linear lists and comments, and the GitHub board fails loudly at 1000 items or 200 search hits instead of truncating; `gate shipped` lists Done tickets with no merged CR as unmatched (unless labelled `board.labels.release`, optional); doctor checks the delivery workflow's push branches against the trunk.
- Skills: the executors contract moves to `skills/sdlc/references/executors.md` so init installs it; `open blocker` is defined in statuses.md; the shape routing row matches any Backlog ticket with a Priority and shape step 8 resolves each failing checklist item instead of stranding the ticket; shape may cancel a failure that does not reproduce.
- Fix: gates fail closed. A proof runner error (output over the buffer, spawn failure, signal) fails `proofs-on-base` instead of counting as a failing proof; an unreadable forge diff (GitHub 406 on huge CRs) classes as guardrail instead of throwing; `vcs start` rethrows a fetch error that is not a missing ref and fast-forwards a reused change line to the remote; HTTP calls time out after 30s.
- Fix: GitHub gate templates ship `agentic-sdlc-review-event.yml` (init installs it) so approvals re-run `human-approval`; board-moving PR actions get their own non-cancelled concurrency group so a later push cannot drop the In review move.
- Skills: review-pr blocks PASS only on an Important finding and stops while a criterion is pending; implement-spec has a rework path that reopens the change line; escalate-to-human returns early only for Ruling; shape stops on a failure that does not reproduce; release waits for a trusted go-ahead between proposal and cut.
- Skills: review-pr defines Important and Nit (cap 5 Nits) and grades `manual` proofs by a trusted owner comment; escalate-to-human holds a ticket-less CR with comments on the CR and `heartbeat.ticket`.
- Fix: gate templates. `proofs-on-base` gets a forge token so it can pass; the review token moves to the trunk-only Environment `agentic-review` (jobs `human-approval`, `carry-statuses`; review events relay through `workflow_run`); signal-on-red is filtered to trunk and release lines; the GitLab trust note no longer claims environment scope protects secrets.
- Fix: the push guard finds the binding from a subdirectory or linked worktree (trunk defaults to main and master when none), and sees through `$(...)` and backticks.
- Fix: GitLab reads up to 100 commit statuses; a failed last-env deploy resets only tickets whose CRs are in the failed sha; signal-on-red no longer fails on a run outside the recent window; `vcs start` reuses an existing change line.
- Fix: skills no longer call operations no verb provides (escalate-to-human pushes only from a change line; grooming drops Done archiving); dispatch usage allows --ticket and --cr together.
- Fix: validate requires owners.factory and paths.factory; GitLab diffs carry new/deleted/rename lines; parseCloses stays on its line; init makes the pre-push hook executable.
- Operate: triage-signal gets mitigation-first and postmortem-plus-regression exit for P0 and a rule for `signal:maintenance`; shape asks for the exposure shape; the template binding adds the `maintenance` stream.
- Fix: the guard hook blocks `git push --all`, `--mirror`, `--branches` and glob refspecs; the guard now has behaviour tests.

## 2.0.0-alpha.2 (2026-11-11)

### Fixes (the reconciliation with the 2026-11-09 audit)

- Review jobs allow only the CLI and the MCP server: no git writes, no npm. `setup.sh` runs
  `npm ci --ignore-scripts` and installs an unpinned CLI into `node_modules`, so `--plugin-dir` resolves.
- The Azure `proofs-on-base` job holds no token; the PR build result is the check. The Bitbucket
  `agentic-approval` pipeline refuses to run off the trunk.
- `learning.bench_size` defaults to 20, and `validate` warns when it is below `bench_min_cases`.

## 2.0.0-alpha.1 (2026-11-10)

### Fixes

- npm 12 refuses git dependencies by default. `init` writes `allow-git=root` to the project's
  `.npmrc`, and every documented or templated `github:` install passes `--allow-git=root`.

## 2.0.0-alpha.0 (2026-11-10)

A rewrite. v2 is a skill pack, a binding and a CLI of ports and gates; your harness runs the
skills.

### Breaking changes from v1

- `agentic-sdlc-policy.json` is gone; the project binding is `.agents/binding.yml`.
- `agentic-sdlc supervise` and the TypeScript SDK are removed. A scheduler runs your harness with
  the cycle prompt, which loads the `sdlc` skill.
- The Docker sandbox is removed; each executor declares a `sandbox`.
- See "Upgrading from v1" in the README.

### Changes from the 2026-11-09 audit

Breaking within v2:

- Git only. The Mercurial and Perforce adapters, the Helix Swarm forge and their hooks are
  removed.
- `Required` is a CI job on `pull_request` with no secrets that runs `commands.install` and
  `commands.verify`. No agent posts it. `review-pr` never runs CR code; it reads `Required` and the
  new `proofs-on-base` gate from CI.
- New gate `approval` replaces `factory-class` and posts `human-approval`. A Full-lane product CR
  needs one human approval (`forge.human_approval: full-lane | always | never`, default
  `full-lane`); a `guardrail` factory CR needs the factory owner. The `factory-owner` check and
  CODEOWNERS are removed.
- Classes: any change to skill text is `guardrail`; `tuning` is only the `models` map and a
  benched skill's `metadata.tier`. `learning.auto_merge_classes` defaults to `[]`.
- Skill frontmatter: `tier` moves to `metadata: { tier }`. Scorers drop `tier`.
- The `bench` skill is removed; `improve-factory` calls the `bench` CLI. `judge-run` only grades;
  `ledger plan` and `ledger record` do the rest.
- Removed binding keys: `product.kind`, `board.milestone`. Removed MCP tool: `vcs_tag`.
- Claude Code: the package is a plugin (skills as `/agentic-sdlc:<skill>`); `init --harness
  claude` no longer copies `.claude/skills`, and adds an `@AGENTS.md` import to `CLAUDE.md`.

Added:

- `dispatch --cr` for factory CRs, with an idempotency key per ticket or CR, skill and head.
- `ledger plan`, `ledger record`, `ledger stale`, and `learning: { due, cyclesSince,
  spentWeekUsd }` in `ledger summary`.
- `board comments --trusted`; `forge approvals <n>`.
- `bench compare` needs `learning.bench_min_cases` shared cases and `learning.bench_trials`
  trials, and uses the Wilson lower bound.
- `commands.preview`: `verify-ux` drives a preview of the CR head, never a trunk environment.
- `mcp --allow approve,status`; by default the MCP server leaves those tools out.
- HTTP retries with backoff on 429 and 5xx (a POST retries only 429).
- Runner templates: Claude headless permission flags, review after the cycle, pinned installs, a
  `merge_group` trigger, a dead-man job, and a guard against `ANTHROPIC_API_KEY` on the individual
  profile.
- SECURITY.md, CONTRIBUTING.md, this changelog.

Fixed:

- The learning loop could not start: no skill could advance its counter, `dispatch` needed a
  ticket for factory work, and factory CRs were never reviewed.
- Rules stated in several places that disagreed (who proposes rules, what `skill-regression`
  checks, who writes In release, the judge's timing) now have one home each.
- Documentation errors: skill tiers, the install tag, what `init` writes, the contract layout,
  section numbering and project-specific references.
