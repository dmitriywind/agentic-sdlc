# Source: src/gates.ts "merged"; references/architecture.md "3.4 Gates"
@gate:merged
Feature: Gate merged
  One gate, on the trunk push, moves a merged ticket to Done, so that each Status transition has one writer and no CR
  pipeline writes the board. Done records a fact: a held ticket moves too and keeps its label.

  Rule: A CR merged into the trunk moves its one ticket to Done

  Rule: Whatever is not one merged CR into the trunk with one live ticket moves nothing

    Scenario: A push with no CR is a direct push
      When the merged gate runs for the sha "nope"
      Then the gate result "reason" mentions "no CR merged at this sha"
      And the gate result "moved" lists "nothing"

  Rule: A forge error fails the gate
