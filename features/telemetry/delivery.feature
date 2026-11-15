# Source: src/telemetry.ts "sinkOf", "parseHeaders", "sendOtlp", "sendCdEvent"; src/ledger.ts "cli" (export --send)
@cli:ledger
Feature: Sending the export
  Nothing is sent unless the binding names the env vars that hold the sink URLs. `ledger export --send` posts the OTLP
  document to `<endpoint>/v1/traces`, or each CDEvent as a CloudEvents binary-mode request. The headers come from
  the env var `telemetry.headers_env` names.

  Background:
    Given the heartbeat ticket
    And the binding sets "owners.bots" to the list "bot"
    And the telemetry sinks are configured for the repository "acme/app"
    And a heartbeat by "bot" at "2026-11-08T10:00:00Z" with these runs:
      | id | at                   | skill         | hash   | ticket | cr | tier     | model | executor | ref   | tokens | minutes | outcome | score | scores                            | error          |
      | r1 | 2026-11-08T09:30:00Z | build         | abc123 | 7      | 12 | balanced | m1    | command  | bot-1 | 1200   | 6       | done    | 4     | done-conditions=4; scope-creep=pass |                |
      | r2 | 2026-11-08T09:45:00Z | review/review | def456 | 7      | 12 | fast     |       |          |       |        |         | done    |       |                                   |                |
      | r3 | 2026-11-08T09:50:00Z | build         | abc123 | 8      | 13 | balanced | m1    |          |       |        | 2       | failed  |       |                                   | fast_check red |
    And that heartbeat records the factory "f00dfeed"

  Rule: Nothing is sent unless the binding says where

  Rule: The OTLP document is posted to the traces path with the headers of headers_env

    Scenario: The document is posted to <endpoint>/v1/traces
      When I run "ledger export --format otlp --send" against the recording sink
      Then the exit code is 0
      And the sink received 1 requests
      And request 1 was a POST to "https://otel.example/v1/traces"
      And request 1 has these headers:
        | header        | value         |
        | authorization | Bearer a=b    |
        | x-team        | core          |
      And the body of request 1 has these values:
        | path                                          | value        |
        | resourceSpans.0.scopeSpans.0.spans.length     | 4            |
        | resourceSpans.0.resource.attributes.0.value.stringValue | agentic-sdlc |

  Rule: A CDEvent is posted as a CloudEvents binary-mode request

    Scenario: One request per event
      When I run "ledger export --format cdevents --send --since 2026-11-08T09:40:00Z" against the recording sink
      Then the sink received 4 requests

  Rule: A sink that is malformed or holds credentials is refused, naming only the env var

    Scenario Outline: A `<format>` sink of `<value>` is refused without showing the value
      Given the telemetry variable "OTLP" holds "<value>"
      And the telemetry variable "SINK" holds "<value>"
      When I run "ledger export --format <format> --send" against the recording sink
      Then the exit code is 1
      And the output says "env var <var> "
      And the output shows none of "<hidden>"
      And the sink received 0 requests

      Examples:
        | format  | var   | value                         | hidden            |
        | otlp    | OTLP  | https://user:pw@sink.example/x | pw\|sink.example |
        | otlp    | OTLP  | https://tok@sink.example/x    | tok@\|sink.example |
        | cdevents | SINK | https://user:pw@sink.example/x | pw\|sink.example |
        | cdevents | SINK | https://tok@sink.example/x    | tok@\|sink.example |

  Rule: The binding holds the names of env vars, never URLs
