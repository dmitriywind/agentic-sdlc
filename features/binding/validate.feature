# Source: src/binding.ts "loadBinding" and "validateBinding"
@binding
Feature: A binding is validated before anything runs
  `agentic-sdlc validate` loads .agents/binding.yml and lists every broken rule as a problem. A binding with
  no problem is safe to run; a rule that only costs a surprise later is a warning (see warnings.feature).

  Rule: A complete binding has no problems

  Rule: Each broken rule is reported on its own

    Scenario Outline: A broken key is named in a problem
      Given a complete binding
      And the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                   | value       | problem          |
        | board.adapter         | "x"         | board.adapter 'x' |
        | ready_size_limit      | "XL"        | not in sizes     |

  Rule: The factory owner and the factory paths are required

  Rule: A binding needs a known profile

  Rule: Only the Git VCS and the GitHub forge are supported

  Rule: The vcs keys that the gates and the hook dereference are required

  Rule: The heartbeat ticket is required

  Rule: The keys that a gate or a stage would read wrong are checked

    Scenario Outline: A key that a gate reads unguarded is a problem
      Given a complete binding
      And the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                          | value                                        | problem                              |
        | board.done_statuses          | "Done"                                       | board.done_statuses must be a list   |
        | executors.claude             | {"kind":"managed","api":"claude","token_env":"K"} | executors.claude.agent_env      |

  Rule: The approval, learning and proof keys are checked

    Scenario Outline: A bad approval, learning or proof value is a problem
      Given a complete binding
      And the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                       | value       | problem                           |
        | learning.bench_min_cases  | 0           | bench_min_cases must be           |
        | commands.proofs_on_base   | 3           | commands.proofs_on_base must be   |

  Rule: cycle.land_wait_minutes is whole minutes and cycle.max_rework a positive integer

    Scenario: The template documents the default wait
      Then the shipped binding template sets "cycle.land_wait_minutes" to 5
