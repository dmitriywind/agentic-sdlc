# Source: src/dispatch.ts "cli" (review/review, REVIEW_FIRE_ENV); docs/forges.md "Review identity and approval"
@cli:dispatch
Feature: The review step runs in the review runtime when a review identity is set
  With a review identity the review runs in its own runtime. Outside it, dispatch starts nothing locally: it runs the
  fire command the cycle's environment holds, or leaves the start to the runner's job dependency. Inside the review
  runtime, and with no identity, review/review is an ordinary step. The start record's `via` says which.

  Background:
    Given the installed skill pack
    And the binding has "forge.review_identity" set to the JSON '"rev-bot"'

  Rule: Outside the review runtime a review identity fires the review run

    Scenario: With a fire command it runs once, with the review token kept out of its environment
      Given the runner sets "AGENTIC_REVIEW_FIRE_CMD" to 'curl -fsS -X POST https://x/fire -H "Authorization: Bearer $REVIEW_FIRE_TOKEN"'
      And the runner sets "REVIEW_FIRE_TOKEN" to "t"
      And the runner sets "AGENTIC_REVIEW_TOKEN" to "secret"
      And the runner sets "PATH" to "/bin"
      When dispatch runs "review/review --cr 3 --unattended"
      Then the result "kind" is "fire"
      And the result "via" is "review-runtime"
      And the result "key" is "3-review/review"
      And the command line mentions "https://x/fire"
      And the child environment holds "REVIEW_FIRE_TOKEN" as "t"
      And the child environment has no "AGENTIC_REVIEW_TOKEN"
