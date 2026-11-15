# Source: src/board/index.ts "hold", "holds", "release"
@board:local
Feature: A hold asks a human and waits for the owner's reply
  `board hold <id> --kind <trigger> --body-file <f>` puts the human label on the ticket and posts the ask, with the
  trigger as the marker's ref. `board holds` lists every held ticket with its last ask and whether an owner replied
  after it. `board release <id>` takes the label off. A bot-only account's comment is never a reply; an owner that is also a bot counts when the comment has no factory marker.

  Background:
    Given the binding sets "board.labels.human" to "needs-human"
    And the binding sets "owners.product" to the list "po, both"
    And the binding sets "owners.factory" to the list "fo, fo2"
    And the binding sets "owners.bots" to the list "bot, both"
    And the board has these tickets:
      | title | status  |
      | t     | Backlog |
      | u     | Backlog |
    And a file "ask.md" containing:
      """
      ### Needs human: old
      The question.
      """

  Rule: A hold labels the ticket and asks

    Scenario: The ticket gets the human label and the ask carries the trigger in its marker, without its own heading
      When I run "board hold 1 --kind scope --body-file ask.md"
      Then the exit code is 0
      And the ticket "1" carries the labels "needs-human"
      And the comment 0 of the ticket "1" reads:
        """
        ### Needs human: scope

        The question.
        """

    Scenario: A trigger that spans lines is refused and the ticket is not held
      When the factory holds the ticket "2" with the kind "two\nlines" and the body file "ask.md"
      Then the exit code is 2
      And the ticket "2" carries the labels ""

  Rule: Only a reply by an owner role after the last ask is a reply

    Background:
      Given I run "board hold 1 --kind scope --body-file ask.md"
      And the comment 0 of the ticket "1" was written by "bot" at "2026-01-01T10:00:00Z"

    Scenario Outline: Who replied, and when
      Given the ticket "1" gets the comment "<text>" written by "<author>" at "<at>"
      When I run "board holds"
      Then the result "0.replied" is "<replied>"

      Examples:
        | author | text                  | at                   | replied | why                      |
        | bot    | x                     | 2026-01-01T11:00:00Z | false   | a bot is never a reply   |
        | fo     | x                     | 2026-01-01T09:00:00Z | false   | older than the ask       |
        | FO2    | x                     | 2026-01-01T12:00:00Z | true    | an owner, any letter case |
        | both   | x                     | 2026-01-01T12:00:00Z | true    | owner and bot, no marker  |
        | both   | <!-- note -->         | 2026-01-01T12:00:00Z | false   | owner and bot, a factory marker |

    Scenario: The reply names its author, and does not release the ticket
      Given the ticket "1" gets the comment "go ahead" written by "FO2" at "2026-01-01T12:00:00Z"
      When I run "board holds"
      Then the result "0.kind" is "scope"
      And the result "0.reply.author" is "FO2"
      And the ticket "1" carries the labels "needs-human"

  Rule: release takes the label off

    Scenario: A released ticket has no label and is no longer listed
      Given I run "board hold 1 --kind scope --body-file ask.md"
      When I run "board release 1"
      Then the result "labels" is ""
      When I run "board holds"
      Then the output says "[]"
