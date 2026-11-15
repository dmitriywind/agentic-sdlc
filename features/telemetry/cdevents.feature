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

    Scenario: A finished taskrun names the step, the outcome and the cycle
      When I run "ledger export --format cdevents"
      Then CDEvent 1 has these values:
        | path                                | value                          |
        | context.specversion                 | 0.5.1                          |
        | context.source                      | https://github.com/acme/app    |
        | context.type                        | dev.cdevents.taskrun.finished.0.3.0 |
        | context.timestamp                   | 2026-11-08T09:30:00.000Z       |
        | subject.id                          | r1                             |
        | subject.content.taskName            | build                          |
        | subject.content.outcome             | success                        |
        | subject.content.pipelineRun.id      | 1                              |

    Scenario: A failed run is a failure with its error
      When I run "ledger export --format cdevents"
      Then CDEvent 5 has these values:
        | path                       | value          |
        | subject.content.outcome    | failure        |
        | subject.content.errors     | fast_check red |

    Scenario: A created change names its repository
      When I run "ledger export --format cdevents"
      Then CDEvent 2 holds:
        """
        { "id": "12", "content": { "repository": { "id": "acme/app", "source": "https://github.com/acme/app" } } }
        """

    Scenario: The ids are 32 hex digits and the same on every export
      When I run "ledger export --format cdevents"
      And I note the printed document
      And I run "ledger export --format cdevents"
      Then every CDEvent has an id of 32 hex digits
      And the printed document is the noted one

  Rule: The export is printed or written to a file

    Scenario: --run exports one run and its change
      When I run "ledger export --format cdevents --run r1"
      Then the CDEvents printed are:
        | type                                  | subject |
        | dev.cdevents.taskrun.finished.0.3.0   | r1      |
        | dev.cdevents.change.created.0.4.0     | 12      |

    Scenario: --out writes the document to a file and prints nothing
      When I run "ledger export --format otlp"
      And I note the printed document
      And I run "ledger export --format otlp --out o.json"
      Then nothing was printed
      And the file "o.json" holds the document that was noted

    Scenario Outline: An export refuses what it cannot read
      When I run "<command>"
      Then the exit code is 2

      Examples:
        | command                                      |
        | ledger export --format otlp --since x        |
        | ledger export --format otlp --send --out o   |
