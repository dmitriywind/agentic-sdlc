# Owner: skills/judge-run/SKILL.md, skills/improve-factory/SKILL.md, references/architecture.md (section 6). The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:judge-run @skill:improve-factory
Feature: Judge runs and improve the factory
  As the Factory owner
  I want runs graded by an independent model and one proven change proposed at a time
  So that the factory improves from evidence and I approve every rule change

  # Source: skills/improve-factory/SKILL.md, "Steps 2. Last proposal"
  # Proof: skill text only
  Scenario: An open proposal blocks a new one
    Given learning.lastProposal is open
    When improve-factory runs
    Then it checks the CR of that proposal
    And it sets the state to merged, rejected or closed
    And it proposes nothing new until no proposal is open

  # Source: skills/improve-factory/SKILL.md, "Steps 4. Pick one target"
  # Proof: skill text only
  Scenario: The target needs repeated evidence on two tickets
    Given a failure cluster has fewer runs than learning.min_evidence_runs, or the same mistake appears on only one ticket
    When improve-factory picks a target
    Then it writes "learning: no target"
    And it stops

  # Source: skills/improve-factory/SKILL.md, "Steps 5. Find the cause"
  # Proof: skill text only
  Scenario: A product cause becomes a Signal
    Given the cause of the failure is in the product, not the factory
    When improve-factory finds the cause
    Then it creates a ticket at Signals with "board create --status Signals"
    And it makes no factory change

  # Source: skills/improve-factory/SKILL.md, "Steps 7. Prove on the bench"
  # Proof: skill text only
  Scenario: A change that is not proven is not proposed
    Given the bench compare does not exit 0
    When improve-factory checks the proof
    Then it writes "learning: not proven" with the compare JSON
    And it opens no CR

  # Source: skills/improve-factory/SKILL.md, "Steps 8. Open the draft CR" and "Rules"
  # Proof: skill text only
  Scenario: One change goes into one draft factory CR
    Given the change is proven on the bench
    When improve-factory opens the CR
    Then the CR is a draft
    And the body holds the target with its count, the cause with run links, the class and the compare JSON
    And improve-factory never marks the CR ready and never merges it
    And the CR holds one change only

  # Source: skills/improve-factory/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: The loop never edits what grades it in the same CR
    Given a change touches judge-run, a scorer, a bench case, a suite or the ledger
    When improve-factory prepares the CR
    Then that change is its own guardrail CR

  # Source: scorers/spec-quality.md, scorers/triage-accuracy.md
  # Proof: skill text only
  Scenario: Shape and triage runs have scorers
    Given a run of "shape" or "triage-signal"
    When "ledger plan --run <id>" lists its scorers
    Then "spec-quality" applies to shape and "triage-accuracy" to triage-signal
    And the evidence names the ticket, since the run has no CR
