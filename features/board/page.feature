# Source: src/board/page.ts "boardPage"; templates/board/index.html
@board:page
Feature: The board page shows the owner the whole board
  `agentic-sdlc board page --out <dir>` writes one web page and its data file. The page takes every project value
  from the binding. The data file holds the open tickets, the tickets done in the last 14 days, the milestone
  totals and the last deploy of the first and the last environment.

  Background:
    Given the github-issues board adapter
    And the binding sets "board.statuses" to the list "Ideas, Signals, Backlog, Ready, In progress, In review, Done, Cancelled"
    And the binding sets "board.done_statuses" to the list "Done, Cancelled"
    And the binding sets "product.environments" to the list "staging, production"
    And the binding sets "forge.deploy_workflows" to the list "Deploy staging, Deploy production"

  Scenario: The data file holds the open tickets, the tickets done lately and the milestone totals
    Given the repo has these issues:
      | number | labels                      | state  | closed at            | milestone |
      | 1      | status:Ready, priority:High |        |                      | M0        |
      | 2      | status:Done                 | closed | 2026-11-27T10:00:00Z | M0        |
      | 3      | status:Done                 | closed | 2026-10-01T10:00:00Z | M0        |
      | 4      | status:Cancelled            | closed | 2026-11-27T10:00:00Z | M0        |
    When the factory builds the board page on "2026-11-28T12:00:00Z"
    Then the board data lists the open tickets "1"
    And the board data lists the done tickets "2"
    And the board data has the milestone "M0" with 1 open and 2 closed

  Scenario: Each environment shows its last deploy and the build it runs
    Given the workflow "Deploy staging" ran "success" at "2026-11-21T11:00:00Z" on "aaaaaaa1"
    And the workflow "Deploy staging" ran "failure" at "2026-11-28T11:00:00Z" on "bbbbbbb2"
    When the factory builds the board page on "2026-11-28T12:00:00Z"
    Then the board data says the last deploy of "staging" failed and it runs "aaaaaaa"
    And the board data says "production" has no deploy

  Scenario: The page takes its values from the binding, and ticket text cannot open a script
    Given the binding sets "priorities" to the list "P0, </script><b>"
    When the factory builds the board page on "2026-11-28T12:00:00Z"
    Then the page names the repo "o/r" and the environments "staging, production"
    And the page maps the shipped value "In release" to the environment "staging"
    And the page holds no "</script><b>"

  Scenario: A board that is not GitHub Issues has no page
    Given the binding sets "board.adapter" to "local"
    When the factory builds the board page on "2026-11-28T12:00:00Z"
    Then the verb fails matching "needs the github-issues board"
