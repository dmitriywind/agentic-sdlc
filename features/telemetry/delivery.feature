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

    Scenario: Without telemetry keys the export is refused and nothing is posted
      Given the binding has no "telemetry"
      When I run "ledger export --format otlp --send" against the recording sink
      Then the exit code is 1
      And the output says "otlp_endpoint_env is unset"
      And the sink received 0 requests

    Scenario: Without a sink key CDEvents are refused, also when there are no events to send
      Given the binding has no "telemetry.cdevents_sink_env"
      When I run "ledger export --format cdevents --send --run nope" against the recording sink
      Then the exit code is 1
      And the output says "cdevents_sink_env is unset"
      And nothing was printed on the standard output
      And the sink received 0 requests

    Scenario: A key that names an empty env var is refused with the name of the variable
      Given the telemetry variable "OTLP" holds ""
      When I run "ledger export --format otlp --send" against the recording sink
      Then the exit code is 1
      And the output says "env var OTLP is empty"

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

    Scenario: Headers are separated by commas, and a value may hold an equals sign
      Given the telemetry variable "HDRS" holds "authorization=Bearer a=b, x-team=core"
      When I run "ledger export --format otlp --send" against the recording sink
      Then request 1 has these headers:
        | header        | value      |
        | authorization | Bearer a=b |
        | x-team        | core       |

    Scenario: Rejected spans fail the send
      Given the sink rejects 2 spans
      When I run "ledger export --format otlp --send" against the recording sink
      Then the exit code is 1
      And the output says "rejected 2 span"

  Rule: A CDEvent is posted as a CloudEvents binary-mode request

    Scenario: The ce headers describe the event and the body is the event
      When I run "ledger export --format cdevents --send --run r1" against the recording sink
      Then the sink received 2 requests
      And request 1 was a POST to "https://sink.example/events"
      And request 1 has these headers:
        | header        | value                                |
        | ce-specversion | 1.0                                 |
        | ce-source     | https://github.com/acme/app          |
        | ce-type       | dev.cdevents.taskrun.finished.0.3.0  |
        | ce-time       | 2026-11-08T09:30:00.000Z             |
        | ce-subject    | r1                                   |
        | authorization | Bearer a=b                           |
        | x-team        | core                                 |
      And request 1 has the same id in its header as in its event

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
        | otlp    | OTLP  | not a url                     | not a url         |
        | otlp    | OTLP  | ftp://sink.example/x          | sink.example      |
        | otlp    | OTLP  | https://user:pw@sink.example/x | pw\|sink.example |
        | otlp    | OTLP  | https://tok@sink.example/x    | tok@\|sink.example |
        | cdevents | SINK | not a url                     | not a url         |
        | cdevents | SINK | ftp://sink.example/x          | sink.example      |
        | cdevents | SINK | https://user:pw@sink.example/x | pw\|sink.example |
        | cdevents | SINK | https://tok@sink.example/x    | tok@\|sink.example |

  Rule: The binding holds the names of env vars, never URLs

    Scenario: A telemetry key that holds a URL is a problem
      Given a complete binding
      And the binding value "telemetry" is '{"otlp_endpoint_env":"https://otel.example"}'
      When the binding is validated
      Then the problems mention "NAME of an env var"

    Scenario: A telemetry key that names an env var is fine
      Given a complete binding
      And the binding value "telemetry" is '{"otlp_endpoint_env":"OTEL_URL","cdevents_sink_env":"SINK","headers_env":"H"}'
      When the binding is validated
      Then validation finds no problems

    Scenario: A key that is not a telemetry key is a problem
      Given a complete binding
      And the binding value "telemetry" is '{"endpoint":"X"}'
      When the binding is validated
      Then the problems mention "not a telemetry key"

    Scenario: A telemetry section that is not a map is a problem
      Given a complete binding
      And the binding value "telemetry" is '[]'
      When the binding is validated
      Then the problems mention "telemetry must be"
