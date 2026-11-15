# Source: src/board/index.ts "createBoard" and "checked"; src/board/github.ts, jira.ts, linear.ts; references/architecture.md "Board port"
@board:shared
Feature: What every board adapter does the same way
  A skill calls `agentic-sdlc board <verb>` and never a vendor CLI. Whatever the tracker, a move can be guarded by the
  status the caller expects, an adapter fails clearly when its binding or its credential is missing, and the
  milestone verb sets and clears the milestone where `create --milestone` puts it.

  Rule: A move writes only when the ticket is still in the status the caller expects

    Scenario Outline: A move writes the id the status name resolves to
      Given the <adapter> board adapter
      And the ticket is at "Ready"
      When the factory moves the ticket "<id>" to "In progress" only from "Ready"
      Then a call includes '<resolved>'

      Examples:
        | adapter | id     | resolved                                                                                  |
        | github  | 7      | gh project item-edit --project-id P1 --id I7 --field-id F1 --single-select-option-id O2 |
        | jira    | PROJ-1 | {"transition":{"id":"31"}}                                                                |

  Rule: An adapter that lacks its binding or its credential fails before it reaches the board

    Scenario: A board verb with a missing required option names the binding key and validate
      Given the github board adapter
      And the board adapter has no option "project_number"
      When the factory gets the ticket "7"
      Then the verb fails matching "board\.options\.project_number.*agentic-sdlc validate"
      And no call reaches the board

  Rule: The GitHub boards take only issue numbers as ids

  Rule: The milestone verb sets and clears the milestone where create puts it

    Scenario Outline: A milestone is set
      Given the <adapter> board adapter
      When the factory sets the milestone of the ticket "<id>" to "<name>"
      Then a call includes '<call>'

      Examples:
        | adapter | id     | name | call                         |
        | github  | 7      | M1   | --milestone M1 |
        | jira    | PROJ-1 | v2   | "fixVersions":[{"name":"v2"}] |
        | linear  | LIN-9  | Q3   | "labelIds":["L1"]            |
