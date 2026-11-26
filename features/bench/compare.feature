# Source: src/bench.ts "compare", "wilsonLower", "cli" (compare)
@cli:bench
Feature: Comparing two bench results
  `agentic-sdlc bench compare <a> <b>` says whether b regressed against a: its pass rate has a lower Wilson bound than a's
  on the cases they share, or there is too little evidence to say. It exits 1 when b regressed.

  Rule: b regresses when its lower bound is below a's

    Background:
      Given the bench demands 3 shared cases and 2 trials
      And a bench result "a.json" of the model "a" that ran:
        | id | pass  | minutes |
        | 1  | true  | 1       |
        | 1  | true  | 1       |
        | 2  | true  | 1       |
        | 2  | true  | 1       |
        | 3  | true  | 1       |
        | 3  | true  | 1       |
        | 9  | false | 5       |
      And a bench result "b.json" of the model "b" that ran:
        | id | pass  | minutes |
        | 1  | false | 1       |
        | 1  | true  | 1       |
        | 2  | true  | 1       |
        | 2  | true  | 1       |
        | 3  | true  | 1       |
        | 3  | true  | 1       |

    Scenario: A candidate that passes less on the shared cases is regressed
      When I run "bench compare a.json b.json"
      Then the exit code is 1
      And the JSON result has these values:
        | path      | value |
        | regressed | true  |
        | cases     | 3     |
        | a.trials  | 2     |
        | a.lower   | 0.610 |
        | b.lower   | 0.436 |

  Rule: Too little evidence is a regression

    Background:
      Given a bench result "a.json" of the model "a" that ran:
        | id | pass  | minutes |
        | 1  | true  | 1       |
        | 1  | true  | 1       |
        | 2  | true  | 1       |
        | 2  | true  | 1       |
        | 3  | true  | 1       |
        | 3  | true  | 1       |
      And a bench result "b.json" of the model "b" that ran:
        | id | pass  | minutes |
        | 1  | true  | 1       |
        | 1  | true  | 1       |
        | 2  | true  | 1       |
        | 2  | true  | 1       |
        | 3  | true  | 1       |
        | 3  | true  | 1       |

    Scenario: Fewer shared cases than learning.bench_min_cases
      Given the bench demands 4 shared cases and 2 trials
      When I run "bench compare a.json b.json"
      Then the exit code is 1
      And the JSON result has these values:
        | path           | value                    |
        | regressed      | true                     |
        | insufficient   | 3 shared cases, need 4   |

  Rule: A result with budget-skipped cases is incomplete, never a pass

    Scenario: A candidate with skipped cases is regressed and says why
      Given the bench demands 1 shared cases and 1 trials
      And a bench result "a.json" of the model "m" that ran:
        | id | pass | minutes |
        | 1  | true | 1       |
        | 2  | true | 1       |
      And a bench result "b.json" of the model "m" that ran:
        | id | pass  | minutes | skipped |
        | 1  | true  | 1       |         |
        | 2  | false | 0       | budget  |
      When I run "bench compare a.json b.json"
      Then the exit code is 1
      And the output says "b skipped 1 runs on its budget"
      And the JSON result "cases" is "1"
