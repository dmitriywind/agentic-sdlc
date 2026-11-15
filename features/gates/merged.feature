# Source: src/gates.ts "merged"; references/architecture.md "3.4 Gates"
@gate:merged
Feature: Gate merged
  One gate, on the trunk push, moves a merged ticket to Done, so that each Status transition has one writer and no CR
  pipeline writes the board. Done records a fact: a held ticket moves too and keeps its label.

  Rule: A CR merged into the trunk moves its one ticket to Done

    Scenario: A trunk push moves the merged ticket to Done, with Shipped Not shipped when it was empty
      Given these tickets are on the board:
        | id | status    |
        | 12 | In review |
      And these CRs are on the forge:
        | cr | closes | merge |
        | 1  | 12     | abc   |
      When the merged gate runs for the sha "abc"
      Then the gate result "moved" lists "12"
      And the ticket "12" is at "Done"
      And the ticket "12" has Shipped "Not shipped"

    Scenario: A ticket that is Done already is not moved again
      Given these tickets are on the board:
        | id | status | shipped    |
        | 12 | Done   | On staging |
      And these CRs are on the forge:
        | cr | closes | merge |
        | 1  | 12     | abc   |
      When the merged gate runs for the sha "abc"
      Then the ticket "12" is at "Done"
      And the ticket "12" has Shipped "On staging"

    Scenario: A Shipped value that is already set is kept
      Given these tickets are on the board:
        | id | status    | shipped    |
        | 15 | In review | On staging |
      And these CRs are on the forge:
        | cr | closes | merge |
        | 1  | 15     | abc   |
      When the merged gate runs for the sha "abc"
      Then the ticket "15" is at "Done"
      And the ticket "15" has Shipped "On staging"

    Scenario: A held ticket moves too and keeps its label
      Given these tickets are on the board:
        | id | status    | labels      |
        | 14 | In review | needs-human |
      And these CRs are on the forge:
        | cr | closes | merge |
        | 1  | 14     | abc   |
      When the merged gate runs for the sha "abc"
      Then the ticket "14" is at "Done"
      And the ticket "14" keeps the label "needs-human"

  Rule: Whatever is not one merged CR into the trunk with one live ticket moves nothing

    Scenario: A push with no CR is a direct push
      When the merged gate runs for the sha "nope"
      Then the gate result "reason" mentions "no CR merged at this sha"
      And the gate result "moved" lists "nothing"

    Scenario Outline: A CR that is <case> moves no ticket
      Given these tickets are on the board:
        | id | status      |
        | 12 | In progress |
        | 13 | Done        |
        | 16 | Cancelled   |
      And these CRs are on the forge:
        | cr | closes   | merge | target   | state   |
        | 1  | <closes> | abc   | <target> | <state> |
      When the merged gate runs for the sha "abc"
      Then the gate result "reason" mentions "<reason>"
      And the ticket "<ticket>" is at "<status>"

      Examples:
        | case                        | closes | target    | state  | reason                | ticket | status      |
        | into a release line         | 12     | release/1 | merged | not trunk             | 12     | In progress |
        | closing two tickets         | 12, 13 | main      | merged | exactly one           | 12     | In progress |
        | closing a Cancelled ticket  | 16     | main      | merged | Cancelled             | 16     | Cancelled   |
        | not merged                  | 12     | main      | open   | not merged            | 12     | In progress |

  Rule: A forge error fails the gate

    Scenario: Only "no change request" is a direct push
      Given the forge answers the lookup of a CR by its merge sha with the error "HTTP 502"
      When the merged gate runs for the sha "abc"
      Then the gate fails with "502"
