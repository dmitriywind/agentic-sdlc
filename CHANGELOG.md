# Changelog

All notable changes to this package. Versions follow semver. A release is a `v<version>` Git tag; the package is
not on npm.

## Unreleased

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
