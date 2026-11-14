# Owner: skills/implement-spec/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:implement-spec
Feature: Implement a spec
  As the factory
  I want to implement a ticket's spec test first on one change line and open a draft CR
  So that the Product owner gets a small, proven change that review-pr can grade

  # Source: skills/implement-spec/SKILL.md, "Claim" and "Draft CR"
  Scenario: A Ready ticket becomes a draft CR
    Given a ticket at Status Ready with a trusted spec
    And the ticket has no needs-human label
    And no one but this run's executor is assigned to the ticket
    When the factory runs implement-spec
    Then the ticket moves to In progress
    And the factory opens one draft CR for one change line
    And the CR body has exactly one line "Closes <id>" for this ticket
    And the ticket shows In review

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: test/board-adapters.test.ts "github move refuses when status differs, and writes nothing"
  Scenario: A second run cannot claim the same ticket
    Given a ticket at Status Ready
    And another run has already moved it to In progress
    When the factory runs "board move <id> "In progress" --only-from Ready"
    Then the move is refused
    And the board does not change

  # Source: skills/implement-spec/SKILL.md, intro paragraph
  Scenario: A Full-lane ticket with no trusted spec goes back to shape
    Given a Full-lane ticket at Status Ready
    And no trusted comment starts with the spec marker
    When the factory runs implement-spec
    Then the ticket moves to Backlog with "--only-from Ready"
    And one comment names the missing spec
    And the factory writes no code

  # Source: skills/implement-spec/SKILL.md, "Test first"
  Scenario: Each plan step starts with a failing proof
    Given a spec with a plan of several steps
    When the factory implements a step
    Then it writes one failing proof through the public interface
    And it sees the proof red
    And it keeps the red output for the CR body
    And it makes the proof green
    And it refactors

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: test/forge.test.ts "cli: comments --trusted --last 1 returns the newest trusted comment past a newer untrusted one"
  Scenario: Rework from CR comments
    Given a ticket at In progress
    And an open CR closes the ticket
    And the CR has a trusted review-pr report with Important findings
    When the factory runs implement-spec
    Then it reads the newest report with "forge comments <n> --last 1 --marker "<!-- review-pr" --trusted"
    And it fixes each Important finding first
    And it opens no second CR

  # Source: skills/implement-spec/SKILL.md, "Branch"
  # Proof: test/vcs.test.ts "git: start resumes an existing change line"
  Scenario: Rework resumes the existing change line
    Given a change line already exists for the ticket
    When the factory runs "vcs start" with the name of the CR's source branch
    Then the existing change line reopens
    And the factory does not start a new line from the trunk tip

  # Source: skills/implement-spec/SKILL.md, "Branch"
  # Proof: test/vcs.test.ts "git start: no remote branch starts from trunk; a reused branch or workdir fast-forwards to the remote"
  Scenario: A new ticket starts from the trunk tip
    Given no change line exists for the ticket
    When the factory runs "vcs start" with a name that matches vcs.change_pattern
    Then the change line starts from the trunk tip
    And the factory works in the workdir that the command returns

  # Source: skills/implement-spec/SKILL.md, "Draft CR"
  Scenario: A CR that is already open moves the ticket to In review
    Given a ticket at In progress
    And a CR opened by the factory for the change line is already open
    When the fast check passes and the change line is pushed
    Then the ticket moves to In review
    And the factory opens no second CR

  # Source: skills/implement-spec/SKILL.md, "Claim"
  Scenario: A CR a person opened is handed to review, not taken over
    Given a ticket at Ready or In progress
    And an open CR closes the ticket
    And an author outside owners.bots opened the CR
    When implement-spec claims the ticket
    Then the ticket moves to In review with --only-from its status
    And implement-spec posts one comment that review-pr reviews the CR
    And implement-spec pushes nothing to that change line

  # Source: skills/implement-spec/SKILL.md, "Rules"
  Scenario: A diff over the size limit goes back to Backlog
    Given the diff outgrows the size limit
    When the factory finds the size problem
    Then the ticket goes back to Backlog with the reason
    And shape splits the ticket

  # Source: skills/implement-spec/SKILL.md, "Rules"
  Scenario: A fix fails twice for the same reason
    Given a fix has failed twice for the same reason
    When the factory meets the second failure
    Then it stops
    And it calls escalate-to-human
