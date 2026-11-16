# Source: src/dispatch.ts "cli" (idempotency, claim, re-read after the claim); skills/sdlc/references/contract.md
@cli:dispatch
Feature: A dispatch starts one run per key
  Before an executor starts, dispatch posts a marker comment for the run's key. A marker by a trusted bot inside
  cycle.dedupe_minutes means the same dispatch already started: a double fire. A run that has not posted its own done
  line blocks a second start until stall_minutes. A finished run never blocks.

  Background:
    Given the installed skill pack
    And the local board holds a ticket at Ready as ticket 1 and the heartbeat ticket 2
    And the dedupe window is "10" minutes

  Rule: A double fire is skipped

    Scenario: The same step on the same ticket inside the window is skipped
      Given dispatch runs "build --ticket 1"
      When dispatch runs "build --ticket 1"
      Then the result "skipped" is "true"

  Rule: A change request and the factory use the heartbeat ticket

    Scenario: The same change request head inside the window is skipped
      Given the forge is GitHub and shows the change request 9 on the head "crsha"
      And dispatch runs "learn/improve --cr 9"
      When dispatch runs "learn/improve --cr 9"
      Then the result "skipped" is "true"

  Rule: A finished run never blocks a re-run

    Scenario: After its done line a re-run inside the window starts
      Given dispatch runs "review/review --ticket 1"
      And the comment "<!-- agentic-sdlc:done 1-review/review -->" is posted on the ticket "1"
      When dispatch runs "review/review --ticket 1"
      Then the result "kind" is "harness"
      And the result "instruction" contains "its dispatch key is 1-review/review"

  Rule: A run that has not finished blocks a second start until stall_minutes

    Scenario: An unfinished run older than the window but inside stall_minutes is not started twice
      Given the binding has "stall_minutes" set to the JSON "60"
      And dispatch runs "build --ticket 1"
      And the comments of the ticket "1" are 30 minutes old
      When dispatch runs "build --ticket 1"
      Then the result "skipped" is "true"
      And the result "reason" is "the previous run has not finished"

    Scenario: An unfinished run older than stall_minutes is started again
      Given the binding has "stall_minutes" set to the JSON "60"
      And dispatch runs "build --ticket 1"
      And the comments of the ticket "1" are 90 minutes old
      When dispatch runs "build --ticket 1"
      Then the result "kind" is "harness"


  Rule: A cycle lock dies with its time budget

    Scenario: An unended cycle claim older than time_budget_minutes does not block the next cycle
      Given the binding has "stall_minutes" set to the JSON "600"
      And the binding has "cycle.time_budget_minutes" set to the JSON "45"
      And dispatch runs "sdlc --ticket 2"
      And the comments of the ticket "2" are 60 minutes old
      When dispatch runs "sdlc --ticket 2"
      Then the result "kind" is "claim"

    Scenario: A cycle that ended with its done line does not block the next cycle
      Given dispatch runs "sdlc --ticket 2"
      And the comment "<!-- agentic-sdlc:done 2-sdlc -->" is posted on the ticket "2"
      When dispatch runs "sdlc --ticket 2"
      Then the result "kind" is "claim"

    Scenario: A cycle that posted its heartbeat but not its done line does not block the next cycle
      Given dispatch runs "sdlc --ticket 2"
      And the comment '<!-- heartbeat -->\n{"kind":"cycle","runs":[],"errors":[],"did":["idle"]}' is posted on the ticket "2"
      When dispatch runs "sdlc --ticket 2"
      Then the result "kind" is "claim"
