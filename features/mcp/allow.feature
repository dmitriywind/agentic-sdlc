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
