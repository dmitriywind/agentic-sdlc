# Behaviour specs

Gherkin scenarios that state what each skill, gate, hook and `init` does, as a user can observe
it. They are the acceptance view of the [guide](../guide/1-what-it-is.md).

## How to read a scenario

```gherkin
# Source: skills/review-pr/SKILL.md, "Decide" (PASS)
# Proof: test/forge.test.ts "two identities: status and approve need review_token_env and never use the implementer token"
Scenario: PASS with two identities marks the CR ready with auto-merge
  Given a draft CR for a ticket at In review
  When the review runtime decides
  Then it posts the review status as forge.review_identity with state success
```

- `# Source:` names the file and section that hold the rule. The source wins when the two differ.
- `# Proof:` on every scenario. Either it names the one `node:test` test that proves the CLI
  mechanism behind it, or it says `skill text only`: a rule an agent follows, which `judge-run` and
  the scorers grade after each run. Every test proves at least one scenario; a test that proves none
  is deleted. The tests follow the pyramid: units for pure functions, the CLI and adapters against a
  fake process runner (`test/helpers.ts`), and one end-to-end test of the built CLI (`dist-smoke`).
- Binding values appear as keys (`cycle.min_ready`), so a scenario holds for every project.
- Tags: `@skill:<name>`, `@gate:<name>`, `@cli:<verb>`.

## Files

| File | Covers |
|---|---|
| [routing-and-cycle](routing-and-cycle.feature) | `sdlc`: routing, one cycle, the hold, idempotent dispatch |
| [triage-signal](triage-signal.feature) | `triage-signal` |
| [backlog-grooming](backlog-grooming.feature) | `backlog-grooming` |
| [shape](shape.feature) | `shape` |
| [implement-spec](implement-spec.feature) | `implement-spec` |
| [review-pr](review-pr.feature) | `review-pr` |
| [verify-ux](verify-ux.feature) | `verify-ux` |
| [escalate-to-human](escalate-to-human.feature) | `escalate-to-human` |
| [release](release.feature) | `release` |
| [self-improvement](self-improvement.feature) | `judge-run`, `improve-factory`, the ledger and the bench |
| [gate-branch-names](gate-branch-names.feature) | `gate branch-names` and the pre-push check |
| [gate-linkage](gate-linkage.feature) | `gate ticket-linkage` |
| [gate-approval](gate-approval.feature) | `gate human-approval` |
| [gate-merged](gate-merged.feature) | `gate merged` on the trunk push |
| [gate-proofs-on-base](gate-proofs-on-base.feature) | `gate proofs-on-base` |
| [gate-shipped](gate-shipped.feature) | `gate shipped`, tags and rollback |
| [gate-signal-on-red](gate-signal-on-red.feature) | `gate signal-on-red` |
| [gate-skill-regression](gate-skill-regression.feature) | `gate skill-regression` |
| [push-guard](push-guard.feature) | the plugin guard hook and the pre-push hook |
| [install-and-binding](install-and-binding.feature) | `init`, `validate`, `doctor`, binding rules |

## Keep them current

A change to what a skill, gate, hook or `init` does changes its feature file in the same commit
(see `AGENTS.md`). Delete a scenario whose rule is gone; never leave it as history.
