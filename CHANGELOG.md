# Changelog

All notable changes to this package. Versions follow semver. A release is a `v<version>` Git tag; the package is
not on npm.

## Unreleased

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
