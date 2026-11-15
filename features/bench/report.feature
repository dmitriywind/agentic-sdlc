# Source: src/bench.ts "report", "cli" (report)
@cli:bench
Feature: The bench report
  `agentic-sdlc bench report --suite <s>` groups the results of one suite by model and executor, shows the pass rate and
  the median minutes of a case, and marks the rows that no other row beats on both.

  Rule: Results are grouped per model and the Pareto front is marked

    Background:
      Given a bench result ".agents/bench/results/0.json" of the model "cheap" that ran:
        | id | pass  | minutes |
        | 1  | true  | 1       |
        | 2  | false | 1       |
      And that result is of the suite "s"
      And a bench result ".agents/bench/results/1.json" of the model "best" that ran:
        | id | pass | minutes |
        | 1  | true | 5       |
        | 2  | true | 5       |
      And that result is of the suite "s"
      And a bench result ".agents/bench/results/2.json" of the model "worse" that ran:
        | id | pass  | minutes |
        | 1  | false | 6       |
        | 2  | true  | 6       |
      And that result is of the suite "s"
      And a bench result ".agents/bench/results/3.json" of the model "other" that ran:
        | id | pass | minutes |
        | 1  | true | 0.1     |
      And that result is of the suite "x"

    Scenario: A row has the pass rate, the median minutes and the number of case runs, best first
      When I run "bench report --suite s"
      Then the JSON result has these values:
        | path                 | value                |
        | rows.*.model         | best, cheap, worse   |
        | rows.*.passRate      | 1, 0.5, 0.5          |
        | rows.*.medianMinutes | 5, 1, 6              |
        | rows.*.n             | 2, 2, 2              |

    Scenario: A model that another model does not beat on both is on the Pareto front
      When I run "bench report --suite s"
      Then the JSON result "rows.*.pareto" is "true, true, false"

    Scenario: Only the results of the suite are read
      When I run "bench report --suite s"
      Then the JSON result "results" is "3"

    Scenario: A report needs a suite
      When I run "bench report"
      Then the exit code is 2

  Rule: Results are grouped by executor name, not by kind

    Scenario: Two runs of one executor are one row
      Given a bench result "a1.json" of the model "m" that ran:
        | id | pass | minutes |
        | 1  | true | 1       |
      And that result is of the suite "s"
      And that result is of the executor "bot-a" of the kind "command"
      And a bench result "b.json" of the model "m" that ran:
        | id | pass  | minutes |
        | 1  | false | 1       |
      And that result is of the suite "s"
      And that result is of the executor "bot-b" of the kind "command"
      And a bench result "a2.json" of the model "m" that ran:
        | id | pass | minutes |
        | 1  | true | 1       |
      And that result is of the suite "s"
      And that result is of the executor "bot-a" of the kind "command"
      When I run "bench report --suite s a1.json b.json a2.json"
      Then the JSON result has these values:
        | path                  | value               |
        | rows.*.executor       | bot-a, bot-b        |
        | rows.*.executorKind   | command, command    |
        | rows.*.n              | 2, 1                |
        | rows.*.passRate       | 1, 0                |

  Rule: A result with budget-skipped cases is left off the Pareto front

    Scenario: A row with skipped runs is incomplete
      Given a bench result "cut.json" of the model "cut" that ran:
        | id | pass  | minutes | skipped |
        | 1  | true  | 1       |         |
        | 2  | false | 0       | budget  |
      And that result is of the suite "s"
      And a bench result "full.json" of the model "full" that ran:
        | id | pass | minutes |
        | 1  | true | 1       |
        | 2  | true | 1       |
      And that result is of the suite "s"
      When I run "bench report --suite s cut.json full.json"
      Then the JSON result has these values:
        | path              | value          |
        | rows.*.model      | cut, full      |
        | rows.*.n          | 1, 2           |
        | rows.*.incomplete | true, <absent> |
        | rows.*.skipped    | 1, <absent>    |
        | rows.*.pareto     | false, true    |
