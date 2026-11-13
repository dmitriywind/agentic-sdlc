# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:board-sync
Feature: Gate board-sync
  As the factory
  I want CR events to move the one ticket on the board
  So that the board always shows the true status

  # Source: src/gates.ts, "boardSync"; skills/sdlc/references/gates.md, "Gates and checks"
  # Proof: test/gates.test.ts "board-sync: opened -> In review; merged (by cr or sha) -> Done + Not shipped"
  Scenario: An opened CR moves its ticket to In review
    Given a CR closes one ticket at Backlog
    When board-sync runs with the event "opened"
    Then the ticket is at In review

  # Source: src/gates.ts, "boardSync"
  # Proof: test/gates.test.ts "board-sync: opened -> In review; merged (by cr or sha) -> Done + Not shipped"
  Scenario: A merge moves the ticket to Done and sets Shipped
    Given a CR closes one ticket
    When board-sync runs with the event "merged"
    Then the ticket is at Done
    And Shipped is "Not shipped" when it was empty

  # Source: src/gates.ts, "boardSync"
  # Proof: test/gates.test.ts "board-sync: sha must resolve, trunk-only merged, keeps shipped, one closes, skips done/held, in-release"
  Scenario Outline: board-sync moves nothing when the rule does not hold
    Given <case>
    When board-sync runs
    Then no ticket moves
    And the output gives a reason

    Examples:
      | case                                            |
      | a merged CR targets a release line, not the trunk |
      | a CR closes two tickets                         |
      | the ticket is Done                              |
      | the ticket has the label board.labels.human     |

  # Source: src/gates.ts, "boardSync" (unknown sha)
  # Proof: test/gates.test.ts "board-sync: sha must resolve, trunk-only merged, keeps shipped, one closes, skips done/held, in-release"
  Scenario: A revision that matches no CR is an error
    Given no CR merged at the revision
    When board-sync runs with --sha
    Then the gate fails with "no CR merged"

  # Source: src/gates.ts, "boardSync" (in-release); skills/sdlc/references/gates.md
  # Proof: test/gates.test.ts "board-sync: sha must resolve, trunk-only merged, keeps shipped, one closes, skips done/held, in-release"
  Scenario: A release-line push sets In release
    Given tickets carry release_version "<v>"
    When board-sync runs with the event "in-release" and --release "<v>"
    Then Shipped is "In release" on those tickets
    And tickets of other versions do not change
