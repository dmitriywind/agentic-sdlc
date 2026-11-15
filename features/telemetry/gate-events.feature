# Source: src/telemetry.ts "deployEvent", "changeMergedEvent", "emitGateEvent", "GATE_TELEMETRY_DEADLINE_MS"; src/gates.ts "cli" (merged, shipped)
@cli:gate
Feature: CDEvents posted by the gates
  With a CDEvents sink in the binding, `gate shipped` posts a service event for the deploy and `gate merged` posts a
  change merged event. A gate never fails on its telemetry: a failed send writes one line to stderr, and that line never
  shows the sink URL.

  Background:
    Given the telemetry sinks are configured for the repository "acme/app"
    And the project ships to the environments "staging, production"

  Rule: A deploy result is posted as a service CDEvent

  Rule: A merge is posted as a change merged CDEvent

  Rule: A failed send writes one line and never fails the gate

    Scenario: A failing sink does not fail the shipped gate
      Given the sink fails with "POST sink.example -> 500: down"
      When I run "gate shipped staging --sha abc --result rolled-back" against the recording sink
      Then the exit code is 0
      And the JSON result "result" is "rolled-back"
      And the error output is the single line "telemetry: CDEvent not sent: POST sink.example -> 500: down"

  Rule: A gate waits a bounded time for its telemetry

    Scenario: The wait is 5 seconds in total
      Then the gate waits at most 5000 ms for its telemetry

    Scenario: A sink that does not answer is tried once and given up on at the deadline
      Given the sink never answers
      When the gate posts its change merged event and waits at most 20 ms
      Then the error output is the single line "telemetry: CDEvent not sent: no answer within 20 ms"
      And the sink was asked once, with one try and a limit of 20 ms
