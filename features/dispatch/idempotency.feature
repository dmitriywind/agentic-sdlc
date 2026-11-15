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

    Scenario: The same key inside the dedupe window is skipped
      When dispatch runs "build --ticket 1"
      And dispatch runs "build --ticket 1"
      Then the result "skipped" is "true"
      And the result "reason" is "double fire"

    Scenario: The key is the subject and the step, and the marker goes on the ticket
      When dispatch runs "build --ticket 1"
      Then the result "key" is "1-build"
      And the result "tier" is "deep"
      And the ticket "1" holds a comment starting with "<!-- agentic-sdlc:dispatch 1-build -->"

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

    Scenario: A change request's key carries its head, and its marker goes on the heartbeat ticket
      Given the forge is GitHub and shows the change request 9 on the head "crsha"
      When dispatch runs "learn/improve --cr 9"
      Then the result "key" is "9-learn/improve-crsha"
      And the ticket "2" holds a comment starting with "<!-- agentic-sdlc:dispatch 9-learn/improve-crsha -->"

    Scenario: The same change request head inside the window is skipped
      Given the forge is GitHub and shows the change request 9 on the head "crsha"
      And dispatch runs "learn/improve --cr 9"
      When dispatch runs "learn/improve --cr 9"
      Then the result "skipped" is "true"

    Scenario: With no ticket and no change request the key is the factory's
      Given dispatch runs "learn/improve"
      Then the result "key" is "factory-learn/improve"

    Scenario: The factory's dispatch is skipped inside the window too
      Given dispatch runs "learn/improve"
      When dispatch runs "learn/improve"
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

    Scenario: Past the double-fire window the previous run still blocks
      Given dispatch runs "build --ticket 1"
      And a moment passes
      When dispatch runs "build --ticket 1"
      Then the result "skipped" is "true"
      And the result "reason" is "the previous run has not finished"

    Scenario: Only the run's own done line ends the block
      Given dispatch runs "build --ticket 1"
      And the comment "a closing comment of another run" is posted on the ticket "1"
      And a moment passes
      When dispatch runs "build --ticket 1"
      Then the result "reason" is "the previous run has not finished"

    Scenario: The run's own done line lets the next dispatch start
      Given dispatch runs "build --ticket 1"
      And the run posts its done line on the ticket "1"
      And a moment passes
      When dispatch runs "build --ticket 1"
      Then the result "kind" is "harness"

    Scenario: On the heartbeat ticket another run's comment does not end learn/improve
      Given dispatch runs "learn/improve"
      And a moment passes
      And the comment "<!-- heartbeat -->\nanother run" is posted on the ticket "2"
      When dispatch runs "learn/improve"
      Then the result "reason" is "the previous run has not finished"

    Scenario: On the heartbeat ticket the run's own done line ends the block
      Given dispatch runs "learn/improve"
      And the run posts its done line on the ticket "2"
      And a moment passes
      When dispatch runs "learn/improve"
      Then the result "kind" is "harness"

  Rule: The cycle claims itself with dispatch sdlc

    Scenario: sdlc posts a marker only and passes no executor check
      Given the executor "default" is '{"kind":"bogus"}'
      When dispatch runs "sdlc --ticket 2 --unattended"
      Then the exit code is 0
      And the result "kind" is "claim"
      And the ticket "2" holds a comment starting with "<!-- agentic-sdlc:dispatch 2-sdlc -->"

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
