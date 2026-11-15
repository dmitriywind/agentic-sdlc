# Owner: skills/implement-spec/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:implement-spec
Feature: Implement a spec
  As the factory
  I want to implement a ticket's spec test first on one change line and open a draft CR
  So that the Product owner gets a small, proven change that review-pr can grade

  # Source: skills/implement-spec/SKILL.md, "Claim" and "Draft CR"
  # Proof: skill text only
  Scenario: A Ready ticket becomes a draft CR
    Given a ticket at Status Ready with a trusted spec
    And the ticket has no needs-human label
    And no one but this run's executor is assigned to the ticket
    When the factory runs implement-spec
    Then the ticket moves to In progress
    And the factory opens one draft CR for one change line
    And the CR body has exactly one line "Closes <id>" for this ticket
    And the ticket shows In review

  # Source: skills/implement-spec/SKILL.md, intro paragraph
  # Proof: skill text only
  Scenario: A ticket with no trusted spec goes back to shape
    Given a ticket at Status Ready, in either lane
    And no trusted comment starts with the spec marker
    And the ticket body lists criteria
    When the factory runs implement-spec
    Then the ticket moves to Backlog with "--only-from Ready"
    And one comment names the missing spec
    And the factory writes no code

  # Source: skills/implement-spec/SKILL.md, "Test first"
  # Proof: skill text only
  Scenario: Each plan step starts with a failing proof
    Given a spec with a plan of several steps
    When the factory implements a step
    Then it writes one failing proof through the public interface
    And it sees the proof red
    And it keeps the red output for the CR body
    And it makes the proof green
    And it refactors

  # Source: skills/implement-spec/SKILL.md, "Draft CR"
  # Proof: skill text only
  Scenario: A CR that is already open moves the ticket to In review
    Given a ticket at In progress
    And a CR opened by the factory for the change line is already open
    When the fast check passes and the change line is pushed
    Then the ticket moves to In review
    And the factory opens no second CR

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: skill text only
  Scenario: A CR a person opened is handed to review, not taken over
    Given a ticket at Ready or In progress
    And an open CR closes the ticket
    And an author outside owners.bots opened the CR
    When implement-spec claims the ticket
    Then the ticket moves to In review with --only-from its status
    And implement-spec posts one comment that review-pr reviews the CR
    And implement-spec pushes nothing to that change line

  # Source: skills/implement-spec/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: A diff over the size limit goes back to Backlog
    Given the diff outgrows the size limit
    When the factory finds the size problem
    Then the ticket goes back to Backlog with the reason
    And shape splits the ticket

  # Source: skills/implement-spec/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: A cause that is not known goes to shape
    Given a fix fails and its cause is not known
    When the factory meets the failure
    Then the diagnosis belongs to shape, not to implement-spec

  # Source: src/board/index.ts, "comments"
  # Proof: test/board-local.test.ts "comments come newest first and narrow by marker, last and author, with --last counted after the filter"
  Scenario: Board comments come newest first and narrow by marker, author and count
    Given a ticket with comments from several authors
    When the factory runs "board comments <id>" with --marker, --author or --last
    Then the newest comment comes first
    And --author keeps only the named authors
    And --last counts after the filter

