# Source: src/gates.ts "cli" (evidence); skills/ship/SKILL.md "Ready check"
@gate:evidence
Feature: Gate evidence
  A release with required evidence is ready only when commands.evidence_check passes for the revision. The command gets
  the revision as {sha}; the gate passes when it exits 0.

  Scenario: Without product.evidence the gate passes and runs nothing
    Given the binding sets "product.evidence" to the list ""
    And the binding sets "commands.evidence_check" to "false"
    When I run "gate evidence --sha abc123"
    Then the exit code is 0
    And the output says "product.evidence is empty"

  Scenario: The command receives the revision and the gate passes when it exits 0
    Given the binding sets "product.evidence" to the list "report"
    And the binding sets "commands.evidence_check" to "test {sha} = abc123"
    When I run "gate evidence --sha abc123"
    Then the exit code is 0
