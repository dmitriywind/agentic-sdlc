# Owner: src/gates.ts, templates/gates/github/agentic-sdlc-cr.yml. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:review
Feature: Gate review (one identity)
  As a solo owner whose factory acts as my own account
  I want CI to post the review status from the agent's review report
  So that a cloud session, which cannot write commit statuses, still gets a green review

  # Source: src/gates.ts, "review"; templates/gates/github/agentic-sdlc-cr.yml, job review-gate
  # Proof: test/gates.test.ts "gate review: with one identity the newest trusted review-pr report for the head becomes the review status, posted as ci"
  Scenario: The newest trusted report on the head decides the review status
    Given forge.review_identity is empty
    When a comment that starts with "<!-- review-pr <head sha>" is posted on the CR
    Then the review-gate job runs "agentic-sdlc gate review --cr <n>" with the CI job's token
    And the status is success when the newest report on the head by a trusted author says "Verdict: PASS"
    And it is failure when that report says "REMEDIATION REQUIRED"
    And it is pending when no trusted report is for the head
    And a report by an untrusted author or for an older head counts for nothing

  # Source: src/gates.ts, "review"
  # Proof: test/gates.test.ts "gate review: with one identity the newest trusted review-pr report for the head becomes the review status, posted as ci"
  Scenario: With two identities the gate does nothing
    Given forge.review_identity is set
    When the gate runs
    Then it posts no status, since review-pr posts it as the review identity
