# Source: src/dispatch.ts "limitsOf", "limitsText"; src/binding.ts "validateBinding"; skills/sdlc/references/executors.md
@cli:dispatch
Feature: A stage's caps reach its executor
  A stage may cap its turns, tokens and minutes. A stage that sets no cap inherits the default's, and every executor
  kind is handed the caps its own way.

  Background:
    Given the installed skill pack

  Rule: Each executor kind is handed the caps

    Scenario: A command gets the caps in its template, in its environment and in the start record
      Given the executor "default" is '{"kind":"harness","max_turns":80,"max_minutes":20}'
      And the executor "ship" is '{"kind":"command","run":"bot --max-turns {max_turns} --tokens {max_tokens}","max_tokens":5000,"max_turns":30}'
      When dispatch runs "ship --ticket 5"
      Then the command line is the template "bot --max-turns {} --tokens {}" filled with the quoted words "30|5000"
      And the child environment holds "AGENTIC_SDLC_MAX_TURNS" as "30"
      And the child environment holds "AGENTIC_SDLC_MAX_TOKENS" as "5000"
      And the child environment holds "AGENTIC_SDLC_MAX_MINUTES" as "20"
      And the result "limits.max_turns" is "30"
      And the result "limits.max_tokens" is "5000"
      And the result "limits.max_minutes" is "20"

    Scenario: A cap nobody sets is an empty word and no variable
      Given the executor "default" is '{"kind":"command","run":"bot {max_turns}"}'
      When dispatch runs "build --ticket 5"
      Then the command line is the template "bot {}" filled with the quoted words ""
      And the child environment has no "AGENTIC_SDLC_MAX_TURNS"
      And the start record has no "limits"

    Scenario: A harness stage inherits the default's caps and the task states them
      Given the executor "default" is '{"kind":"harness","max_turns":80,"max_minutes":20}'
      When dispatch runs "build --ticket 5"
      Then the result "limits.max_turns" is "80"
      And the result "limits.max_minutes" is "20"
      And the start record has no "limits.max_tokens"
      And the instruction matches "at most 80 turns, 20 minutes"

    Scenario: A webhook body carries the limits
      Given the executor "default" is '{"kind":"webhook","url_env":"U","max_turns":9}'
      And the runner sets "U" to "https://h/x"
      When dispatch runs "build --ticket 1"
      Then the first call matches '"limits":\{"max_turns":9\}'

    Scenario: A managed task text states the limits
      Given the executor "default" is '{"kind":"managed","api":"cursor","repo_url":"https://r","token_env":"T","max_tokens":700}'
      And the runner sets "T" to "t"
      When dispatch runs "build --ticket 1"
      Then the first call matches "at most 700 tokens"

  Rule: The caps are positive integers

    Scenario Outline: A cap that is not a positive integer is a problem
      Given a complete binding
      And the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                           | value | problem                                                |
        | executors.default.max_turns   | 0     | executors.default.max_turns must be a positive integer |
        | executors.default.max_minutes | 1.5   | max_minutes must be a positive integer                 |
        | cycle.max_tokens_per_ticket   | -1    | cycle.max_tokens_per_ticket must be a positive integer |

    Scenario: The bench budget knows runs and minutes only
      Given a complete binding
      And the binding value "learning.bench_budget" is '{"max_tokens":5}'
      When the binding is validated
      Then the problems mention "bench_budget.max_tokens is not a bench cap"

    Scenario: A bench cap is a positive integer too
      Given a complete binding
      And the binding value "learning.bench_budget" is '{"max_runs":"build"}'
      When the binding is validated
      Then the problems mention "bench_budget.max_runs must be a positive integer"

    Scenario: Sound caps are no problem
      Given a complete binding
      And the binding value "executors.default.max_turns" is '5'
      And the binding value "cycle.max_tokens_per_ticket" is '9'
      And the binding value "learning.bench_budget" is '{"max_runs":4,"max_minutes":9}'
      When the binding is validated
      Then the problems do not mention "max_turns"
      And the problems do not mention "max_tokens_per_ticket"
      And the problems do not mention "bench_budget"
