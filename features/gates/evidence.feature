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

  Scenario Outline: The command receives the revision, and its exit code is the gate's
    Given the binding sets "product.evidence" to the list "report"
    And the binding sets "commands.evidence_check" to 'node -e "process.exit(process.argv[1]===process.argv[2]?0:1)" {sha} <expected>'
    When I run "gate evidence --sha abc123"
    Then the exit code is <code>

    Examples:
      | expected | code |
      | abc123   | 0    |
      | other    | 1    |

  Scenario: Evidence with no command to check it is a failure, not a pass
    Given the binding sets "product.evidence" to the list "report"
    When I run "gate evidence --sha abc123"
    Then the exit code is 1
    And the output says "commands.evidence_check is unset"

