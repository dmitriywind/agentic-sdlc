# Source: src/mcp.ts "handle" (references/architecture.md section 10)
@cli:mcp
Feature: The MCP server speaks both protocol shapes
  The server answers the `initialize` handshake of the 2024-11-05 to 2025-11-25 revisions, and the stateless
  shape of 2026-07-28, where every request carries its version and capabilities in `_meta` and no handshake
  comes first. A request is read as the modern shape when its `_meta` carries those fields.

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

  Rule: The 2026-07-28 shape is stateless

    Scenario: tools/list is complete, cacheable and the same list as the legacy shape
      When the modern client sends "tools/list"
      Then the reply "result.resultType" is "complete"
      And the reply "result.ttlMs" is a whole number from 0
      And the reply "result.cacheScope" is one of "public, private"
      And the reply has no "result.nextCursor"
      And the server carries its name in the _meta of the reply
      And every listed tool has an object input schema
      And the server answers with the same tool names as the legacy shape
