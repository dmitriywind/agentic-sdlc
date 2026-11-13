# Owner: src/gates.ts, skills/sdlc/references/gates.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:merged
Feature: Gate merged
  As the factory
  I want one gate, on the trunk push, to move a merged ticket to Done
  So that each Status transition has one writer and no CR pipeline writes the board

  # Source: src/gates.ts, "merged"
  # Proof: test/gates.test.ts "merged: the CR at a trunk sha moves its one ticket to Done, Not shipped when empty"
  Scenario: A trunk push moves the merged ticket to Done
    Given a CR into the trunk closes one ticket at In review
    And the CR merged at sha S
    When "gate merged --sha S" runs on the trunk push
    Then the ticket moves to Done
    And Shipped is "Not shipped" when it was empty

  # Source: src/gates.ts, "merged"
  # Proof: test/gates.test.ts "merged: the CR at a trunk sha moves its one ticket to Done, Not shipped when empty"
  Scenario: A direct push with no CR changes nothing
    Given no CR merged at sha S
    When "gate merged --sha S" runs
    Then no ticket moves
    And the result names "no CR merged at this sha"

  # Source: src/gates.ts, "merged"
  # Proof: test/gates.test.ts "merged: trunk only, exactly one ticket, keeps Shipped, moves a held ticket, leaves Cancelled"
  Scenario: Only a CR into the trunk that closes exactly one ticket moves a ticket
    Given a CR into a release line, or a CR that closes two tickets
    When "gate merged" runs for its merge sha
    Then no ticket moves

  # Source: src/gates.ts, "merged"; references/architecture.md, "3.4 Gates"
  # Proof: test/gates.test.ts "merged: trunk only, exactly one ticket, keeps Shipped, moves a held ticket, leaves Cancelled"
  Scenario: Done records the merge, held or not
    Given a ticket with the label board.labels.human
    And its CR merged into the trunk
    When "gate merged" runs
    Then the ticket moves to Done
    And the ticket keeps the label board.labels.human

  # Source: src/gates.ts, "merged"
  # Proof: test/gates.test.ts "merged: trunk only, exactly one ticket, keeps Shipped, moves a held ticket, leaves Cancelled"
  Scenario: A Cancelled ticket stays Cancelled
    Given a Cancelled ticket whose CR merged into the trunk
    When "gate merged" runs
    Then the ticket stays Cancelled
    And the result names the Cancelled status

  # Source: src/gates.ts, "merged"
  # Proof: test/gates.test.ts "merged: trunk only, exactly one ticket, keeps Shipped, moves a held ticket, leaves Cancelled"
  Scenario: A Shipped value already set is kept
    Given a ticket at In review with Shipped "On staging"
    When "gate merged" runs for its CR
    Then the ticket moves to Done
    And Shipped stays "On staging"

  # Source: src/gates.ts, "merged"
  # Proof: test/gates.test.ts "merged: a forge error fails the gate; only \"no change request\" is a direct push"
  Scenario: A forge error fails the gate
    Given the forge answers the merge sha lookup with an error
    When "gate merged" runs
    Then the gate fails, so the run is red and can be re-run
