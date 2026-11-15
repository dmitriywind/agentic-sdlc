# Owner: src/cli.ts, "main". The CLI as a process.
Feature: The CLI explains itself and reads its own options strictly
  An adopter who types a group, a flag or nothing gets usage text and a clear exit code, never a stack trace.

  Rule: Every group answers --help with its usage

    Scenario Outline: A group prints its usage and exits with code 0
      When I run "<group> --help"
      Then the exit code is 0
      And the output matches "usage: agentic-sdlc <group>"

      Examples:
        | group    |
        | init     |
        | board    |
        | forge    |
        | vcs      |
        | gate     |
        | dispatch |
        | ledger   |
        | bench    |

    Scenario: Init lists the profiles it knows
      When I run "init --help"
      Then the output matches "--profile individual\|individual-api\|organization"

    Scenario Outline: A group that needs a verb is a usage error without one
      When I run "<group>"
      Then the exit code is 2

      Examples:
        | group |
        | forge |
        | vcs   |
        | gate  |

    Scenario: No arguments lists every group and is a usage error
      When I run the CLI as typed ""
      Then the exit code is 2
      And the output matches "init[\s\S]*mcp"

  Rule: Own options are read strictly

    Scenario Outline: The version prints and exits with code 0
      When I run the CLI as typed "<flag>"
      Then the exit code is 0
      And the output matches "^\d+\.\d+\.\d+"

      Examples:
        | flag      |
        | --version |
        | -v        |

    Scenario: Help lists the groups and the gates
      When I run the CLI as typed "help"
      Then the exit code is 0
      And the output matches "usage: agentic-sdlc"
      And the output matches "gate .*skill-regression review"

    Scenario: A group asked for help prints its usage
      When I run the CLI as typed "gate --help"
      Then the output matches "usage: agentic-sdlc gate"

    Scenario: --root without a directory is a usage error
      When I run the CLI as typed "--root"
      Then the exit code is 2

    Scenario: --root followed by a group name is a usage error that says so
      When I run the CLI as typed "--root board list"
      Then the exit code is 2
      And the output says "--root needs a directory"

    Scenario: A name that only exists on the prototype chain is not a group
      When I run the CLI as typed "constructor"
      Then the exit code is 2
      And the output says "unknown group 'constructor'"

    Scenario: A flag value of --help is the verb's business, not a request for help
      When I run the CLI as typed "--root /nonexistent-agentic-sdlc board comment 1 --body-file --help"
      Then the output does not start with "usage: agentic-sdlc board"
