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
