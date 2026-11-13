# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:branch-names
Feature: Gate branch-names
  As the factory
  I want a change line outside the binding patterns refused
  So that no stray branch reaches the trunk

  # Source: src/gates.ts, "branchNames"
  # Proof: test/gates.test.ts "branch-names"
  Scenario: A change line inside the binding patterns is allowed
    Given the binding sets vcs.trunk, vcs.change_pattern, vcs.factory_change_pattern and vcs.release_prefix
    When the gate checks a change line that matches one of them
    Then the gate passes

  # Source: src/gates.ts, "branchNames"
  # Proof: test/gates.test.ts "branch-names"
  Scenario: A change line outside the patterns is refused
    Given a change line named "wip"
    When the gate checks the change line
    Then the gate fails with "branch name not allowed: wip"

  # Source: src/gates.ts, "branch-names case of cli" (--stdin-prepush)
  Scenario: A push that deletes a branch is not checked
    Given the pre-push hook sends a line with an all-zero local object name
    When the gate reads the lines with --stdin-prepush
    Then the gate ignores that line
