# Source: src/ledger.ts "readLedger", "readRuns", "flattenRuns", "pickRescores"; references/architecture.md "6. The self-improvement loop"
@cli:ledger
Feature: The runs of the ledger
  The runs of every cycle are rows in the heartbeat comments of the heartbeat ticket. `agentic-sdlc ledger runs` reads
  them back, trusts only what the bots and the owners wrote, and applies the scores that came after the run.

  Background:
    Given the heartbeat ticket
    And the binding sets "owners.bots" to the list "factory-bot"
    And the binding sets "owners.product" to "PO"
    And the binding sets "owners.factory" to "fo"

  Rule: Only the bots write the heartbeats the ledger trusts

    Scenario: A heartbeat by a stranger is ignored
      Given a heartbeat by "stranger" at "2026-11-08T00:00:00Z" with these runs:
        | id     | score |
        | forged | 0     |
      And a heartbeat by "Factory-Bot" at "2026-11-08T01:00:00Z" with these runs:
        | id   | score |
        | real | 4     |
      When I run "ledger runs"
      Then the "id" of the result entries are "real"
      And the "score" of the result entries are "4"

  Rule: A scores comment and a grade comment replace the score of a run

    Background:
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | score |
        | a  | 4     |

    Scenario: A scores comment by a bot replaces the score
      Given "factory-bot" posted the scores "done-conditions=2, redundant-tests=fail" for run "a"
      When I run "ledger runs"
      Then the "score" of the result entries are "2"

  Rule: A rescore applies per scorer: a human beats a newer judge, else the newest wins

    Background:
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | score | scores                                                           |
        | a  | 4     | done-conditions=4; redundant-tests=fail; scope-creep=pass        |
      And a heartbeat by "factory-bot" at "2026-11-08T01:00:00Z" with no runs
      And that heartbeat rescores:
        | id | scorer          | score | by    |
        | a  | redundant-tests | pass  | human |
        | a  |                 | 3     |       |
      And a heartbeat by "factory-bot" at "2026-11-08T02:00:00Z" with no runs
      And that heartbeat rescores:
        | id | scorer          | score | by    |
        | a  | redundant-tests | fail  | judge |
        | a  |                 | 0     |       |

    Scenario: A human grade beats a newer judge value
      When I run "ledger runs"
      Then the JSON result "0.scores.redundant-tests" holds:
        """
        "pass"
        """

    Scenario: A rescore without a scorer is a done-conditions rescore, and the newest one wins
      When I run "ledger runs"
      Then the JSON result "0.scores" holds:
        """
        { "done-conditions": 0, "redundant-tests": "pass", "scope-creep": "pass" }
        """
      And the "score" of the result entries are "0"

  Rule: Runs are filtered by age and by step

    Background:
      Given a heartbeat by "factory-bot" at "40 days ago" with these runs:
        | id  |
        | old |
      And a heartbeat by "factory-bot" at "2 days ago" with these runs:
        | id | score |
        | a  | 4     |
      And that heartbeat rescores:
        | id | score |
        | a  | 3     |
      And a heartbeat by "factory-bot" at "1 days ago" with these runs:
        | id | skill         |
        | b  | review/review |
      And that heartbeat rescores:
        | id | score |
        | a  | 1     |

    Scenario: The runs come newest heartbeat first, and the newest rescore replaces the score
      When I run "ledger runs"
      Then the "id" of the result entries are "b, a, old"
      And the JSON result "id=a.score" holds:
        """
        1
        """

  Rule: A human may grade a run unscorable, except a run that a hard fact capped

    Scenario: A human unscorable grade replaces the judge's score
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | score |
        | g  | 3     |
      And "fo" posted the comment "agentic-sdlc:grade g done-conditions unscorable"
      When I run "ledger runs"
      Then the JSON result has these values:
        | path                       | value    |
        | 0.scores.done-conditions   | unscorable |
        | 0.score                    | <absent> |
