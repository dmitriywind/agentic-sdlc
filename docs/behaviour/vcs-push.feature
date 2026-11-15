# Owner: src/vcs/git.ts. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@cli:vcs
Feature: Vcs push and change line names
  As the factory
  I want the vcs port to refuse a push of the trunk and a change line name that is an option
  So that a change reaches the trunk only through a CR

  # Source: src/vcs/git.ts, "push"
  # Proof: test/install.test.ts "vcs push refuses the trunk and a detached HEAD"
  Scenario: The vcs push command refuses the trunk and a detached HEAD
    Given the checkout is on the trunk, or on a detached HEAD
    When a skill runs "agentic-sdlc vcs push"
    Then the command fails and names the trunk or the detached HEAD
    And a push from a change line succeeds

  # Source: src/vcs/git.ts, "start" and "drop"
  # Proof: test/vcs.test.ts "git start and drop refuse a change line name that is an option or leaves .agents/work"
  Scenario: A change line name cannot be an option or a path out of the work folder
    When an agent starts or drops a change line named "--upload-pack=x", "../../x" or "a b"
    Then the vcs port refuses it before it runs git

  # Source: src/vcs/git.ts, "changed", "tag", "cut", "snapshot" and "checkoutTests"
  # Proof: test/vcs.test.ts "git refuses a revision, tag name or path that is an option, and lists non-ASCII paths unquoted"
  Scenario: A revision, tag name or path cannot be a git option, and file names stay unquoted
    When an agent passes "--output=/x" as a revision, tag name or path to a vcs command
    Then the vcs port refuses it before it runs git
    And a changed file named with non-ASCII characters is listed by its real name
