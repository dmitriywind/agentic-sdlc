# Source: src/ledger.ts "summarise", "clusters", "byScorer", "ticketUse", "learningState"; skills/sdlc/SKILL.md "Run one cycle"
@cli:ledger
Feature: The summary of the ledger
  `agentic-sdlc ledger summary` groups the runs by step, skill, model, executor and scorer, clusters the failures that
  repeat, rolls the tokens up per ticket, and says whether learning is due.

  Background:
    Given the heartbeat ticket
    And the binding sets "owners.bots" to the list "bot"

  Rule: Runs are grouped, and a failure that repeats is a cluster

    Background:
      Given a heartbeat by "bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | score | minutes | outcome | model | ticket | error                                                    | skill      | executor | ref   |
        | 1  | 4     | 10      | done    | m1    |        |                                                          | build      |          |       |
        | 2  | 2     | 5       | failed  | m1    | 7      | Fast_check red in src/x.ts at 3f9c2d1e for "PROJ-45"     | build      |          |       |
        | 3  | 1     |         | failed  | m2    | 8      | fast_check red in lib/y.ts at 0a1b2c3d4e for "LIN-9"     | build      |          |       |
        | 4  |       |         | failed  | m1    |        | once only                                                | plan/shape | command  | bot-1 |

    Scenario: The runs are grouped by skill, model and executor
      When I run "ledger summary"
      Then the JSON result has these values:
        | path                       | value |
        | bySkill.build.runs         | 3     |
        | bySkill.build.medianScore  | 2     |
        | bySkill.build.failureRate  | 0.667 |
        | bySkill.build.minutes      | 15    |
        | byModel.m2.runs            | 1     |
        | byExecutor.harness.runs    | 3     |
        | byExecutor.command.runs    | 1     |

    Scenario: Failures with the same error, once ids, paths and shas are removed, are one cluster of two runs
      When I run "ledger summary"
      Then the JSON result "failureClusters" holds:
        """
        [{ "skill": "build", "error": "fast_check red in <path> at <sha> for <s>", "count": 2, "tickets": ["7", "8"] }]
        """

  Rule: A scorer is read by its failure rate and its median

    Background:
      Given a heartbeat by "bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | ticket | cr | scores                                       | skill       |
        | 1  | 7      | 70 | done-conditions=4; redundant-tests=fail      | build       |
        | 2  | 8      | 80 | done-conditions=1; redundant-tests=fail      | build       |
        | 3  | 8      | 81 | redundant-tests=pass                         | build       |
        | 4  |        |    |                                              | learn/judge |

    Scenario: A pass-fail scorer has a failure rate and no median, a 0-4 scorer has both
      When I run "ledger summary"
      Then the JSON result "byScorer.redundant-tests" holds:
        """
        { "runs": 3, "failRate": 0.6666666666666666, "median": null }
        """
      And the JSON result "byScorer.done-conditions" holds:
        """
        { "runs": 2, "failRate": 0.5, "median": 2.5 }
        """

  Rule: An unscorable value is counted and left out of every rate, median and cluster

    Scenario: An unscorable run is counted per scorer and does not count as a failure
      Given a heartbeat by "bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | ticket | scores                                                            |
        | 1  | 7      | redundant-tests=fail; done-conditions=4                           |
        | 2  | 8      | redundant-tests=unscorable; done-conditions=unscorable            |
        | 3  | 9      | redundant-tests=unscorable                                        |
      When I run "ledger summary"
      Then the JSON result "byScorer.redundant-tests" holds:
        """
        { "runs": 1, "failRate": 1, "median": null, "unscorable": 2 }
        """
      And the JSON result "byScorer.done-conditions" holds:
        """
        { "runs": 1, "failRate": 0, "median": 4, "unscorable": 1 }
        """
      And the JSON result "failureClusters" holds:
        """
        []
        """

  Rule: The tokens of a ticket are rolled up, and a ticket over its budget is marked

    Background:
      Given a heartbeat by "bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | ticket | skill         | tokens | minutes | outcome | error     |
        | 1  | 7      | build         | 900    | 4       | done    |           |
        | 2  | 7      | build         | 700    | 3       | capped  | max turns |
        | 3  | 8      | review/review | 100    |         | done    |           |
        | 4  | 9      | build         |        |         | done    |           |
        | 5  |        | build         |        |         | done    |           |

    Scenario: A ticket over cycle.max_tokens_per_ticket is marked overBudget and counts its reworks
      Given a ticket may use 1000 tokens
      When I run "ledger summary"
      Then the JSON result "tickets" holds:
        """
        [
          { "ticket": "7", "runs": 2, "tokens": 1600, "minutes": 7, "reworks": 1, "overBudget": true },
          { "ticket": "8", "runs": 1, "tokens": 100, "minutes": 0 },
          { "ticket": "9", "runs": 1, "tokens": 0, "minutes": 0 }
        ]
        """
      And the JSON result "ticketTotals" holds:
        """
        { "tickets": 3, "runs": 4, "tokens": 1700, "minutes": 7 }
        """

  Rule: Learning is due after every_cycles cycles since the last learn/improve run, and only when enabled

    Background:
      Given a heartbeat by "bot" at "2026-10-01T00:00:00Z" with these runs:
        | id | skill |
        | 1  | bench |
      And a heartbeat by "bot" at "2026-11-06T00:00:00Z" with these runs:
        | id | skill         |
        | 3  | learn/improve |
      And a heartbeat by "bot" at "2026-11-07T00:00:00Z" with these runs:
        | id |
        | 4  |
      And a heartbeat by "bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | skill       |
        | 5  | learn/judge |

    Scenario: Learning is due when every_cycles cycles have passed
      Given learning is enabled
      And learning is due every 2 cycles
      When I run "ledger summary"
      Then the JSON result has these values:
        | path                 | value |
        | learning.due         | true  |
        | learning.judge       | true  |
        | learning.cyclesSince | 2     |
