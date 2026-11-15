# Source: src/gates.ts "approvalWho"; shared with `forge land` and `forge queue`
@gate:approval
Feature: Who may approve a CR
  The class of a CR and the forge accounts whose approval it needs, so that `forge land` and `forge queue` ask the same
  people the approval gate waits for.

  Background:
    Given the binding sets "owners.product" to "po"
    And the binding sets "owners.factory" to the list "fo, fo2"
    And the binding sets "forge.review_identity" to "reviewer"
    And these tickets are on the board:
      | id | status    |
      | 1  | In review |

  Scenario: A guardrail CR waits for the factory owners
    Given these CRs are on the forge:
      | cr | closes | changes             |
      | g  | 1      | .agents/binding.yml |
    When the approval gate asks who may approve the CR "g"
    Then the gate result "class" is "guardrail"
    And the gate result "who" lists "fo, fo2"
