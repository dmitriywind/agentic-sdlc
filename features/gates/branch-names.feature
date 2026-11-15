# Source: src/gates.ts "branchNames" and "cli" (branch-names); the pre-push form is in features/guard/push-guard.feature
@gate:branch-names
Feature: Gate branch-names
  A change line outside the binding patterns is refused, so that no stray branch reaches the trunk.

  Rule: A change line inside the binding patterns is allowed

    Scenario Outline: The trunk, a release line, a ticket line, a factory line or a dependency bot line is allowed
      When the branch-names gate checks "<name>"
      Then the change line is allowed

      Examples:
        | name              |
        | PROJ-45/add-login |
        | main              |
        | release/1.0       |
        | factory/tune      |
        | dependabot/npm/x  |
        | renovate/x        |

  Rule: A change line outside the patterns is refused

    Scenario: The gate fails with the name it refuses
      Given the binding sets "vcs.trunk" to "main"
      And the binding sets "vcs.change_pattern" to "<ticket>/<name>"
      And the binding sets "vcs.factory_change_pattern" to "factory/<name>"
      When I run "gate branch-names --ref wip"
      Then the exit code is 1
      And the output says "branch name not allowed: wip"

    Scenario: The gate passes a line that fits
      Given the binding sets "vcs.trunk" to "main"
      And the binding sets "vcs.change_pattern" to "<ticket>/<name>"
      And the binding sets "vcs.factory_change_pattern" to "factory/<name>"
      When I run "gate branch-names --ref 12/fix-it"
      Then the exit code is 0
