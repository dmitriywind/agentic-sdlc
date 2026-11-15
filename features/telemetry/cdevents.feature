# Source: src/telemetry.ts "cdEventsFromRuns", "changeMergedEvent", "deployEvent"; src/ledger.ts "cli" (export)
@cli:ledger
Feature: Runs exported as CDEvents
  `agentic-sdlc ledger export --format cdevents` prints one CDEvent per line: a taskrun finished per run, a change
  created for the first build run of each CR and a change reviewed for each done review run. An event whose required
  field the ledger cannot fill (taskrun started, pipelinerun) is not printed.

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

  Rule: A run is a taskrun, a CR is created once and reviewed when a review is done

    Scenario: The events come in time order, one change created per CR
      When I run "ledger export --format cdevents"
      Then the CDEvents printed are:
        | type                                  | subject |
        | dev.cdevents.taskrun.finished.0.3.0   | r1      |
        | dev.cdevents.change.created.0.4.0     | 12      |
        | dev.cdevents.taskrun.finished.0.3.0   | r2      |
        | dev.cdevents.change.reviewed.0.3.0    | 12      |
        | dev.cdevents.taskrun.finished.0.3.0   | r3      |
        | dev.cdevents.change.created.0.4.0     | 13      |

  Rule: The export is printed or written to a file

    Scenario: --out writes the document to a file and prints nothing
      When I run "ledger export --format otlp"
      And I note the printed document
      And I run "ledger export --format otlp --out o.json"
      Then nothing was printed
      And the file "o.json" holds the document that was noted
