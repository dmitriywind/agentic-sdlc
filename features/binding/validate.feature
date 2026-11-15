# Source: src/binding.ts "loadBinding" and "validateBinding"
@binding
Feature: A binding is validated before anything runs
  `agentic-sdlc validate` loads .agents/binding.yml and lists every broken rule as a problem. A binding with
  no problem is safe to run; a rule that only costs a surprise later is a warning (see warnings.feature).

  Rule: A complete binding has no problems

    Scenario: A binding read from YAML and complete has no problems
      Given a complete binding
      When the project binding file is loaded and validated
      Then validation finds no problems

  Rule: Each broken rule is reported on its own

    Scenario Outline: A broken key is named in a problem
      Given a complete binding
      And the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                   | value       | problem          |
        | version               | 1           | version must be 2 |
        | board.adapter         | "x"         | board.adapter 'x' |
        | board.statuses        | ["Ideas"]   | lacks 'Ready'    |
        | ready_size_limit      | "XL"        | not in sizes     |
        | models.deep           | ""          | models.deep      |
        | vcs.change_pattern    | "nope"      | <ticket>         |
        | product.environments  | []          | environments     |
        | product.proofs        | ["vibes"]   | vibes            |
        | executors.default.kind | "magic"    | magic            |

  Rule: The factory owner and the factory paths are required

    Scenario: A binding with no factory path globs fails
      Given a complete binding
      And the binding value "paths.factory" is '[]'
      When the binding is validated
      Then the problems mention "paths.factory must list"

    Scenario: A binding with no factory owner fails
      Given a complete binding
      And the binding has no value "owners.factory"
      When the binding is validated
      Then the problems mention "owners.factory must name"

  Rule: A binding needs a known profile

    Scenario: A binding with no profile fails and names it
      Given a complete binding
      And the binding has no value "profile"
      When the binding is validated
      Then the problems mention "profile 'undefined'"

    Scenario: An unknown profile fails and names it
      Given a complete binding
      And the binding value "profile" is '"team"'
      When the binding is validated
      Then the problems mention "profile 'team'"

  Rule: Only the Git VCS and the GitHub forge are supported

    Scenario: Another vcs adapter is rejected
      Given a complete binding
      And the binding value "vcs.adapter" is '"hg"'
      When the binding is validated
      Then the problems mention "vcs.adapter 'hg' is not one of git"

    Scenario: Another forge adapter is rejected
      Given a complete binding
      And the binding value "forge.adapter" is '"swarm"'
      When the binding is validated
      Then the problems mention "forge.adapter 'swarm' is not one of github"

  Rule: The vcs keys that the gates and the hook dereference are required

    Scenario Outline: A missing vcs key is a problem
      Given a complete binding
      And the binding has no value "vcs.<key>"
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                    | problem                         |
        | trunk                  | vcs.trunk must name the trunk branch |
        | release_prefix         | vcs.release_prefix              |
        | factory_change_pattern | vcs.factory_change_pattern      |
        | tag_prefix             | vcs.tag_prefix                  |

    Scenario: An empty tag prefix is valid
      Given a complete binding
      And the binding value "vcs.tag_prefix" is '""'
      When the binding is validated
      Then validation finds no problems

    Scenario: A release prefix must end in a slash
      Given a complete binding
      And the binding value "vcs.release_prefix" is '"release"'
      When the binding is validated
      Then the problems mention "must end in"

    Scenario: An empty release prefix fails
      Given a complete binding
      And the binding value "vcs.release_prefix" is '""'
      When the binding is validated
      Then the problems mention "release_prefix must not be empty"

  Rule: The heartbeat ticket is required

    Scenario: A binding with an empty heartbeat ticket fails
      Given a complete binding
      And the binding value "heartbeat.ticket" is '""'
      When the binding is validated
      Then the problems mention "heartbeat.ticket is empty"

  Rule: The keys that a gate or a stage would read wrong are checked

    Scenario Outline: A key that a gate reads unguarded is a problem
      Given a complete binding
      And the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                          | value                                        | problem                              |
        | board.done_statuses          | "Done"                                       | board.done_statuses must be a list   |
        | board.labels                 | {"human":"h","bug":"b"}                      | board.labels.feature                 |
        | vcs.version_scheme           | "date"                                       | vcs.version_scheme 'date'            |
        | learning.judge_tier          | "huge"                                       | learning.judge_tier 'huge'           |
        | learning.auto_merge_classes  | ["guardrail"]                                | auto_merge_classes 'guardrail'       |
        | mcps.both                    | {"url":"u","command":"c"}                    | mcps.both needs exactly one          |
        | executors.claude             | {"kind":"managed","api":"claude","token_env":"K"} | executors.claude.agent_env      |
        | executors.claude             | {"kind":"managed","api":"claude","token_env":"K"} | executors.claude.environment_env |

  Rule: The approval, learning and proof keys are checked

    Scenario Outline: A bad approval, learning or proof value is a problem
      Given a complete binding
      And the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                       | value       | problem                           |
        | forge.human_approval      | "sometimes" | forge.human_approval 'sometimes'  |
        | learning.bench_min_cases  | 0           | bench_min_cases must be           |
        | learning.bench_trials     | 2.5         | bench_trials must be              |
        | commands.proofs_on_base   | 3           | commands.proofs_on_base must be   |
        | learning.enabled          | "yes"       | learning.enabled must be true or false |

    Scenario: Well-formed approval, learning and proof keys are valid
      Given a complete binding
      And the binding value "forge.human_approval" is '"full-lane"'
      And the binding value "learning" is '{"enabled":true,"bench_min_cases":20,"bench_trials":3}'
      And the binding value "commands" is '{"preview":"deploy {cr}","proofs_on_base":"npx vitest run {files}"}'
      When the binding is validated
      Then validation finds no problems

    Scenario: A key that nothing reads is only a warning
      Given a complete binding
      And the binding value "product.kind" is '"web"'
      And the binding value "board.milestone" is '"required"'
      When the binding is validated
      Then validation finds no problems
      And the warnings are exactly:
        | product.kind is unused; remove it   |
        | board.milestone is unused; remove it |

  Rule: cycle.land_wait_minutes is whole minutes and cycle.max_rework a positive integer

    Scenario: The template documents the default wait
      Then the shipped binding template sets "cycle.land_wait_minutes" to 5

    Scenario: Zero minutes of wait and a positive cap are valid
      Given a complete binding
      And the binding value "cycle.land_wait_minutes" is '0'
      And the binding value "cycle.max_rework" is '3'
      When the binding is validated
      Then validation finds no problems

    Scenario Outline: A wait that is not a whole number of minutes is a problem
      Given a complete binding
      And the binding value "cycle.land_wait_minutes" is '<value>'
      When the binding is validated
      Then the problems mention "cycle.land_wait_minutes must be a whole number of minutes"

      Examples:
        | value |
        | -1    |
        | 1.5   |
        | "5"   |

    Scenario Outline: A rework cap that is not a positive integer is a problem
      Given a complete binding
      And the binding value "cycle.max_rework" is '<value>'
      When the binding is validated
      Then the problems mention "cycle.max_rework must be a positive integer"

      Examples:
        | value |
        | 0     |
        | 2.5   |
        | "x"   |
