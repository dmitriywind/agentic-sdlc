# Source: src/mcp.ts "GUARDED", "allowList", "cli"
@cli:mcp
Feature: The review-identity tools are served only on request
  `forge_approve` and `forge_status` speak as the review identity, so `mcp --allow approve,status` must name them.
  Without it they are not listed and a call to them is refused, in both protocol shapes.

  Rule: --allow names the guarded tools to serve

    Scenario: The guarded tools are hidden by default
      When the client sends "tools/list"
      Then the listed tools do not include "forge_approve"
      And the listed tools do not include "forge_status"

    Scenario: --allow approve,status serves both
      Given the server is started with --allow "approve,status"
      When the client sends "tools/list"
      Then the listed tools include "forge_approve"
      And the listed tools include "forge_status"

    Scenario: --allow approve serves only forge_approve
      Given the server is started with --allow "approve"
      When the client sends "tools/list"
      Then the listed tools include "forge_approve"
      And the listed tools do not include "forge_status"

    Scenario: A guarded tool is refused when it was not allowed
      When the client calls the tool "forge_approve" with '{"n":"1"}'
      Then the reply "error.code" is "-32602"
      And the reply "error.message" mentions "unknown tool"

  Rule: The same holds for the 2026-07-28 shape, which needs no earlier initialize

    Scenario: A modern tools/list hides the guarded tools by default
      When the modern client sends "tools/list"
      Then the listed tools do not include "forge_approve"

    Scenario: A modern tools/list serves an allowed tool
      Given the server is started with --allow "approve"
      When the modern client sends "tools/list"
      Then the listed tools include "forge_approve"

    Scenario: A modern call to a guarded tool is refused when it was not allowed
      When the modern client calls the tool "forge_approve" with '{"n":"1"}'
      Then the reply "error.code" is "-32602"

  Rule: The command line checks its arguments

    Scenario: An unknown word after --allow is a usage error
      When the client runs "mcp --allow merge"
      Then the server exits with code 2
      And the server says "--allow takes approve,status"

    Scenario: --help prints the usage
      When the client runs "mcp --help"
      Then the server exits with code 0
      And the server says "--allow"
