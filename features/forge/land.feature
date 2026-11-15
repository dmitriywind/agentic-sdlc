# Source: src/forge/flow.ts "land"; references/architecture.md section 3.2 "land"
@cli:forge
Feature: forge land waits for the required checks, then arms or performs the merge
  `forge land <n> [--wait <minutes>]` waits, bounded, until every forge.required_checks entry is green on the head,
  then arms auto-merge, or merges where the forge cannot arm it. A wait on a human approval alone is blocked with the
  approval class and the owners who must approve. It never merges a draft.

  Background:
    Given the forge requires the checks "ci, human-approval"
    And the approval class of every CR is "guardrail", owned by "fo"

  Rule: The state of a CR decides whether it lands

    Scenario Outline: A CR lands, waits or is blocked
      Given the CR "5" is "<cr>" with the checks "<checks>"
      When the CR "5" is landed
      Then the land state is "<state>"
      And the checks blocking the land are "<blocking>"

      Examples:
        | cr     | checks                                | state   | blocking                                |
        | ready  | ci=pending, human-approval=pending    | waiting | ci=pending, human-approval=pending      |

  Rule: Only a human approval left means a human is asked

  Rule: The wait is bounded, and polls until the checks turn green

    Scenario: The checks turn green on a later look
      Given the CR "5" is "ready" with the checks "ci=pending, human-approval=success"
      And the checks of the CR "5" turn green at look 3
      When the CR "5" is landed
      Then the land state is "armed"
      And the land waited 60 seconds in all
      And the forge was asked to automerge the CR "5"
