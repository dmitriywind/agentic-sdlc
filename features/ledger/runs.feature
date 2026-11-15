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

    Scenario: A heartbeat whose JSON is not valid is ignored
      Given "factory-bot" posted a heartbeat whose JSON is not valid
      And a heartbeat by "factory-bot" at "2026-11-08T01:00:00Z" with these runs:
        | id   |
        | real |
      When I run "ledger runs"
      Then the "id" of the result entries are "real"

    Scenario: A stranger's rescore of a run does not count
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id   | score |
        | real | 4     |
      And a heartbeat by "stranger" at "2026-11-08T01:00:00Z" with no runs
      And that heartbeat rescores:
        | id   | score |
        | real | 0     |
      When I run "ledger runs"
      Then the "score" of the result entries are "4"

    Scenario: Without a bot in owners.bots no heartbeat is trusted
      Given the binding has no "owners.bots"
      When I run "ledger runs"
      Then the exit code is 1
      And the output says "owners.bots"

  Rule: A scores comment and a grade comment replace the score of a run

    Background:
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | score |
        | a  | 4     |

    Scenario: A scores comment by a bot replaces the score
      Given "factory-bot" posted the scores "done-conditions=2, redundant-tests=fail" for run "a"
      When I run "ledger runs"
      Then the "score" of the result entries are "2"

    Scenario: A scores comment by a stranger is ignored
      Given "factory-bot" posted the scores "done-conditions=2" for run "a"
      And "mallory" posted the scores "done-conditions=1" for run "a"
      When I run "ledger runs"
      Then the "score" of the result entries are "2"

    Scenario: A grade by an owner replaces the judge's value for that scorer
      Given "factory-bot" posted the scores "done-conditions=2, redundant-tests=fail" for run "a"
      And "PO" posted the comment "agentic-sdlc:grade a redundant-tests pass"
      When I run "ledger runs"
      Then the JSON result "0.scores" holds:
        """
        { "done-conditions": 2, "redundant-tests": "pass" }
        """

    Scenario: A grade by a stranger is ignored
      Given "stranger" posted the comment "agentic-sdlc:grade a done-conditions 0"
      When I run "ledger runs"
      Then the "score" of the result entries are "4"

  Rule: A run has the time of its heartbeat unless it names its own

    Scenario: A run without a time takes the time of its heartbeat
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | at                   |
        | a  |                      |
        | b  | 2026-11-07T23:00:00Z |
      When I run "ledger runs"
      Then the JSON result has these values:
        | path   | value                |
        | 0.at   | 2026-11-08T00:00:00Z |
        | 1.at   | 2026-11-07T23:00:00Z |

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

    Scenario: --since keeps the runs of the last days
      When I run "ledger runs --since 7"
      Then the "id" of the result entries are "b, a"

    Scenario: --skill keeps the runs of one step
      When I run "ledger runs --skill review/review"
      Then the "id" of the result entries are "b"

  Rule: A run stored under an old skill name reads as its step id

    Background:
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | skill          |
        | a  | implement-spec |
        | b  | review-pr      |
        | c  | verify-ux      |
        | d  | review/review  |
        | e  | bench          |

    Scenario: The old names are the step ids
      When I run "ledger runs"
      Then the "skill" of the result entries are "build, review/review, review/verify, review/review, bench"

    Scenario Outline: A skill filter takes an old name as its step, and a skill name as all its steps
      When I run "ledger runs --skill <skill>"
      Then the "id" of the result entries are "<ids>"

      Examples:
        | skill     | ids     |
        | review-pr | b, d    |
        | review    | b, c, d |

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

    Scenario: A human unscorable grade on a failed run is ignored
      Given a heartbeat by "factory-bot" at "2026-11-08T00:00:00Z" with these runs:
        | id | outcome | score |
        | f  | failed  | 1     |
      And "fo" posted the comment "agentic-sdlc:grade f done-conditions unscorable"
      When I run "ledger runs"
      Then the JSON result has these values:
        | path                     | value    |
        | 0.score                  | 1        |
        | 0.scores.done-conditions | <absent> |
