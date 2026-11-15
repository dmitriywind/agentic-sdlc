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
        | gate     |

    Scenario Outline: A group that needs a verb is a usage error without one
      When I run "<group>"
      Then the exit code is 2

      Examples:
        | group |
        | forge |
        | gate  |

  Rule: Own options are read strictly

    Scenario: The version prints and exits with code 0
      When I run the CLI as typed "--version"
      Then the exit code is 0
      And the output matches "^\d+\.\d+\.\d+"

    Scenario: No arguments lists every group and is a usage error
      When I run the CLI as typed ""
      Then the exit code is 2
      And the output matches "init[\s\S]*mcp"
