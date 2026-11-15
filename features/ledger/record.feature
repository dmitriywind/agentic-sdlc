# Source: src/ledger.ts "scorersFor", "hardFacts", "plan", "scoresComment", "cli" (plan, record, stale, hash)
@cli:ledger
Feature: Planning and recording the scores of a run
  `ledger plan` tells the judge which scorers apply to a run, where the evidence is and which hard fact caps the score.
  `ledger record` validates the judge's scores against that plan and posts them as a scores comment.

  Background:
    Given the heartbeat ticket
    And the binding sets "owners.bots" to the list "local"

  Rule: The plan lists the scorers that apply to the step of the run

    Scenario Outline: done-conditions always applies, a scorer applies by step id, skill name, old name or *
      Given a scorer "by-step" on the scale "pass-fail" that applies to "review/verify"
      And a scorer "by-skill" on the scale "pass-fail" that applies to "review"
      And a scorer "old-name" on the scale "pass-fail" that applies to "review-pr"
      And a scorer "other" on the scale "pass-fail" that applies to "build"
      And a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | skill         |
        | v  | review/verify |
        | r  | review/review |
      When I run "ledger plan --run <run>"
      Then the JSON result "scorers.*.name" is "<scorers>"

      Examples:
        | run | scorers                                  |
        | v   | done-conditions, by-skill, by-step       |
        | r   | done-conditions, by-skill, old-name      |

    Scenario: A scorer that applies to another step is not planned
      Given a scorer "redundant-tests" on the scale "pass-fail" that applies to "build"
      And a scorer "release-only" on the scale "0-4" that applies to "ship"
      And a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id |
        | a  |
      When I run "ledger plan --run a"
      Then the JSON result "scorers.*.name" is "done-conditions, redundant-tests"

    Scenario: The evidence names the step file of the installed pack and the skill hash
      Given an installed skill pack with the review steps
      And a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | skill         |
        | z  | review/verify |
      When I run "ledger plan --run z"
      Then the JSON result "evidence.skill" is ".agents/skills/sdlc-review/steps/verify.md at skillHash abc"

    Scenario: A run that is not in the ledger cannot be planned
      When I run "ledger plan --run nope"
      Then the exit code is 1
      And the output says "run nope is not in the ledger"

    Scenario: A plan needs a run
      When I run "ledger plan"
      Then the exit code is 2

  Rule: A hard fact caps the score

    Scenario Outline: A run that ended on a failure, a timeout or a cap is capped at 1
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | outcome   |
        | r9 | <outcome> |
      When I run "ledger plan --run r9"
      Then the JSON result has these values:
        | path       | value                |
        | cap.score  | 1                    |
        | cap.facts  | outcome <outcome>    |

      Examples:
        | outcome |
        | failed  |
        | timeout |
        | capped  |

    Scenario: A run that is done has no cap
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | outcome |
        | a  | done    |
      When I run "ledger plan --run a"
      Then the JSON result "cap" is "null"

    Scenario: A red required check on the head of the CR caps the score with the outcome
      Given a run "a" that ended "failed" on CR "7" whose checks are:
        | name     | state   |
        | Required | failure |
        | lint     | failure |
      When the hard facts are read with the required checks "Required"
      Then the JSON result has these values:
        | path        | value                                         |
        | score       | 1                                             |
        | facts       | outcome failed, red check on the head: Required |

    Scenario: A run that is done with green checks has no hard fact
      Given a run "a" that ended "done" on CR "7" whose checks are:
        | name     | state   |
        | Required | success |
      When the hard facts are read with the required checks "Required"
      Then the JSON result is null

  Rule: A recorded score is validated and capped

    Background:
      Given a scorer "redundant-tests" on the scale "pass-fail" that applies to "build"
      And a scorer "release-only" on the scale "0-4" that applies to "ship"

    Scenario: A score above the cap is lowered to the cap, and the facts are kept
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | outcome |
        | r9 | timeout |
      And a file "s.json" with '{"scores":{"done-conditions":3}}'
      When I run "ledger record --run r9 --file s.json"
      Then the exit code is 0
      And the JSON result has these values:
        | path                      | value           |
        | run                       | r9              |
        | scores.done-conditions    | 1               |
        | cap                       | outcome timeout |

    Scenario: The recorded score is the run's score from then on
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | outcome |
        | r9 | timeout |
      And a file "s.json" with '{"scores":{"done-conditions":3}}'
      When I run "ledger record --run r9 --file s.json"
      And I run "ledger runs"
      Then the "score" of the result entries are "1"

    Scenario: A score within the cap is kept
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id |
        | a  |
      And a file "s.json" with '{"scores":{"done-conditions":4,"redundant-tests":"pass"}}'
      When I run "ledger record --run a --file s.json"
      Then the JSON result "scores" holds:
        """
        { "done-conditions": 4, "redundant-tests": "pass" }
        """
      And the JSON result "cap" is "<absent>"

    Scenario Outline: A score that does not fit the plan is refused
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id |
        | a  |
      And a file "s.json" with '<file>'
      When I run "ledger record --run a --file s.json"
      Then the exit code is 1
      And the output says "<message>"

      Examples:
        | file                                                              | message                  |
        | {"scores":{"done-conditions":5}}                                  | not on scale 0-4         |
        | {"scores":{"done-conditions":3,"release-only":2}}                 | does not apply           |
        | {"scores":{"redundant-tests":"pass"}}                             | done-conditions is required |

    Scenario: A record needs a scores file
      When I run "ledger record --run r9"
      Then the exit code is 2

  Rule: A judge with too little evidence grades unscorable, with a reason

    Background:
      Given a scorer "redundant-tests" on the scale "pass-fail" that applies to "build"

    Scenario: Unscorable without a reason is refused
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id |
        | a  |
      And a file "s.json" with '{"scores":{"done-conditions":3,"redundant-tests":"unscorable"}}'
      When I run "ledger record --run a --file s.json"
      Then the exit code is 1
      And the output says "unscorable needs a reason"

    Scenario: Unscorable with a reason is recorded, and no cap applies to it
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id |
        | a  |
      And a file "s.json" with '{"scores":{"done-conditions":"unscorable","redundant-tests":"unscorable"},"reasons":{"done-conditions":"no diff","redundant-tests":"no diff"}}'
      When I run "ledger record --run a --file s.json"
      Then the exit code is 0
      And the JSON result "scores" holds:
        """
        { "done-conditions": "unscorable", "redundant-tests": "unscorable" }
        """

    Scenario: done-conditions is not unscorable while a hard fact caps the run
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | outcome |
        | f  | failed  |
      And a file "s.json" with '{"scores":{"done-conditions":"unscorable"},"reasons":{"done-conditions":"no diff"}}'
      When I run "ledger record --run f --file s.json"
      Then the exit code is 1
      And the output says "unscorable is not allowed while a hard fact caps the run"

    Scenario: Another scorer may be unscorable on a capped run
      Given a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | outcome |
        | f  | failed  |
      And a file "s.json" with '{"scores":{"done-conditions":4,"redundant-tests":"unscorable"},"reasons":{"redundant-tests":"no diff"}}'
      When I run "ledger record --run f --file s.json"
      Then the JSON result "scores" holds:
        """
        { "done-conditions": 1, "redundant-tests": "unscorable" }
        """

  Rule: A missing heartbeat is found

    Scenario: With no heartbeat the ledger is stale
      When I run "ledger stale --max-hours 2"
      Then the exit code is 1
      And the JSON result "stale" is "true"

    Scenario: A fresh heartbeat is not stale
      Given a heartbeat by "local" at "0.1 hours ago" with no runs
      When I run "ledger stale --max-hours 2"
      Then the exit code is 0
      And the JSON result "stale" is "false"

    Scenario: A heartbeat older than the limit is stale
      Given a heartbeat by "local" at "5 hours ago" with no runs
      When I run "ledger stale --max-hours 2"
      Then the exit code is 1

    Scenario: stale needs a limit
      When I run "ledger stale"
      Then the exit code is 2

  Rule: A skill is hashed from its text with any line ending

    Scenario: A skill folder has a 12-digit hash
      Given a skill folder "x" with the lines "a|b" separated by "\n"
      When I run "ledger hash x"
      Then the exit code is 0
      And the output matches '"hash":\s*"[0-9a-f]{12}"'

    Scenario: The same text with other line endings has the same hash
      Given a skill folder "x" with the lines "a|b" separated by "\n"
      And a skill folder "y" with the lines "a|b" separated by "\r\n"
      When I run "ledger hash x"
      And I note the printed hash
      And I run "ledger hash y"
      Then the hash is the noted one

    Scenario: Another text has another hash
      Given a skill folder "x" with the lines "a|b" separated by "\n"
      And a skill folder "z" with the lines "a|bc" separated by "\n"
      When I run "ledger hash x"
      And I note the printed hash
      And I run "ledger hash z"
      Then the hash is not the noted one

  Rule: A wrong command line is a one-line usage error

    Scenario Outline: A flag without a value, an unknown flag or an unknown export format is refused
      When I run "<command>"
      Then the exit code is 2
      And the output says "<message>"

      Examples:
        | command                       | message                           |
        | ledger runs --since           | --since needs a value             |
        | ledger export --format xml    | --format must be otlp or cdevents |
        | ledger export                 | --format must be otlp or cdevents |
        | ledger runs --bogus x         | unknown flag --bogus              |

    Scenario: A since that is not a number is refused
      When I run "ledger runs --since x"
      Then the exit code is 2

    Scenario: An unknown verb is refused
      When I run "ledger nope"
      Then the exit code is 2
