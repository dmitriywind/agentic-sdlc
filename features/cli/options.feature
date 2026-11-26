# Owner: src/cli.ts, "main". The CLI as a process.
Feature: The CLI explains itself
  An adopter who types a group, a flag or nothing gets usage text and a clear exit code, never a stack trace.

  Scenario Outline: Help exits 0; a group without its verb, or no group, is a usage error
    When I run the CLI as typed "<line>"
    Then the exit code is <code>
    And the output matches "<usage>"

    Examples:
      | line         | code | usage                       |
      | board --help | 0    | usage: agentic-sdlc board   |
      | forge        | 2    | usage: agentic-sdlc forge   |
      |              | 2    | init[\s\S]*mcp              |
