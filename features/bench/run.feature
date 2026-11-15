# Source: src/bench.ts "runBench", "agentCommand", "resolveExecutor", "quote", "fill", "shell", "prompt"; learning.bench_budget
@cli:bench
Feature: Running the bench
  `agentic-sdlc bench run` replays each case: the agent works on the base revision in a tree of its own, and verify runs
  in a fresh tree with the agent's product code, the head's tests and the head's config. Every tree is outside the
  project and is deleted at the end.

  Background:
    Given a project that benches with the agent command "agent --model {model} --prompt {prompt_file} --cwd {workdir}"
    And the revision "base" holds the files:
      | path             | content   |
      | src/a.ts         | old       |
      | src/gone.ts      | g         |
      | package.json     | base-pkg  |
      | test/old.test.ts | base-test |
    And the revision "head" holds the files:
      | path             | content   |
      | src/a.ts         | solution  |
      | src/gone.ts      | g         |
      | package.json     | head-pkg  |
      | test/old.test.ts | base-test |
      | test/a.test.ts   | oracle    |

  Rule: The agent never sees the oracle, and what it changes in tests and config does not count

    Background:
      Given the agent edits the files:
        | path             | content   |
        | src/a.ts         | agent     |
        | src/b.ts         | new       |
        | src/gone.ts      | <deleted> |
        | test/old.test.ts | gamed     |
        | test/a.test.ts   | gamed     |
        | package.json     | gamed     |
      And the agent takes 2 minutes
      And the binding sets "commands.install" to "npm ci"

    Scenario: The agent works on the base revision without the oracle test
      When the bench runs 1 cases
      Then the agent saw these files:
        | path             | content   |
        | package.json     | base-pkg  |
        | src/a.ts         | old       |
        | src/gone.ts      | g         |
        | test/old.test.ts | base-test |

    Scenario: The agent is told to follow the build skill and given the spec
      When the bench runs 1 cases
      Then the agent was told to follow the build skill and to do "do it"

    Scenario: The agent command is the binding's, with the model, the prompt and the tree as single words
      When the bench runs 1 cases
      Then the agent command matches "^agent --model .m1. --prompt .+ --cwd .+agentic-bench-"

    Scenario: Verify runs in a fresh tree with the agent's product code and the head's proof and config
      When the bench runs 1 cases
      Then the commands after the agent are:
        | npm ci   |
        | npm test |
      And verify run 1 saw these files:
        | path             | content   |
        | src/a.ts         | agent     |
        | src/b.ts         | new       |
        | src/gone.ts      | <absent>  |
        | test/a.test.ts   | oracle    |
        | test/old.test.ts | base-test |
        | package.json     | head-pkg  |

    Scenario: A case passes when verify passes, and the pass rate and the minutes are summed
      Given the verify run number 2 fails
      When the bench runs 2 cases
      Then the JSON result has these values:
        | path              | value |
        | cases.*.id        | 1, 2  |
        | cases.*.pass      | true, false |
        | cases.*.minutes   | 2, 2  |
        | passRate          | 0.5   |
        | minutes           | 4     |

    Scenario: No tree is made inside the project, and every tree is deleted
      When the bench runs 1 cases
      Then no tree was made inside the project
      And every tree was deleted

    Scenario: The agent's changed files are written for the judge
      When the bench runs 1 cases with the options:
        | scorer-dir | si |
      Then the JSON result "cases.0.scorerInput" is "si/1.md"
      And the project file "si/1.md" matches 'do it[\s\S]*### src/a\.ts\s+Before:\s+`{4}\s+old[\s\S]*After:\s+`{4}\s+agent'

  Rule: A candidate factory is run with its own skill and binding

    Scenario: The agent follows the skill and the command of the candidate revision
      Given the revision "fac" is a factory whose agent command is "fac-agent --prompt {prompt_file} --cwd {workdir}"
      When the bench runs 1 cases with the options:
        | factory | fac |
      Then the agent command matches "^fac-agent "
      And the agent followed the skill whose text is "candidate"
      And the JSON result has these values:
        | path         | value   |
        | factory      | fac     |
        | executor     | harness |
        | executorKind | harness |

  Rule: A dry run starts nothing

    Scenario: The commands are printed with placeholders for the trees
      When the bench runs 1 cases with the options:
        | dry-run | true |
      Then the output matches "--cwd .<workdir>."
      And the bench started no command

  Rule: A run can repeat each case

    Scenario: Each trial is a row, each in fresh trees
      Given the verify run number 2 fails
      When the bench runs 1 cases with the options:
        | trials | 3 |
      Then the JSON result has these values:
        | path           | value             |
        | cases.*.trial  | 1, 2, 3           |
        | cases.*.pass   | true, false, true |
      And the bench made 9 trees

  Rule: A run stays inside learning.bench_budget

    Scenario: A run that plans more runs than max_runs is refused before any case starts
      Given the bench budget allows 5 runs
      When the bench runs 3 cases with the options:
        | trials | 2 |
      Then the exit code is 1
      And the output says "plans 6 runs (3 cases x 2 trials)"
      And the output says "max_runs 5"
      And the bench made 0 trees

    Scenario: A dry run is never refused
      Given the bench budget allows 1 runs
      When the bench runs 3 cases with the options:
        | trials  | 2    |
        | dry-run | true |
      Then the exit code is 0

    Scenario: --allow-over-budget runs them all
      Given the bench budget allows 5 runs
      When the bench runs 3 cases with the options:
        | trials            | 2    |
        | allow-over-budget | true |
      Then the JSON result "cases.length" is "6"

    Scenario: After max_minutes no new case starts, and the rest are skipped, not failed
      Given the bench budget allows 12 minutes
      And the clock moves 5 minutes on every reading
      When the bench runs 3 cases
      Then the JSON result has these values:
        | path           | value               |
        | cases.*.id     | 1, 2, 3             |
        | cases.*.pass   | true, false, false  |
        | cases.*.skipped | <absent>, budget, budget |
        | passRate       | 1                   |

  Rule: The agent command comes from the executor

    Background:
      Given the executors:
        | name    | kind    | run                                                        | url_env | max_turns |
        | default | harness |                                                            |         | 40        |
        | bot     | command | bot {skill} {ticket} {prompt_file} {workdir}               |         |           |
        | hook    | webhook |                                                            | U       |           |

    Scenario Outline: A harness uses binding.agent_command and a command executor its run template
      When the agent command is built for the executor '<executor>'
      Then the agent command is "<command>"

      Examples:
        | executor                          | command                                          |
        | harness                           | agent --model <model> --prompt <prompt_file> --cwd <workdir> |
        | bot                               | bot <skill> <ticket> <prompt_file> <workdir>     |
        | {"kind":"command","run":"x {model}"} | x <model>                                     |

    Scenario: The stage caps fill a command executor, and are empty when unset
      When the agent command is built for the executor '{"kind":"command","run":"bot {max_turns} {max_minutes}"}'
      Then the agent command is "bot <max_turns> <max_minutes>"

    Scenario: A webhook executor cannot run on the bench
      When the agent command is built for the executor "hook"
      Then the exit code is 1
      And the output says "cannot run on the bench"

    Scenario: An unknown executor is an error
      When the agent command is built for the executor "nope"
      Then the exit code is 1
      And the output says "no executor"

  Rule: Each value reaches the shell as one word

    Scenario Outline: A value is quoted for the shell of its platform
      When "<value>" is quoted for a <platform> shell
      Then the quoted value is "<quoted>"

      Examples:
        | platform | value           | quoted                    |
        | posix    | C:/my dir/it's  | 'C:/my dir/it'\''s'       |
        | windows  | C:<BS>Temp Dir<BS> | <DQ>C:<BS>Temp Dir<BS><BS><DQ> |

    Scenario Outline: A value with a double quote on Windows, or a newline or NUL anywhere, is refused
      When "<value>" is quoted for a <platform> shell
      Then the exit code is 1
      And the output says "<message>"

      Examples:
        | platform | value | message             |
        | windows  | a<DQ>b | double quote       |
        | posix    | a<LF>b | newline or NUL     |
        | windows  | a<LF>b | newline or NUL     |
        | posix    | a<NUL>b | newline or NUL    |
        | windows  | a<NUL>b | newline or NUL    |

    Scenario: The platform shell sees one argument per value
      When a command that prints its arguments is run with the values "x y'z" and "100%PATH%"
      Then the JSON result holds:
        """
        ["x y'z", "100%PATH%"]
        """

  Rule: The bench replays the build step of the pack of the tree it runs

    Scenario Outline: The step file is found in an installed pack, named by the prefix of its install
      Given an installed pack whose skills are named with the prefix "<prefix>"
      When the file of the bench step is looked up in the project
      Then the JSON result has these values:
        | path | value  |
        | step | build  |
        | file | <file> |

      Examples:
        | prefix | file                              |
        | sdlc-  | .agents/skills/sdlc-build/SKILL.md |
        |        | .agents/skills/build/SKILL.md      |

    Scenario: Without a pack the copied-install path is used
      When the file of the bench step is looked up in the project
      Then the JSON result "file" is ".agents/skills/sdlc-build/SKILL.md"
