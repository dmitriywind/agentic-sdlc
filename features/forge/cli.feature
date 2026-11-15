# Source: src/forge/index.ts "cli", "VERBS", "GATE_CONTEXTS"; src/forge/util.ts "parseStrict", "bodyFile", "guard"
@cli:forge
Feature: The forge CLI prints JSON and exits with a clear code
  `agentic-sdlc forge <verb>` prints its result as JSON on stdout. Exit 0 is success, 1 a failure of the forge, 2 a
  usage error: a verb or a flag it does not know, a flag without its value, a value of the wrong kind, a file it cannot
  read. `--k=v` is the same as `--k v`.

  Background:
    Given the github forge for the repo "o/r"
    And the repo has the open pull request 7

  Rule: The result is JSON on stdout

    Scenario: A CR is found by its sha, with the flag as --k=v
      Given the commit "abc1234" is listed under the pull requests "7 head abc1234"
      When the forge CLI runs "view --sha=abc1234"
      Then the exit code is 0
      And the result "n" is "7"

  Rule: Exit 1 is a failure of the forge, exit 2 a usage error

    Scenario Outline: A flag the verb does not take, or takes wrongly, is a usage error
      When the forge CLI runs "<command>"
      Then the exit code is 2
      And the output says "<message>"

      Examples:
        | command                                                          | message                                          |
        | comments 7 --last=x                                              | --last needs a whole number, got 'x'             |

  Rule: A status is never posted for a context only a gate owns

  Rule: list and run take their flags

    Scenario: A list takes a state, a limit, a since date and --checks
      When the forge CLI runs "list --state merged --limit 5 --since 2026-01-01 --checks"
      Then the exit code is 0

    Scenario: A run is printed by its id
      Given the CI runs are:
        | id | name | branch | sha | status    | conclusion | url | at |
        | 42 | ci   | main   | s   | completed | failure    | u   | t  |
      When the forge CLI runs "run 42"
      Then the exit code is 0
      And the result "state" is "failure"

  Rule: The vcs CLI reads its flags as strictly

    Scenario Outline: A flag the vcs verb does not take, or a flag without its value, is a usage error
      Given the binding sets "vcs.adapter" to "git"
      And the binding sets "vcs.trunk" to "main"
      When I run "vcs <command>"
      Then the exit code is 2
      And the output says "<message>"

      Examples:
        | command         | message                           |
        | head --bogus    | unknown flag --bogus for vcs head |
        | changed --since | --since needs a value             |
