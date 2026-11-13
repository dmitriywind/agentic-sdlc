# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:linkage
Feature: Gate ticket-linkage
  As the factory
  I want each product CR to close exactly one open ticket
  So that every change traces to one ticket

  # Source: src/gates.ts, "linkage"; skills/sdlc/references/gates.md, "Gates and checks"
  # Proof: test/gates.test.ts "linkage: product CR needs exactly one open ticket named by the source"
  Scenario: A product CR closes one open ticket that its change line names
    Given a product CR closes ticket "12"
    And ticket "12" is open
    And the change line of the CR names "12"
    When the linkage gate runs
    Then the check "ticket-linkage" passes

  # Source: src/gates.ts, "linkage"
  # Proof: test/gates.test.ts "linkage: product CR needs exactly one open ticket named by the source"
  Scenario Outline: A product CR that breaks the linkage rule fails
    Given a product CR <problem>
    When the linkage gate runs
    Then the gate fails with a message about <message>

    Examples:
      | problem                                   | message                     |
      | closes two tickets                        | exactly one ticket          |
      | closes a Done ticket                      | a ticket that is not open   |
      | has a change line that omits the ticket id | a change line that does not name the ticket |

  # Source: src/gates.ts, "linkage"
  # Proof: test/gates.test.ts "linkage: product CR needs exactly one open ticket named by the source"
  Scenario: A factory CR needs no ticket
    Given a CR changes only files under paths.factory
    When the linkage gate runs
    Then the gate passes without a ticket

  # Source: src/gates.ts, "linkage" (mixed CR)
  # Proof: test/gates.test.ts "linkage: product CR needs exactly one open ticket named by the source"
  Scenario: A CR that mixes product and factory paths still needs a ticket
    Given a CR changes files under paths.factory and other files
    And the CR closes no ticket
    When the linkage gate runs
    Then the gate fails
