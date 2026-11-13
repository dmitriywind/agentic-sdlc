# Behaviour specs

Gherkin scenarios that state what each skill, gate, hook and `init` does, as a user can observe
it. They are the acceptance view of the [use cases](../use-cases.md).

## How to read a scenario

```gherkin
# Source: skills/review-pr/SKILL.md, "Decide" (PASS)
# Proof: test/forge.test.ts "status and approve need review_token_env and never use the implementer token"
Scenario: PASS marks the CR ready with auto-merge
  Given a draft CR for a ticket at In review
  When the review runtime decides
  Then it posts the review status as forge.review_identity with state success
```

- `# Source:` names the file and section that hold the rule. The source wins when the two differ.
- `# Proof:` names the `node:test` test that proves the CLI mechanism behind the scenario. A
  scenario without a Proof line is a rule that an agent follows; `judge-run` and the scorers grade
  it after each run, not a unit test.
- Binding values appear as keys (`cycle.min_ready`), so a scenario holds for every project.
- Tags: `@skill:<name>`, `@gate:<name>`, `@cli:<verb>`.

## Files

| File | Covers | Use cases |
|---|---|---|
| [routing-and-cycle](routing-and-cycle.feature) | `sdlc`: routing, one cycle, the hold, idempotent dispatch | all |
| [triage-signal](triage-signal.feature) | `triage-signal` | UC-06, UC-07, UC-14, UC-18 |
| [backlog-grooming](backlog-grooming.feature) | `backlog-grooming` | UC-04, UC-05, UC-18 |
| [shape](shape.feature) | `shape` | UC-08 |
| [implement-spec](implement-spec.feature) | `implement-spec` | UC-09 |
| [review-pr](review-pr.feature) | `review-pr` | UC-10, UC-11 |
| [verify-ux](verify-ux.feature) | `verify-ux` | UC-10 |
| [escalate-to-human](escalate-to-human.feature) | `escalate-to-human` | UC-12 |
| [release](release.feature) | `release` | UC-13, UC-14 |
| [self-improvement](self-improvement.feature) | `judge-run`, `improve-factory`, the ledger and the bench | UC-16 |
| [gate-branch-names](gate-branch-names.feature) | `gate branch-names` and the pre-push check | UC-19 |
| [gate-linkage](gate-linkage.feature) | `gate ticket-linkage` | UC-10 |
| [gate-approval](gate-approval.feature) | `gate human-approval` | UC-10, UC-11, UC-17 |
| [gate-board-sync](gate-board-sync.feature) | `gate board-sync` | UC-10 |
| [gate-proofs-on-base](gate-proofs-on-base.feature) | `gate proofs-on-base` | UC-10 |
| [gate-shipped](gate-shipped.feature) | `gate shipped`, tags and rollback | UC-13, UC-15 |
| [gate-signal-on-red](gate-signal-on-red.feature) | `gate signal-on-red` | UC-15 |
| [gate-skill-regression](gate-skill-regression.feature) | `gate skill-regression` | UC-16, UC-17 |
| [push-guard](push-guard.feature) | the plugin guard hook and the pre-push hook | UC-19 |
| [install-and-binding](install-and-binding.feature) | `init`, `validate`, `doctor`, binding rules | UC-01, UC-02 |

## Keep them current

A change to what a skill, gate, hook or `init` does changes its feature file in the same commit
(see `AGENTS.md`). Delete a scenario whose rule is gone; never leave it as history.
