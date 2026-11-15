# Source: src/telemetry.ts "deployEvent", "changeMergedEvent", "emitGateEvent", "GATE_TELEMETRY_DEADLINE_MS"; src/gates.ts "cli" (merged, shipped)
@cli:gate
Feature: CDEvents posted by the gates
  With a CDEvents sink in the binding, `gate shipped` posts a service event for the deploy and `gate merged` posts a
  change merged event. A gate never fails on its telemetry: a failed send writes one line to stderr, and that line never
  shows the sink URL.

  Background:
    Given the telemetry sinks are configured for the repository "acme/app"
    And the project ships to the environments "staging, production"

  Rule: A failed send writes one line and never fails the gate

    Scenario: A failing sink does not fail the shipped gate
      Given the sink fails with "POST sink.example -> 500: down"
      When I run "gate shipped staging --sha abc --result rolled-back" against the recording sink
      Then the exit code is 0
      And the JSON result "result" is "rolled-back"
      And the error output is the single line "telemetry: CDEvent not sent: POST sink.example -> 500: down"
