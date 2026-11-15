# Owner: src/vcs/git.ts. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@cli:vcs
Feature: Vcs push
  As the factory
  I want the vcs port to refuse a push of the trunk
  So that a change reaches the trunk only through a CR

  # Source: src/vcs/git.ts, "push"
  # Proof: test/install.test.ts "vcs push refuses the trunk and a detached HEAD"
  Scenario: The vcs push command refuses the trunk and a detached HEAD
    Given the checkout is on the trunk, or on a detached HEAD
    When a skill runs "agentic-sdlc vcs push"
    Then the command fails and names the trunk or the detached HEAD
    And a push from a change line succeeds
