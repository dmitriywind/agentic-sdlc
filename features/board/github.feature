# Source: src/board/github.ts; references/architecture.md "Board port"
@board:github
Feature: The GitHub Projects board
  Tickets are issues in a GitHub Project, read and written through `gh`. The Project may be shared by several repos.

  Rule: The board reads only what is its own and refuses a Project it cannot read in full

    Scenario: Repos can share one GitHub Project
      Given the github board adapter
      And the GitHub Project holds issue 12 of "O/R" and issue 12 of "other/repo"
      When the factory lists the tickets
      Then the listed ticket titles are "of O/R"

  Rule: An assignee is replaced, never added

    Scenario: A new assignee replaces the old one
      Given the github board adapter
      And the ticket is assigned to "old"
      When the factory assigns the ticket "7" to "new"
      Then a call includes "--add-assignee new"
      And a call includes "--remove-assignee old"
