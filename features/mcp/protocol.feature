# Source: src/mcp.ts "handle" (references/architecture.md section 10)
@cli:mcp
Feature: The MCP server speaks both protocol shapes
  The server answers the `initialize` handshake of the 2024-11-05 to 2025-11-25 revisions, and the stateless
  shape of 2026-07-28, where every request carries its version and capabilities in `_meta` and no handshake
  comes first. A request is read as the modern shape when its `_meta` carries those fields.

  Rule: initialize answers the requested version when supported, else the latest

    Scenario Outline: A supported version is answered as requested
      When the client sends "initialize" with '{"protocolVersion":"<version>"}'
      Then the reply "result.protocolVersion" is "<version>"

      Examples:
        | version    |
        | 2025-11-25 |
        | 2025-06-18 |
        | 2025-03-26 |
        | 2024-11-05 |

    Scenario Outline: Any other version is answered with the latest
      When the client sends "initialize" with '<params>'
      Then the reply "result.protocolVersion" is "2025-11-25"

      Examples:
        | params                         |
        | {"protocolVersion":"2099-01-01"} |
        | {}                             |
        | {"protocolVersion":7}          |

  Rule: A legacy session is answered without resultType, ttlMs or _meta

    Scenario: initialize, then ping, tools/list and the initialized notification
      When the client sends the session:
        | method                    | params                                                                                         | id |
        | initialize                | {"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"t","version":"1"}}     | 1  |
        | notifications/initialized |                                                                                                |    |
        | ping                      |                                                                                                | 2  |
        | tools/list                |                                                                                                | 3  |
      Then reply 1 "jsonrpc" is "2.0"
      And reply 1 "id" is "1"
      And reply 1 "result" holds the keys "capabilities, protocolVersion, serverInfo"
      And reply 1 "result.capabilities" is '{"tools":{}}'
      And reply 1 "result.serverInfo.name" is "agentic-sdlc"
      And reply 2 has no reply
      And reply 3 is empty
      And reply 4 "result" holds the keys "tools"
      And reply 4 has no "result.resultType"

    Scenario: A tool result carries content and no resultType or _meta
      Given the board has these tickets:
        | title | status  |
        | T     | Backlog |
      When the client calls the tool "board_get" with '{"id":"1"}'
      Then the reply has no "result.resultType"
      And the reply has no "result._meta"
      And the reply "result.content.0.type" is "text"

    Scenario: An unknown method is a protocol error
      When the client sends "nope"
      Then the reply "error.code" is "-32601"

  Rule: A request whose method is not a string is invalid

    Scenario Outline: A non-string method answers -32600 with the request id
      When the client sends a request whose method is '<method>' with id '<id>'
      Then the reply "error.code" is "-32600"
      And the reply "id" is "<shown>"

      Examples:
        | method | id    | shown |
        | 7      | 42    | 42    |
        | null   | "abc" | abc   |

  Rule: The 2026-07-28 shape is stateless

    Scenario: server/discover names the supported versions and how long the answer may be cached
      When the modern client sends "server/discover"
      Then the reply "id" is "7"
      And the reply "result.resultType" is "complete"
      And the reply "result.supportedVersions" starts with "2026-07-28, 2025-11-25"
      And the reply "result.capabilities" is '{"tools":{}}'
      And the server carries its name in the _meta of the reply
      And the reply "result.ttlMs" is a whole number from 0
      And the reply "result.cacheScope" is one of "public, private"

    Scenario: tools/list is complete, cacheable and the same list as the legacy shape
      When the modern client sends "tools/list"
      Then the reply "result.resultType" is "complete"
      And the reply "result.ttlMs" is a whole number from 0
      And the reply "result.cacheScope" is one of "public, private"
      And the reply has no "result.nextCursor"
      And the server carries its name in the _meta of the reply
      And every listed tool has an object input schema
      And the server answers with the same tool names as the legacy shape

    Scenario: This server never issues a cursor
      When the modern client sends "tools/list" with '{"cursor":"x"}'
      Then the reply "error.code" is "-32602"

    Scenario: A tool call result is complete and carries structured content
      When the modern client calls the tool "board_create" with '{"title":"T","body":"b","status":"Backlog"}'
      Then the reply "result.resultType" is "complete"
      And the reply "result.content.0.type" is "text"
      And the reply has no "result.isError"
      And the reply "result.structuredContent.id" is "1"
      And the server carries its name in the _meta of the reply

    Scenario: A failing tool is an error result that is still complete
      When the modern client calls the tool "board_get" with '{"id":"99"}'
      Then the reply "result.resultType" is "complete"
      And the reply "result.isError" is "true"

    Scenario: An unknown tool is a protocol error that carries the request id and no result
      When the modern client calls the tool "nope" with '{}'
      Then the reply "id" is "7"
      And the reply "error.code" is "-32602"
      And the reply has no "result"

    Scenario: A bad argument is a protocol error with no data
      When the modern client calls the tool "board_get" with '{}'
      Then the reply "error.code" is "-32602"
      And the reply has no "error.data"

  Rule: A modern request names its version and capabilities

    Scenario: A request with a version but no capabilities is invalid
      When a client sends "tools/list" with only "protocolVersion" in its _meta
      Then the reply "id" is "3"
      And the reply "error.code" is "-32602"

    Scenario: A request with capabilities but no version is invalid
      When a client sends "tools/list" with only "clientCapabilities" in its _meta
      Then the reply "error.code" is "-32602"

    Scenario: server/discover with no _meta is invalid
      When a client sends "server/discover" with no params
      Then the reply "id" is "5"
      And the reply "error.code" is "-32602"

    Scenario Outline: An unsupported version is refused with the supported ones listed
      When the modern client sends "<method>" for the version "1900-01-01"
      Then the reply "id" is "6"
      And the reply "error.code" is "-32022"
      And the reply "error.message" is "Unsupported protocol version"
      And the reply "error.data.requested" is "1900-01-01"
      And the reply "error.data.supported" includes "2026-07-28, 2025-11-25"

      Examples:
        | method          |
        | tools/list      |
        | tools/call      |
        | server/discover |

    Scenario Outline: A method of the handshake era is not part of the modern shape
      When the modern client sends "<method>"
      Then the reply "error.code" is "-32601"

      Examples:
        | method            |
        | ping              |
        | logging/setLevel  |
        | resources/list    |

    Scenario: A notification is not answered
      When the client sends the notification "notifications/cancelled"
      Then the server sends no reply
