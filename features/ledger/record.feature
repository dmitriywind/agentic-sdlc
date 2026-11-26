# Source: src/ledger.ts "scorersFor", "hardFacts", "plan", "scoresComment", "cli" (plan, record, stale, hash)
@cli:ledger
Feature: Planning and recording the scores of a run
  `ledger plan` tells the judge which scorers apply to a run, where the evidence is and which hard fact caps the score.
  `ledger record` validates the judge's scores against that plan and posts them as a scores comment.

  Background:
    Given the heartbeat ticket
    And the binding sets "owners.bots" to the list "local"

  Rule: The plan lists the scorers that apply to the step of the run

    Scenario Outline: done-conditions always applies, a scorer applies by step id, skill name, or *
      Given a scorer "by-step" on the scale "pass-fail" that applies to "review/verify"
      And a scorer "by-skill" on the scale "pass-fail" that applies to "review"
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
        | r   | done-conditions, by-skill                |

    Scenario: The evidence names the step file of the installed pack and the skill hash
      Given an installed skill pack with the review steps
      And a heartbeat by "local" at "2026-11-08T00:00:00Z" with these runs:
        | id | skill         |
        | z  | review/verify |
      When I run "ledger plan --run z"
      Then the JSON result "evidence.skill" is ".agents/skills/sdlc-review/steps/verify.md at skillHash abc"

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

    Scenario: A red required check on the head of the CR caps the score with the outcome
      Given a run "a" that ended "failed" on CR "7" whose checks are:
        | name     | state   |
        | Required | failure |
        | lint     | failure |
      When the hard facts are read with the required checks "Required"
      Then the JSON result has these values:
        | path  | value                                           |
        | score | 1                                               |
        | facts | outcome failed, red check on the head: Required |

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

  Rule: A judge with too little evidence grades unscorable, with a reason

    Background:
      Given a scorer "redundant-tests" on the scale "pass-fail" that applies to "build"

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

  Rule: A missing or old heartbeat is found

    Scenario: With no heartbeat the ledger is stale
      When I run "ledger stale --max-hours 2"
      Then the exit code is 1
      And the JSON result "stale" is "true"

    Scenario: A heartbeat older than max-hours is stale
      Given a heartbeat by "local" at "2020-01-01T00:00:00Z" with no runs
      When I run "ledger stale --max-hours 2"
      Then the exit code is 1
      And the JSON result "stale" is "true"
      And the JSON result "newest" is "2020-01-01T00:00:00Z"

    Scenario: A heartbeat within max-hours is not stale
      Given a heartbeat by "local" at "2020-01-01T00:00:00Z" with no runs
      When I run "ledger stale --max-hours 100000"
      Then the exit code is 0
      And the JSON result "stale" is "false"

  Rule: A wrong command line is a one-line usage error

    Scenario Outline: A flag without a value, an unknown flag or an unknown export format is refused
      When I run "<command>"
      Then the exit code is 2
      And the output says "<message>"

      Examples:
        | command                       | message                           |
        | ledger runs --since           | --since needs a value             |
        | ledger runs --bogus x         | unknown flag --bogus              |
