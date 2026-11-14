# Owner: skills/judge-run/SKILL.md, skills/improve-factory/SKILL.md, references/architecture.md (section 6). The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:judge-run @skill:improve-factory
Feature: Judge runs and improve the factory
  As the Factory owner
  I want runs graded by an independent model and one proven change proposed at a time
  So that the factory improves from evidence and I approve every rule change

  # Source: references/architecture.md, "6. The self-improvement loop", item 3 (Judge)
  Scenario: The judge model is independent of the run
    Given a run used a model
    When "dispatch judge-run --run-model <m>" runs
    Then it picks models[learning.judge_tier]
    And it picks the next tier when that model is the run's own model
    And it prints { skip: true } when no independent model exists

  # Source: skills/judge-run/SKILL.md, "Steps"
  Scenario: A judge grades each planned scorer and records the scores
    Given "ledger plan --run <id>" printed the scorers, the evidence refs and the hard-fact cap
    When the judge grades the run
    Then scores.json holds a value and a reason for every planned scorer
    And each reason cites a path:line, a comment link, a check name or a trace line
    And "ledger record --run <id> --file scores.json" validates the names and scales
    And it posts the "<!-- scores -->" comment

  # Source: skills/judge-run/SKILL.md, "Rules"; references/architecture.md, "6. The self-improvement loop", item 3
  Scenario: A hard fact caps the score and only a human grade overrides the cap
    Given the run has a hard fact such as a red check or a send-back
    When the scores are recorded
    Then the cap applies to the score
    And the judge does not argue against the cap
    And a human grade by owners.product or owners.factory wins over the judge

  # Source: skills/improve-factory/SKILL.md, "Steps 1. Due"
  Scenario: The loop stops when it is not due
    Given "ledger summary" shows learning.due is false, which it always is unless learning.enabled is true
    When improve-factory runs
    Then it writes "learning: not due" in the heartbeat "did"
    And it stops

  # Source: skills/improve-factory/SKILL.md, "Steps 2. Last proposal"
  Scenario: An open proposal blocks a new one
    Given learning.lastProposal is open
    When improve-factory runs
    Then it checks the CR of that proposal
    And it sets the state to merged, rejected or closed
    And it proposes nothing new until no proposal is open

  # Source: skills/improve-factory/SKILL.md, "Steps 4. Pick one target"
  Scenario: The target needs repeated evidence on two tickets
    Given a failure cluster has fewer runs than learning.min_evidence_runs, or the same mistake appears on only one ticket
    When improve-factory picks a target
    Then it writes "learning: no target"
    And it stops

  # Source: skills/improve-factory/SKILL.md, "Steps 5. Find the cause"
  Scenario: A product cause becomes a Signal
    Given the cause of the failure is in the product, not the factory
    When improve-factory finds the cause
    Then it creates a ticket at Signals with "board create --status Signals"
    And it makes no factory change

  # Source: skills/improve-factory/SKILL.md, "Steps 7. Prove on the bench"
  Scenario: A change that is not proven is not proposed
    Given the bench compare does not exit 0
    When improve-factory checks the proof
    Then it writes "learning: not proven" with the compare JSON
    And it opens no CR

  # Source: references/architecture.md, "6. The self-improvement loop", item 6 (Prove)
  Scenario: Too few cases count as regressed
    Given the shared cases are fewer than learning.bench_min_cases, or the trials per case are fewer than learning.bench_trials
    When "bench compare" runs
    Then the result is regressed

  # Source: skills/improve-factory/SKILL.md, "Steps 8. Open the draft CR" and "Rules"
  Scenario: One change goes into one draft factory CR
    Given the change is proven on the bench
    When improve-factory opens the CR
    Then the CR is a draft
    And the body holds the target with its count, the cause with run links, the class and the compare JSON
    And improve-factory never marks the CR ready and never merges it
    And the CR holds one change only

  # Source: skills/improve-factory/SKILL.md, "Rules" (merge classes); references/architecture.md, "6. The self-improvement loop", item 5
  Scenario Outline: The class decides who merges
    Given the change is <change>
    When the approval gate classifies the CR
    Then the class is <class>
    And the merge waits for <merge>

    Examples:
      | change                                                  | class     | merge                                                           |
      | only the models map                                     | tuning    | the agent review, when tuning is in learning.auto_merge_classes |
      | skill text, scorers, gates, binding, executors or bench | guardrail | an approving review by owners.factory                           |

  # Source: skills/improve-factory/SKILL.md, "Rules"
  Scenario: The loop never edits what grades it in the same CR
    Given a change touches judge-run, a scorer, a bench case, a suite or the ledger
    When improve-factory prepares the CR
    Then that change is its own guardrail CR
