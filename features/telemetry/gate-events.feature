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

    Scenario: A successful deploy is a service deployed event with the environment and the artifact
      When I run "gate shipped staging --sha abc --result success --version 1.0" against the recording sink
      Then the exit code is 0
      And the sink received 1 requests
      And request 1 was a POST to "https://sink.example/events"
      And request 1 has these headers:
        | header  | value                                |
        | ce-type | dev.cdevents.service.deployed.0.3.0  |
      And the body of request 1 has these values:
        | path                           | value                            |
        | subject.id                     | service/app                      |
        | subject.content.environment.id | staging                          |
        | subject.content.artifactId     | pkg:generic/acme/app@1.0         |

    Scenario: A rolled-back deploy is a service rolledback event, with the sha as the version
      When I run "gate shipped staging --sha abc123 --result rolled-back" against the recording sink
      Then the sink received 1 requests
      And request 1 has these headers:
        | header  | value                                  |
        | ce-type | dev.cdevents.service.rolledback.0.3.0  |
      And the body of request 1 has these values:
        | path                       | value                      |
        | subject.content.artifactId | pkg:generic/acme/app@abc123 |

    Scenario: A failed deploy has no CDEvent
      When I run "gate shipped staging --sha abc --result failure" against the recording sink
      Then the exit code is 0
      And the sink received 0 requests

    Scenario: Without telemetry keys nothing is posted and nothing is said
      Given the binding has no "telemetry"
      When I run "gate shipped staging --sha abc --result success" against the recording sink
      Then the exit code is 0
      And the sink received 0 requests
      And the error output is empty

    Scenario: Without forge.options.repo the service has no name, so no event is built
      Given the binding has no "forge.options.repo"
      When I run "gate shipped staging --sha abc --result success" against the recording sink
      Then the exit code is 0
      And the sink received 0 requests
      And the error output says "forge.options.repo is unset"

  Rule: A merge is posted as a change merged CDEvent

    Scenario: The change merged event names the CR and the repository
      When the gate posts the change merged event of CR "12"
      Then the sink received 1 requests
      And request 1 has these headers:
        | header     | value                                |
        | ce-type    | dev.cdevents.change.merged.0.3.0     |
        | ce-subject | 12                                   |
      And the body of request 1 has these values:
        | path                          | value                       |
        | subject.content.repository.id | acme/app                    |

  Rule: A failed send writes one line and never fails the gate

    Scenario: A failing sink does not fail the shipped gate
      Given the sink fails with "POST sink.example -> 500: down"
      When I run "gate shipped staging --sha abc --result rolled-back" against the recording sink
      Then the exit code is 0
      And the JSON result "result" is "rolled-back"
      And the error output is the single line "telemetry: CDEvent not sent: POST sink.example -> 500: down"

    Scenario: Only the first line of the failure is written
      Given the sink fails with "POST sink.example -> 503: down\nsecond line"
      When the gate posts the change merged event of CR "1"
      Then the error output is the single line "telemetry: CDEvent not sent: POST sink.example -> 503: down"

    Scenario: An env var that is empty is one line too
      Given the telemetry variable "SINK" holds ""
      When the gate posts the change merged event of CR "1"
      Then the sink received 0 requests
      And the error output is the single line "telemetry: CDEvent not sent: telemetry: env var SINK is empty"

    Scenario: The sink URL is never in the line
      Given the sink fails with "connect failed to https://sink.example/events?token=abc"
      When the gate posts the change merged event of CR "1"
      Then the error output is the single line "telemetry: CDEvent not sent: connect failed to <url>"

    Scenario: A sink URL with credentials is refused without showing it
      Given the telemetry variable "SINK" holds "https://u:p@sink.example/x"
      When the gate posts the change merged event of CR "1"
      Then the sink received 0 requests
      And the output shows none of "sink.example|u:p"

  Rule: A gate waits a bounded time for its telemetry

    Scenario: The wait is 5 seconds in total
      Then the gate waits at most 5000 ms for its telemetry

    Scenario: A sink that does not answer is tried once and given up on at the deadline
      Given the sink never answers
      When the gate posts its change merged event and waits at most 20 ms
      Then the error output is the single line "telemetry: CDEvent not sent: no answer within 20 ms"
      And the sink was asked once, with one try and a limit of 20 ms
