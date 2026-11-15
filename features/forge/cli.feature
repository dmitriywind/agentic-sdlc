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

    Scenario: A CR is printed as JSON
      When the forge CLI runs "view 7"
      Then the exit code is 0
      And the result "n" is "7"
      And the result "author" is "ann"

    Scenario: A CR is found by its sha, with the flag as --k=v
      Given the commit "abc1234" is listed under the pull requests "7 head abc1234"
      When the forge CLI runs "view --sha=abc1234"
      Then the exit code is 0
      And the result "n" is "7"

  Rule: Exit 1 is a failure of the forge, exit 2 a usage error

    Scenario Outline: A command and its exit code
      When the forge CLI runs "<command>"
      Then the exit code is <code>

      Examples:
        | command               | code |
        | view 7                | 0    |
        | view                  | 2    |
        | bogus                 | 2    |
        | comment 7             | 2    |
        | view 8                | 1    |
        | run 43                | 1    |

    Scenario Outline: A flag the verb does not take, or takes wrongly, is a usage error
      When the forge CLI runs "<command>"
      Then the exit code is 2
      And the output says "<message>"

      Examples:
        | command                                                          | message                                          |
        | view 7 --bogus                                                   | unknown flag --bogus for forge view              |
        | list --state                                                     | --state needs a value                            |
        | list --checks=yes                                                | --checks takes no value                          |
        | list --limit abc                                                 | --limit needs a whole number, got 'abc'          |
        | comments 7 --last=x                                              | --last needs a whole number, got 'x'             |
        | list --since never                                               | --since must be an ISO date                      |
        | open --source b --title t --body-file /nonexistent/body.md       | --body-file cannot be read: /nonexistent/body.md |

  Rule: A status is never posted for a context only a gate owns

    Scenario Outline: A gate context is refused before any call
      When the forge CLI runs "status abcdef1 --context <context> --state success --description d"
      Then the exit code is 2
      And the forge makes no call

      Examples:
        | context         |
        | human-approval  |
        | ticket-linkage  |
        | proofs-on-base  |
        | agent-provenance |

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
