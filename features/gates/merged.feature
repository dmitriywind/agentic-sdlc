# Source: src/gates.ts "merged"; references/architecture.md "3.4 Gates"
@gate:merged
Feature: Gate merged
  One gate, on the trunk push, moves a merged ticket to Done, so that each Status transition has one writer and no CR
  pipeline writes the board. Done records a fact: a held ticket moves too and loses its human label.

  Rule: Whatever is not one merged CR into the trunk with one live ticket moves nothing

    Scenario: A push with no CR is a direct push
      When the merged gate runs for the sha "nope"
      Then the gate result "reason" mentions "no CR merged at this sha"
      And the gate result "moved" lists "nothing"

    Scenario Outline: A CR that closes <closes> into <target> moves nothing
      Given these tickets are on the board:
        | id | status    |
        | 12 | In review |
        | 13 | In review |
      And these CRs are on the forge:
        | cr | source | closes   | merge | target   |
        | 1  | 12/x   | <closes> | m1    | <target> |
      When the merged gate runs for the sha "m1"
      Then the gate result "reason" mentions "<reason>"
      And the gate result "moved" lists "nothing"
      And the ticket "12" is at "In review"

      Examples:
        | closes | target  | reason                |
        | 12     | develop | is not trunk          |
        | 12, 13 | main    | not exactly one       |
        |        | main    | not exactly one       |

    Scenario: A CR that is not merged moves nothing
      Given these tickets are on the board:
        | id | status    |
        | 12 | In review |
      And these CRs are on the forge:
        | cr | source | closes | merge | state |
        | 1  | 12/x   | 12     | m1    | open  |
      When the merged gate runs for the sha "m1"
      Then the gate result "reason" mentions "is not merged"
      And the ticket "12" is at "In review"

  Rule: A merged CR into the trunk moves its one ticket to Done

    Scenario: The ticket moves to Done and its Shipped is set
      Given these tickets are on the board:
        | id | status    |
        | 12 | In review |
      And these CRs are on the forge:
        | cr | source | closes | merge |
        | 1  | 12/x   | 12     | m1    |
      When the merged gate runs for the sha "m1"
      Then the gate result "moved" lists "12"
      And the ticket "12" is at "Done"
      And the ticket "12" has Shipped "Not shipped"

    Scenario: A held ticket moves too and loses its human label
      Given these tickets are on the board:
        | id | status    | labels      |
        | 12 | In review | needs-human |
      And these CRs are on the forge:
        | cr | source | closes | merge |
        | 1  | 12/x   | 12     | m1    |
      When the merged gate runs for the sha "m1"
      Then the ticket "12" is at "Done"
      And the ticket "12" has the labels ""
