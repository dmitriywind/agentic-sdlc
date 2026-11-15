# Source: src/mcp.ts "GUARDED", "allowList", "cli"
@cli:mcp
Feature: The review-identity tools are served only on request
  `forge_approve` and `forge_status` speak as the review identity, so `mcp --allow approve,status` must name them.
  Without it they are not listed and a call to them is refused, in both protocol shapes.

  Rule: --allow names the guarded tools to serve

    Scenario: --allow approve,status serves both
      Given the server is started with --allow "approve,status"
      When the client sends "tools/list"
      Then the listed tools include "forge_approve"
      And the listed tools include "forge_status"

  Rule: The same holds for the 2026-07-28 shape, which needs no earlier initialize

  Rule: The command line checks its arguments

    Scenario: An unknown word after --allow is a usage error
      When the client runs "mcp --allow merge"
      Then the server exits with code 2
      And the server says "--allow takes approve,status"
