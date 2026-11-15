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
        | ready  | ci=success, human-approval=success    | armed   | none                                    |
        | merged | ci=success, human-approval=success    | merged  | none                                    |
        | draft  | ci=success, human-approval=success    | blocked | draft=draft                             |
        | closed | ci=success, human-approval=success    | blocked | change request=closed                   |
        | ready  | ci=failure, human-approval=pending    | blocked | ci=failure                              |
        | ready  | ci=pending, human-approval=pending    | waiting | ci=pending, human-approval=pending      |

    Scenario: A green CR is armed for auto-merge
      Given the CR "5" is "ready" with the checks "ci=success, human-approval=success"
      When the CR "5" is landed
      Then the forge was asked to automerge the CR "5"

    Scenario: A CR the forge merges at once is merged
      Given the CR "5" is "ready" with the checks "ci=success, human-approval=success"
      And the forge merges a CR at once when asked
      When the CR "5" is landed
      Then the land state is "merged"

    Scenario Outline: A CR that cannot merge is never asked to
      Given the CR "5" is "<cr>" with the checks "<checks>"
      When the CR "5" is landed
      Then the forge was asked to merge nothing

      Examples:
        | cr     | checks                              |
        | draft  | ci=success, human-approval=success  |
        | closed | ci=success, human-approval=success  |
        | ready  | ci=failure, human-approval=pending  |
        | ready  | ci=pending, human-approval=pending  |

  Rule: Only a human approval left means a human is asked

    Scenario: The class and the owners who must approve are named
      Given the CR "5" is "ready" with the checks "ci=success, human-approval=pending"
      When the CR "5" is landed
      Then the land state is "blocked"
      And the checks blocking the land are "human-approval=pending"
      And a human of the class "guardrail" must approve: "fo"

    Scenario: A red check is not a wait on a human
      Given the CR "5" is "ready" with the checks "ci=failure, human-approval=pending"
      When the CR "5" is landed
      Then no human is asked to approve

  Rule: The wait is bounded, and polls until the checks turn green

    Scenario: The checks turn green on a later look
      Given the CR "5" is "ready" with the checks "ci=pending, human-approval=success"
      And the checks of the CR "5" turn green at look 3
      When the CR "5" is landed
      Then the land state is "armed"
      And the land waited 60 seconds in all
      And the forge was asked to automerge the CR "5"

    Scenario: The default wait is 5 minutes
      Given the CR "5" is "ready" with the checks "ci=pending, human-approval=success"
      When the CR "5" is landed
      Then the land state is "waiting"
      And the land waited 300 seconds in all

    Scenario: cycle.land_wait_minutes sets the wait
      Given the CR "5" is "ready" with the checks "ci=pending, human-approval=success"
      And the cycle sets "land_wait_minutes" to 2
      When the CR "5" is landed
      Then the land waited 120 seconds in all

    Scenario: --wait overrides the wait
      Given the CR "5" is "ready" with the checks "ci=pending, human-approval=success"
      When the CR "5" is landed waiting at most 1 minutes
      Then the land waited 60 seconds in all
