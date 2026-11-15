# Source: src/bench.ts "compare", "wilsonLower", "cli" (compare)
@cli:bench
Feature: Comparing two bench results
  `agentic-sdlc bench compare <a> <b>` says whether b regressed against a: its pass rate has a lower Wilson bound than a's
  on the cases they share, or there is too little evidence to say. It exits 1 when b regressed.

  Rule: The Wilson lower bound of a pass rate

    Scenario Outline: The lower bound of a pass rate at 95 percent
      When the Wilson lower bound of <passes> passes in <trials> trials is computed
      Then the JSON result has these values:
        | path  | value   |
        | lower | <lower> |

      Examples:
        | passes | trials | lower |
        | 0      | 0      | 0     |
        | 9      | 10     | 0.596 |

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

    Scenario: A candidate that passes more is not regressed
      When I run "bench compare b.json a.json"
      Then the exit code is 0
      And the JSON result "regressed" is "false"

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

    Scenario: Fewer trials of a shared case than learning.bench_trials
      Given the bench demands 3 shared cases and 3 trials
      When I run "bench compare a.json b.json"
      Then the exit code is 1
      And the JSON result "insufficient" is "2 trials on a shared case, need 3"

    Scenario: Without a binding minimum the defaults are 20 cases and 3 trials
      When I run "bench compare a.json b.json"
      Then the exit code is 1
      And the JSON result "regressed" is "true"

    Scenario: The same evidence is enough when the binding asks for no more
      Given the bench demands 3 shared cases and 2 trials
      When I run "bench compare a.json b.json"
      Then the exit code is 0

    Scenario: compare needs two result files
      When I run "bench compare a.json"
      Then the exit code is 2

  Rule: A candidate must run the cases the baseline ran

    Background:
      Given the bench demands 1 shared cases and 1 trials

    Scenario: A candidate that shares no case with the baseline is regressed
      Given a bench result "a.json" of the model "a" that ran:
        | id | pass | minutes |
        | 1  | true | 1       |
      And a bench result "b.json" of the model "b" that ran:
        | id | pass | minutes |
        | 2  | true | 1       |
      When I run "bench compare a.json b.json"
      Then the exit code is 1

    Scenario: A candidate that ran fewer cases than the baseline is regressed
      Given a bench result "a.json" of the model "a" that ran:
        | id | pass | minutes |
        | 1  | true | 1       |
        | 2  | true | 1       |
      And a bench result "b.json" of the model "b" that ran:
        | id | pass | minutes |
        | 1  | true | 1       |
      When I run "bench compare a.json b.json"
      Then the exit code is 1
      And the JSON result "insufficient" is "b ran fewer cases than a"

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
