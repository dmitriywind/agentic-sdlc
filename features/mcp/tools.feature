# Source: src/mcp.ts "TOOLS", "annotations", "badArgument", "callTool"
@cli:mcp
Feature: Every port verb is an MCP tool
  `agentic-sdlc mcp` serves the board, forge and vcs verbs, dispatch and the ledger as tools over stdio. A tool
  takes the arguments of its verb, checked against the schema it publishes, and returns the verb's output.

  Rule: Every verb has a tool with a schema

  Rule: Annotations come from one table

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

  Rule: A tool returns what its verb prints

  Rule: Board tools act on the board

    Background:
      Given the board has these tickets:
        | title | status  |
        | T     | Backlog |

    Scenario: A ticket is moved
      When the client calls the tool "board_move" with '{"id":"1","status":"Ready","only_from":"Backlog"}'
      Then the tool result "status" is "Ready"

    Scenario: A move from another status is refused as an error result
      When the client calls the tool "board_move" with '{"id":"1","status":"Done","only_from":"Ready"}'
      Then the tool result is an error
      And the tool result says "not moved"

    Scenario Outline: A field, an assignee or a milestone is set or cleared
      When the client calls the tool "<tool>" with '<arguments>'
      Then the tool result is not an error

      Examples:
        | tool            | arguments                                  |
        | board_set       | {"id":"1","field":"size","value":"M"}      |
        | board_set       | {"id":"1","field":"size","value":"M","clear":true} |

    Scenario: A milestone is cleared
      When the client calls the tool "board_milestone" with '{"id":"1","clear":true}'
      Then the tool result has no "milestone"

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

    Scenario: With a review identity and no review token the call fails with Access
      Given the binding sets "forge.review_identity" to "rev-bot"
      When the client calls the tool "forge_verdict" with '{"n":"5","pass":true,"body":"report\n"}'
      Then the tool result is an error
      And the tool result says "Access:"
