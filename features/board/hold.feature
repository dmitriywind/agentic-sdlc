# Source: src/board/index.ts "hold", "holds", "release"
@board:local
Feature: A hold asks a human and waits for the owner's reply
  `board hold <id> --kind <trigger> --body-file <f>` puts the human label on the ticket and posts the ask, with the
  trigger as the marker's ref. `board holds` lists every held ticket with its last ask and whether an owner replied
  after it. `board release <id>` takes the label off. A bot's comment is never a reply.

  Background:
    Given the binding sets "board.labels.human" to "needs-human"
    And the binding sets "owners.product" to "po"
    And the binding sets "owners.factory" to the list "fo, fo2"
    And the binding sets "owners.bots" to the list "bot"
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

    Scenario: The ticket gets the human label
      When I run "board hold 1 --kind scope --body-file ask.md"
      Then the exit code is 0
      And the result "id" is "1"
      And the result "labels" is "needs-human"
      And the ticket "1" carries the labels "needs-human"

    Scenario: The ask carries the trigger in its marker and the body without its own heading
      When I run "board hold 1 --kind scope --body-file ask.md"
      Then the comment 0 of the ticket "1" reads:
        """
        ### Needs human: scope

        The question.
        """

    Scenario Outline: A trigger that is empty or spans lines is refused and the ticket is not held
      When the factory holds the ticket "2" with the kind "<kind>" and the body file "ask.md"
      Then the exit code is 2
      And the ticket "2" carries the labels ""

      Examples:
        | kind      |
        | two\nlines |
        |           |

  Rule: holds lists the held tickets with their last ask

    Scenario: A held ticket is listed with its trigger and when it was asked
      Given I run "board hold 1 --kind scope --body-file ask.md"
      And the comment 0 of the ticket "1" was written by "bot" at "2026-01-01T10:00:00Z"
      When I run "board holds"
      Then the result "0.id" is "1"
      And the result "0.kind" is "scope"
      And the result "0.askedAt" is "2026-01-01T10:00:00Z"
      And the result "0.replied" is "false"

  Rule: Only a reply by an owner role after the last ask is a reply

    Background:
      Given I run "board hold 1 --kind scope --body-file ask.md"
      And the comment 0 of the ticket "1" was written by "bot" at "2026-01-01T10:00:00Z"

    Scenario Outline: Who replied, and when
      Given the ticket "1" gets the comment "text" written by "<author>" at "<at>"
      When I run "board holds"
      Then the result "0.replied" is "<replied>"

      Examples:
        | author | at                   | replied | why                      |
        | bot    | 2026-01-01T11:00:00Z | false   | a bot is never a reply   |
        | fo     | 2026-01-01T09:00:00Z | false   | older than the ask       |
        | FO2    | 2026-01-01T12:00:00Z | true    | an owner, any letter case |

    Scenario: The reply names its author
      Given the ticket "1" gets the comment "go ahead" written by "FO2" at "2026-01-01T12:00:00Z"
      When I run "board holds"
      Then the result "0.reply.author" is "FO2"

    Scenario: A reply does not release the ticket
      Given the ticket "1" gets the comment "go ahead" written by "FO2" at "2026-01-01T12:00:00Z"
      When I run "board holds"
      Then the ticket "1" carries the labels "needs-human"

  Rule: release takes the label off

    Scenario: A released ticket has no label
      Given I run "board hold 1 --kind scope --body-file ask.md"
      When I run "board release 1"
      Then the exit code is 0
      And the result "labels" is ""

    Scenario: A released ticket is no longer listed
      Given I run "board hold 1 --kind scope --body-file ask.md"
      And I run "board release 1"
      When I run "board holds"
      Then the output says "[]"
