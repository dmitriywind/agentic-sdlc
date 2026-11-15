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
        | bot                               | bot <skill> <ticket> <prompt_file> <workdir>     |
