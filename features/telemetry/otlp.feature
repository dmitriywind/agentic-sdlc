# Source: src/telemetry.ts "otlpTraces", "traceId", "spanId"; src/ledger.ts "exportRows", "cli" (export)
@cli:ledger
Feature: Runs exported as OpenTelemetry GenAI spans
  `agentic-sdlc ledger export --format otlp` prints one OTLP/HTTP JSON document: one trace per heartbeat, a workflow
  span for the cycle and an `invoke_agent` span per run, named after the OpenTelemetry GenAI conventions.

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

  Rule: A heartbeat is one trace with a workflow span and a span per run

    Scenario: The resource and the scope name the service, its version and the repository
      When I run "ledger export --format otlp"
      Then the exit code is 0
      And the trace names the service "agentic-sdlc" at the package version for the repository "acme/app"

    Scenario: One trace holds the workflow span and one span per run
      When I run "ledger export --format otlp"
      Then there are 4 spans in one trace
      And the span "workflow" is named "invoke_workflow sdlc"
      And the workflow span has no parent
      And the span "r1" is a child of the workflow span
      And the span "r1" is named "invoke_agent build"
      And the span "r2" is named "invoke_agent review/review"

    Scenario: The workflow span names the operation and the factory revision
      When I run "ledger export --format otlp"
      Then the span "workflow" has these attributes:
        | key                    | type   | value           |
        | gen_ai.operation.name  | string | invoke_workflow |
        | agentic_sdlc.factory   | string | f00dfeed        |

  Rule: A run is an invoke_agent span with the GenAI attribute names

    Scenario: A run ends at its time, started its minutes before, and is a client span
      When I run "ledger export --format otlp"
      Then the span "r1" ran from "2026-11-08T09:24:00Z" to "2026-11-08T09:30:00Z"
      And the span "r1" is of kind 1

    Scenario: The attributes of a run are the GenAI names, then the agentic_sdlc names
      When I run "ledger export --format otlp"
      Then the span "r1" has exactly these attributes:
        | key                      | type   | value      |
        | gen_ai.operation.name    | string | invoke_agent |
        | gen_ai.agent.name        | string | build      |
        | gen_ai.agent.version     | string | abc123     |
        | gen_ai.request.model     | string | m1         |
        | agentic_sdlc.run.id      | string | r1         |
        | agentic_sdlc.ticket      | string | 7          |
        | agentic_sdlc.cr          | string | 12         |
        | agentic_sdlc.tier        | string | balanced   |
        | agentic_sdlc.executor    | string | command    |
        | agentic_sdlc.ref         | string | bot-1      |
        | agentic_sdlc.tokens      | int    | 1200       |
        | agentic_sdlc.minutes     | int    | 6          |
        | agentic_sdlc.outcome     | string | done       |
        | agentic_sdlc.score       | int    | 4          |

    Scenario: A row's single token total is never split into input and output tokens
      When I run "ledger export --format otlp"
      Then the span "r1" has no attribute starting with "gen_ai.usage"

    Scenario: Each scorer value is a gen_ai.evaluation.result event
      When I run "ledger export --format otlp"
      Then the events of the span "r1" are:
        """
        [
          ["gen_ai.evaluation.result", [{ "key": "gen_ai.evaluation.name", "value": { "stringValue": "done-conditions" } }, { "key": "gen_ai.evaluation.score.value", "value": { "intValue": "4" } }]],
          ["gen_ai.evaluation.result", [{ "key": "gen_ai.evaluation.name", "value": { "stringValue": "scope-creep" } }, { "key": "gen_ai.evaluation.score.label", "value": { "stringValue": "pass" } }]]
        ]
        """

    Scenario: A run that ended done is not an error span
      When I run "ledger export --format otlp"
      Then the span "r1" has no status

    Scenario: An empty model is left out, and the default executor is harness
      When I run "ledger export --format otlp"
      Then the span "r2" has no attribute "gen_ai.request.model"
      And the span "r2" has these attributes:
        | key                    | type   | value   |
        | agentic_sdlc.executor  | string | harness |

    Scenario: A run that did not end done is an error span with error.type set to its outcome
      When I run "ledger export --format otlp"
      Then the span "r3" has these attributes:
        | key        | type   | value  |
        | error.type | string | failed |
      And the span "r3" has the error status "fast_check red"

  Rule: A re-export is the same document

    Scenario: Exporting twice prints the same bytes
      When I run "ledger export --format otlp"
      And I note the printed document
      And I run "ledger export --format otlp"
      Then the printed document is the noted one

    Scenario: A run keeps its span id when it is exported alone
      When I run "ledger export --format otlp"
      And I note the span id of "r1"
      And I run "ledger export --format otlp --run r1"
      Then the span id of "r1" is the noted one
      And there are 2 spans in one trace

    Scenario: --since takes a number of days
      When I run "ledger export --format otlp --since 3650"
      Then there are 4 spans in one trace

    Scenario: --since keeps the runs from that time on
      When I run "ledger export --format otlp --since 2026-11-08T09:40:00Z"
      Then there are 3 spans in one trace
      And the span "r2" is named "invoke_agent review/review"
