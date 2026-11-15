# Owner: skills/review-pr/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:review-pr
Feature: Review a change request
  As the factory
  I want a fresh reviewer to grade a CR against its ticket and spec
  So that only a proven, correct CR is marked ready and auto-merged

  # Source: skills/review-pr/SKILL.md, "Send back"
  # Proof: skill text only
  Scenario: Findings on a CR a person opened go back to that person
    Given a CR opened by an author outside owners.bots
    And the review finds an Important finding
    When the reviewer decides
    Then the reviewer runs "forge draft <n>"
    And the ticket stays In review
    And the reviewer pushes nothing to the change line
    And the reviewer reviews again when the CR head changes

  # Source: skills/review-pr/SKILL.md, "Report" and "Send back"
  # Proof: skill text only
  Scenario: An Important finding sends the ticket back
    Given a product CR with a criterion graded NOT DONE
    When the reviewer decides
    Then the report starts with "<!-- review-pr <head sha> -->"
    And the verdict is REMEDIATION REQUIRED
    And the reviewer posts no approval
    And, below "cycle.max_rework" such reports on the CR, the ticket moves to In progress for implement-spec

  # Source: skills/review-pr/SKILL.md, "Report"
  # Proof: skill text only
  Scenario: A Nit never blocks PASS
    Given the only findings are Nits
    And every hunt line is a Nit and not a bug
    When the reviewer decides
    Then the report lists the Nits, at most 5
    And the verdict is PASS

  # Source: skills/review-pr/SKILL.md, "Spec pass"
  # Proof: skill text only
  Scenario: A manual criterion waits for an owner
    Given a criterion with proof manual
    And no trusted owner comment confirms it for this head
    When the reviewer runs the spec pass
    Then the reviewer posts one ask on the ticket that names the criterion and the head sha
    And the criterion is PENDING and is not a finding
    And the CR stays draft
    And the reviewer posts no report, no status and no approval

  # Source: skills/review-pr/SKILL.md, "CI results"
  # Proof: skill text only
  Scenario: A pending or missing check stops the review
    Given a required check is pending on the head
    When the reviewer reads the CI results
    Then the reviewer stops with no report and reviews again on the next run
    And the pending check is not a finding
    And on a draft CR a check missing for longer than stall_minutes after the CR's pushedAt calls escalate-to-human once with the Access trigger

  # Source: skills/review-pr/SKILL.md, "Decide" (PASS)
  # Proof: test/guard.test.ts "forge approve is for the review role only"
  Scenario: No review token means no approval
    Given forge.options.review_token_env is unset
    When the reviewer tries to post the status and the approval
    Then both fail
    And the reviewer calls escalate-to-human with the Access trigger
    And the reviewer posts nothing else

  # Source: skills/review-pr/SKILL.md, intro paragraph and "Send back"
  # Proof: skill text only
  Scenario: A factory CR is graded without a ticket
    Given a draft CR dispatched with --cr
    And only paths.factory changed
    When the reviewer reviews it
    Then the reviewer reads no ticket
    And it grades the CR's stated target, cause and proof
    And a finding keeps the CR draft with the report on the CR

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  # Proof: skill text only
  Scenario: A pending human approval is not a stalled check
    Given a ready CR whose "human-approval" status is pending for longer than stall_minutes
    And every other required check is green
    When the reviewer checks for red or stalled gates
    Then the CR stays ready
    And the reviewer files no Signal and no escalation

  # Source: skills/review-pr/SKILL.md, "CI results" and "Red or stalled gate"
  # Proof: skill text only
  Scenario: A red check on a draft CR sends the work back
    Given a draft CR opened by the factory whose "Required" check is red
    When the reviewer reads the CI results
    Then it reads the failing check
    And with the cause in the diff, the ticket moves to In progress with the cause

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  # Proof: skill text only
  Scenario: A ready CR with a check that never reported is escalated, not sent back
    Given a ready CR whose required check "Required" is missing for longer than stall_minutes after the CR's pushedAt
    When the reviewer checks for red or stalled gates
    Then the CR stays ready
    And the reviewer calls escalate-to-human once with the Access trigger, naming the check

  # Source: skills/review-pr/SKILL.md, "Report"
  # Proof: skill text only
  Scenario: A deviation written back into the spec is not a finding
    Given a criterion graded DEVIATED
    And the spec comment was updated to match the change
    When the reviewer writes the report
    Then the criterion grades as DONE
    And it is neither a finding nor a Nit

  # Source: skills/review-pr/SKILL.md, "Spec pass"
  # Proof: skill text only
  Scenario: Only a bot's verify-ux comment is evidence
    Given a criterion with proof computer-use
    And a "<!-- verify-ux -->" comment for this head by an account outside owners.bots
    When the reviewer grades the criterion
    Then the reviewer ignores that comment
    And with no verify-ux comment by a bot after stall_minutes, the reviewer calls escalate-to-human once with the Access trigger

  # Source: skills/review-pr/SKILL.md, "Once per head"
  # Proof: skill text only
  Scenario: A head that already has a report is not reviewed again
    Given the newest review-pr report is for the current head
    And no trusted comment came after it
    When review-pr runs
    And the CR is a draft
    When review-pr runs
    Then it posts nothing and stops
    Given that report is a red-gate note whose "Signal: <id>" ticket is now closed
    Then review-pr reviews the draft CR from step 1
    Given the CR is ready
    Then review-pr is not stopped by the report: it continues at the step for the CR's state

  # Source: skills/review-pr/SKILL.md, "Send back"
  # Proof: skill text only
  Scenario: The rework cap sends the ticket to a human
    Given a product CR opened by the factory has findings
    And the trusted REMEDIATION REQUIRED reports on it, this one included, number "cycle.max_rework" or more
    When the reviewer decides
    Then the ticket does not move to In progress
    And the CR is draft
    And the reviewer calls escalate-to-human with the Repeat trigger and the count

  # Source: skills/review-pr/SKILL.md, "Behind the trunk"
  # Proof: skill text only
  Scenario: The factory never pushes a sync onto a person's CR
    Given a ready CR a person opened is behind the trunk
    When review-pr handles it
    Then it posts one comment asking the author to update the CR
    And it runs no "forge sync"
