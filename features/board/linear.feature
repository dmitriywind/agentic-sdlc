# Source: src/board/linear.ts; references/architecture.md "Board port"
@board:linear
Feature: The Linear board
  Tickets are Linear issues, read and written over GraphQL with the token the binding names.

  Rule: A read follows every page or fails

    Scenario: A list follows the end cursor to the last page
      Given the linear board adapter
      And Linear holds the issues L1 and L2 and the comments k1 and k2 on two pages each
      When the factory lists the tickets
      Then the listed ticket ids are "L1, L2"

    Scenario: The comments follow the end cursor to the last page
      Given the linear board adapter
      And Linear holds the issues L1 and L2 and the comments k1 and k2 on two pages each
      When the factory reads the comments of the ticket "LIN-1"
      Then the comment ids are "k1, k2"

    Scenario: A list whose page does not advance is an error, not a partial list
      Given the linear board adapter
      And Linear answers every page with a next page and the same cursor
      When the factory lists the tickets
      Then the verb fails matching "linear: list does not advance"

  Rule: Labels, states and children are read up to 250, and an issue keeps its own label ids

    Scenario: Adding a label the issue already carries creates no label and keeps its id
      Given the linear board adapter
      And the Linear issue carries the workspace label "bug" with the id "WS1"
      When the factory adds the label "bug" to the ticket "LIN-9"
      Then no call includes "issueLabelCreate"
      And the Linear update keeps the label ids "WS1"

    Scenario: The queries read up to 250 labels, states and children
      Given the linear board adapter
      When the factory moves the ticket "LIN-9" to "Ready"
      Then the Linear queries read up to 250 labels, states and children
