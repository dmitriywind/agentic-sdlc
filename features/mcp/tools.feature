# Source: src/mcp.ts "TOOLS", "annotations", "badArgument", "callTool"
@cli:mcp
Feature: Every port verb is an MCP tool
  `agentic-sdlc mcp` serves the board, forge and vcs verbs, dispatch and the ledger as tools over stdio. A tool
  takes the arguments of its verb, checked against the schema it publishes, and returns the verb's output.

  Rule: Every verb has a tool with a schema

    Scenario: A tool publishes the arguments of its verb
      When the client sends "tools/list"
      Then the tool "board_move" requires "id, status"
      And the argument "only_from" of the tool "board_move" is of type "string"

    Scenario Outline: Every verb of a CLI group has a tool
      Given the server is started with --allow "approve,status"
      When the client sends "tools/list"
      Then every verb of the <group> CLI has a tool, except "<except>"

      Examples:
        | group | except              |
        | board |                     |
        | forge |                     |
        | vcs   | tag, checkout-tests |

    Scenario: forge_list takes the bounds of the verb and forge_run takes an id
      When the client sends "tools/list"
      Then the tool "forge_list" takes the arguments "limit, since, checks"
      And the tool "forge_run" requires "id"

    Scenario Outline: A tool the server does not serve is not listed
      When the client sends "tools/list"
      Then the listed tools do not include "<tool>"

      Examples:
        | tool          |
        | vcs_tag       |

  Rule: Annotations come from one table

    Scenario: Every tool carries a title and its read-only and open-world hints
      Given the server is started with --allow "approve,status"
      When the client sends "tools/list"
      Then every tool has a title and read-only and open-world hints

    Scenario Outline: A tool is annotated by what it does
      Given the server is started with --allow "approve,status"
      When the client sends "tools/list"
      Then the annotation "<hint>" of the tool "<tool>" is "<value>"

      Examples:
        | tool             | hint            | value |
        | board_list       | readOnlyHint    | true  |
        | board_get        | readOnlyHint    | true  |
        | forge_diff       | readOnlyHint    | true  |
        | forge_approvals  | readOnlyHint    | true  |
        | forge_runs       | readOnlyHint    | true  |
        | forge_run        | readOnlyHint    | true  |
        | vcs_head         | readOnlyHint    | true  |
        | vcs_tags         | readOnlyHint    | true  |
        | board_milestone  | readOnlyHint    | false |
        | board_close      | readOnlyHint    | false |
        | board_close      | destructiveHint | true  |
        | vcs_drop         | readOnlyHint    | false |
        | vcs_drop         | destructiveHint | true  |
        | board_move       | destructiveHint | false |
        | board_move       | idempotentHint  | true  |
        | board_create     | idempotentHint  | false |
        | board_get        | openWorldHint   | true  |
        | vcs_head         | openWorldHint   | false |

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
        | board_get     | {}                                                  | board_get: missing required argument 'id' |
        | board_get     | {"id":null}                                         | missing required argument 'id'       |
        | board_get     | {"id":5}                                            | 'id' must be a string                |
        | board_list    | {"status":"Backlog"}                                | 'status' must be an array of strings |
        | board_list    | {"status":[1]}                                      | 'status'                             |
        | board_comments | {"id":"1","last":1.5}                              | 'last' must be a integer             |
        | forge_open    | {"source":"s","title":"t","body":"b","draft":"yes"} | 'draft' must be a boolean            |
        | board_get     | {"id":"1","nope":1}                                 | unknown argument 'nope'              |

    Scenario: An unknown tool is a protocol error
      When the client calls the tool "nope" with '{}'
      Then the reply "error.code" is "-32602"
      And the reply "error.message" mentions "unknown tool"

    Scenario: A valid call that fails is an error result, not a protocol error
      When the client calls the tool "board_get" with '{"id":"99"}'
      Then the tool result is an error
      And the reply has no "error"

  Rule: A tool returns what its verb prints

    Scenario: A new ticket is returned as text and as structured content
      When the client calls the tool "board_create" with '{"title":"T","body":"b","status":"Backlog"}'
      Then the structured content "id" is "1"
      And the structured content equals the text of the result

    Scenario: A list stays text only
      When the client calls the tool "board_list" with '{}'
      Then the tool result is a list
      And there is no structured content

    Scenario: A ticket is created through a tool
      When the client calls the tool "board_create" with '{"title":"T","body":"b","status":"Backlog"}'
      Then the tool result "id" is "1"
      And the tool result is not an error

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
        | board_assign    | {"id":"1","user":"bot"}                    |
        | board_set       | {"id":"1","field":"size","value":"M","clear":true} |
        | board_assign    | {"id":"1","none":true}                     |

    Scenario: A milestone is set
      When the client calls the tool "board_milestone" with '{"id":"1","name":"M1"}'
      Then the tool result "milestone" is "M1"

    Scenario: A milestone is cleared
      When the client calls the tool "board_milestone" with '{"id":"1","clear":true}'
      Then the tool result has no "milestone"
