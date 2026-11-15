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

    Scenario: Another step is another key
      Given dispatch runs "build --ticket 1"
      When dispatch runs "review/review --ticket 1"
      Then the result "kind" is "harness"
      And the result "key" is "1-review/review"

    Scenario: A marker by an author the binding does not trust never skips
      Given dispatch runs "build --ticket 1"
      And the trusted bots are "someone-else"
      When dispatch runs "build --ticket 1"
      Then the result "kind" is "harness"

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

  Rule: An unfinished run blocks until stall_minutes

    Background:
      Given the dedupe window is "0.0001" minutes
      And a run may stay unfinished for 60 minutes

    Scenario: Only the run's own done line ends the block
      Given dispatch runs "build --ticket 1"
      And the comment "a closing comment of another run" is posted on the ticket "1"
      And a moment passes
      When dispatch runs "build --ticket 1"
      Then the result "reason" is "the previous run has not finished"

  Rule: The cycle claims itself with dispatch sdlc

  Rule: A failed start writes the done line

    Scenario: An executor that cannot start leaves the done line of its key
      Given the executor "plan/triage" is '{"kind":"webhook","url_env":"NOPE"}'
      When dispatch runs "plan/triage --ticket 1"
      Then the exit code is 1
      And the ticket "1" holds a comment starting with "<!-- agentic-sdlc:done 1-plan/triage -->"

  Rule: Two overlapping cycles start one run

    Scenario: Both post a marker and only the earliest starts the run
      When two cycles run "review/review --ticket 1" and "review/review --ticket=1" at the same time
      Then exactly 1 of the cycles printed a skip and 1 printed a start with the kind "harness"
