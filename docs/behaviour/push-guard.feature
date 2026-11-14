# Owner: hooks/guard.mjs, templates/gates/hooks/pre-push. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@cli:guard
Feature: Push guard
  As the factory
  I want a hook to block pushes to the trunk and approvals by agents
  So that every change reaches the trunk through a CR and a review

  # Source: hooks/guard.mjs, header comment and trunk check
  # Proof: test/guard.test.ts "blocks pushes that reach the trunk"
  Scenario: A push to the trunk is blocked
    Given the agent runs "git push origin main" and main is the trunk
    When the guard hook reads the command
    Then the hook exits with code 2
    And the agent sees "push to the trunk 'main' is not allowed: open a CR."

  # Source: hooks/guard.mjs, "--all, --mirror, --branches" and glob refspec checks
  # Proof: test/guard.test.ts "blocks pushes that reach the trunk"
  Scenario Outline: A push that can reach many branches is blocked
    Given the agent runs "<command>"
    When the guard hook reads the command
    Then the hook exits with code 2
    And the agent sees a message to push the change line by name

    Examples:
      | command                                   |
      | git push --all origin                     |
      | git push --mirror origin                  |
      | git push origin 'refs/heads/*:refs/heads/*' |

  # Source: hooks/guard.mjs, trunk check
  # Proof: test/guard.test.ts "allows pushing a named change line"
  Scenario: A push of a named change line is allowed
    Given the agent runs "git push -u origin feat"
    When the guard hook reads the command
    Then the hook exits with code 0

  # Source: hooks/guard.mjs, "the binding lives at the project root"
  # Proof: test/guard.test.ts "finds the binding from a subdirectory"
  Scenario: The trunk name comes from the binding
    Given .agents/binding.yml sets vcs.trunk to "master"
    And the agent works in a subdirectory of the project
    When the agent runs "git push origin master"
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, "trunks = main, master"
  # Proof: test/guard.test.ts "without a binding, main and master are both trunks"
  Scenario: Without a binding, main and master are both trunks
    Given the project has no .agents/binding.yml
    When the agent runs "git push origin main" or "git push origin master"
    Then the hook exits with code 2
    And "git push origin feature-x" exits with code 0

  # Source: hooks/guard.mjs, "forge approve" checks
  # Proof: test/guard.test.ts "forge approve is for the review role only"
  Scenario: Only the review runtime approves
    Given AGENTIC_SDLC_ROLE is not "review"
    When the agent runs "agentic-sdlc forge approve 3"
    Then the hook exits with code 2
    And the agent sees that forge approve is for the review runtime only
    And the same command exits with code 0 when AGENTIC_SDLC_ROLE is "review"

  # Source: hooks/guard.mjs, "forge_approve" tool check
  # Proof: test/install.test.ts "plugin guard hook blocks trunk pushes and forge approve outside the review role"
  Scenario: The MCP approve tool is blocked outside the review role
    Given AGENTIC_SDLC_ROLE is not "review"
    When the agent calls the MCP tool "forge_approve"
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, command split and token clean-up
  # Proof: test/guard.test.ts "sees through command substitution"
  Scenario: A wrapped command is scanned too
    Given the agent runs "echo $(git push origin main)"
    When the guard hook reads the command
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, "git global options"
  # Proof: test/install.test.ts "plugin guard hook blocks trunk pushes and forge approve outside the review role"
  Scenario: Git global options do not hide a push
    Given the agent runs "git -C . push origin trunk" and trunk is the trunk
    When the guard hook reads the command
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, trunk check (no refspec)
  # Proof: test/guard.test.ts "a push from a checkout of the trunk with at most one argument is blocked"
  Scenario: A push from a checkout of the trunk is blocked
    Given the current branch is the trunk
    When the agent runs "git push" with at most one argument
    Then the hook exits with code 2
    And the agent sees a message to start a change line and open a CR

  # Source: hooks/guard.mjs, input parse
  # Proof: test/guard.test.ts "input that is not JSON is let through"
  Scenario: Input that is not JSON is let through
    Given the hook receives input that is not valid JSON
    When the hook starts
    Then the hook exits with code 0

  # Source: templates/gates/hooks/pre-push
  # Proof: test/guard.test.ts "pre-push: branch-names --stdin-prepush checks pushed branches and skips deletes"
  Scenario: The pre-push hook runs the branch-names gate
    Given the project enabled the hook with "git config core.hooksPath .agents/hooks"
    When a developer pushes a branch
    Then git runs "agentic-sdlc gate branch-names --stdin-prepush"
    And a branch outside the binding patterns is refused
