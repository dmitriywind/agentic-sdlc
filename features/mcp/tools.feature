# Source: src/mcp.ts "TOOLS", "annotations", "badArgument", "callTool"
@cli:mcp
Feature: Every port verb is an MCP tool
  `agentic-sdlc mcp` serves the board, forge and vcs verbs, dispatch and the ledger as tools over stdio. A tool
  takes the arguments of its verb, checked against the schema it publishes, and returns the verb's output.

  Rule: A call is checked against the published schema

    Background:
      Given the board has these tickets:
        | title | status  |
        | T     | Backlog |

    Scenario Outline: A bad argument is a protocol error that names the argument
      When the client calls the tool "<tool>" with '<arguments>'
      Then the reply "error.code" is "-32602"
      And the reply "error.message" mentions "<message>"

      Examples:
        | tool          | arguments                                           | message                              |
        | board_list    | {"status":[1]}                                      | 'status'                             |
        | board_comments | {"id":"1","last":1.5}                              | 'last' must be a integer             |
        | board_get     | {"id":"1","nope":1}                                 | unknown argument 'nope'              |

  Rule: Board tools act on the board

    Background:
      Given the board has these tickets:
        | title | status  |
        | T     | Backlog |

    Scenario: A move from another status is refused as an error result
      When the client calls the tool "board_move" with '{"id":"1","status":"Done","only_from":"Ready"}'
      Then the tool result is an error
      And the tool result says "not moved"

  Rule: forge_verdict takes the report as its body

    Background:
      Given the binding sets "forge.adapter" to "github"
      And the binding sets "forge.options.repo" to "o/r"
      And the binding sets "forge.options.review_token_env" to "REV"
      And the binding sets "forge.review_identity" to ""
      And GitHub holds the open CR 5 at the head "abc1234" for the server

    Scenario: With one identity the report is posted and CI posts the status
      When the client calls the tool "forge_verdict" with '{"n":"5","pass":true,"body":"report\n"}'
      Then the tool result is not an error
      And the structured content "status" is "ci"
      And a call includes "issues/5/comments"
