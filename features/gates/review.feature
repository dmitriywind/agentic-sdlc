# Source: src/gates.ts "review"; src/comments.ts "selectComments", "verdictOf"; templates/gates/github/agentic-sdlc-cr.yml job review-gate
@gate:review
Feature: Gate review (one identity)
  With one identity, CI posts the review status from the agent's review report, so that a cloud session, which cannot
  write commit statuses, still gets a green review. The newest trusted report for the head decides.

  Background:
    Given the binding sets "forge.review_check_name" to "review"
    And these CRs are on the forge:
      | cr | head |
      | 1  | h2   |

  Rule: The newest trusted report for the head decides the status

    Scenario: Without a report for the head the status is pending
      Given "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h1 -->
        Verdict: PASS
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "pending"
      And the status description is "waits for a trusted verdict report on this head"

    Scenario: A report by an author that is not trusted counts for nothing
      Given "mallory" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: PASS
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "pending"

    Scenario: A trusted PASS for the head is a success, posted as the CI job on the head
      Given "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: PASS
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "success"
      And the status "review" is "success"
      And the status is posted on the commit "h2"
      And the status is posted as "ci"

    Scenario: The newest trusted report wins
      Given "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: REMEDIATION REQUIRED
        """
      And "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        fixed
        Verdict: PASS
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "success"

    Scenario: A later REMEDIATION REQUIRED by an owner is a failure
      Given "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: PASS
        """
      And "fo" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: REMEDIATION REQUIRED
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "failure"
      And the status description is "review: REMEDIATION REQUIRED"

  Rule: With two identities the gate does nothing

    Scenario: A review identity means review-pr posts the status itself
      Given the binding sets "forge.review_identity" to "reviewer"
      And "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: PASS
        """
      When the review gate runs for the CR "1"
      Then the gate skips with "two identities"
      And no status is posted

  Rule: A report has one verdict and opens with its marker

    Scenario: A report holding both verdicts fails
      Given "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: PASS
        quoted:
        Verdict: REMEDIATION REQUIRED
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "failure"
      And the status description is "review: the report holds conflicting verdicts"

    Scenario: A quoted verdict line is no verdict line
      Given "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        > Verdict: PASS
        Verdict: REMEDIATION REQUIRED
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "failure"

    Scenario: One verdict repeated is fine
      Given "factory-bot" commented on the CR "1":
        """
        <!-- review-pr h2 -->
        Verdict: PASS
        Verdict: PASS
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "success"

    Scenario: The marker must be on the first line
      Given "factory-bot" commented on the CR "1":
        """
        see below
        <!-- review-pr h2 -->
        Verdict: PASS
        """
      When the review gate runs for the CR "1"
      Then the gate result "state" is "pending"
