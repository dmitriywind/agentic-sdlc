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

    Scenario Outline: A Project at the 5000 item cap is refused, one below it is read
      Given the github board adapter
      And the GitHub Project holds <items> items
      When the factory lists the tickets
      Then <outcome>

      Examples:
        | items | outcome                            |
        | 5000  | the verb fails matching "archive"  |
        | 4999  | the board lists 4999 tickets       |

    Scenario: A get on a Project at the 5000 item cap is refused too
      Given the github board adapter
      And the GitHub Project holds 5000 items
      When the factory gets the ticket "1"
      Then the verb fails matching "archive"

  Rule: Every gh call carries the credential the binding names

    Scenario: token_env is passed as GH_TOKEN on every call
      Given the github board adapter
      When the factory moves the ticket "7" to "In progress"
      Then every call passes the credential "pat" as GH_TOKEN

  Rule: An assignee is replaced, never added

    Scenario: A new assignee replaces the old one
      Given the github board adapter
      And the ticket is assigned to "old"
      When the factory assigns the ticket "7" to "new"
      Then a call includes "--add-assignee new"
      And a call includes "--remove-assignee old"

    Scenario: Clearing the assignee removes the old one and adds none
      Given the github board adapter
      And the ticket is assigned to "old"
      When the factory clears the assignee of the ticket "7"
      Then a call includes "--remove-assignee old"
      And no call includes "--add-assignee"
