# Source: src/board/local.ts and src/board/index.ts; references/architecture.md "Board port"
@board:local
Feature: The local board
  A project with no tracker keeps its tickets in .agents/board.json and drives them through `agentic-sdlc board`.
  Every verb prints the ticket (or the list) as JSON.

  Rule: Tickets are created, listed and found

    Scenario: A new ticket gets the next number
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
      When I run "board create --title Other --status Ready --body-file .body-0.md"
      Then the result "id" is "2"
      And the result "status" is "Ready"

    Scenario: A ticket is made a child of another ticket
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
        | Other     | Ready   |
      When I run "board child 1 2"
      And I run "board get 1"
      Then the result "children" is "2"

    Scenario: A ticket created with --parent is listed under that parent
      Given the board has these tickets:
        | title     | status  | parent |
        | Fix login | Backlog |        |
        | Other     | Ready   | 1      |
      When I run "board get 1"
      Then the result "children" is "2"

    Scenario: A list is narrowed by status
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
        | Other     | Ready   |
      When I run "board list --status Ready"
      Then the "title" of the result entries are "Other"

    Scenario: A search finds every word in the title or the body, in any case
      Given the board has these tickets:
        | title     | status  | body       |
        | Fix login | Backlog | the button |
        | Other     | Ready   |            |
      When I run "board list --search 'LOGIN button'"
      Then the "title" of the result entries are "Fix login"

  Rule: A ticket changes through its verbs

    Scenario: A move to a status goes through when the ticket is in the only-from status
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
      When I run "board move 1 Ready --only-from Backlog"
      Then the result "status" is "Ready"

    Scenario: A move is refused when the ticket is not in the only-from status
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
      When I run "board move 1 Ready --only-from Ready"
      Then the exit code is 1
      And the output says "Backlog"
      And I run "board get 1"
      And the result "status" is "Backlog"

    Scenario: A field is set and cleared
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
      When I run "board set 1 size M"
      Then the result "fields.size" is "M"
      When I run "board set 1 size --clear"
      Then the result has no "fields.size"

    Scenario: A label is added and removed
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
      When I run "board label 1 add bug"
      Then the result "labels" is "bug"
      When I run "board label 1 remove bug"
      Then the result "labels" is ""

    Scenario Outline: Closing a ticket moves it to the status of its reason
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
      When I run "board close 1 --reason <reason>"
      Then the result "status" is "<status>"

      Examples:
        | reason      | status    |
        | completed   | Done      |
        | not_planned | Cancelled |

    Scenario: A milestone is set on a ticket
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |
      When I run "board milestone 1 M1"
      Then the result "milestone" is "M1"

    Scenario: A milestone is cleared from a ticket
      Given the board has these tickets:
        | title     | status  | milestone |
        | Fix login | Backlog | M1        |
      When I run "board milestone 1 --clear"
      Then the result has no "milestone"

    Scenario: A milestone cannot be set on a ticket that does not exist
      When I run "board milestone 9 M1"
      Then the exit code is 1
      And the output says "no item 9"

  Rule: Only the statuses of the binding exist

    Scenario: A ticket is not created in a status the binding does not list
      Given the board lists the statuses "Backlog, Ready, Done, Cancelled"
      And a file "b.md" with "body"
      When I run "board create --title t --status Nope --body-file b.md"
      Then the exit code is 1
      And the output says "status 'Nope' is not in board.statuses"

    Scenario: A ticket is not moved to a status the binding does not list
      Given the board lists the statuses "Backlog, Ready, Done, Cancelled"
      And the board has these tickets:
        | title | status  |
        | t     | Backlog |
      When I run "board move 1 Nope"
      Then the exit code is 1
      And the output says "not in board.statuses"
      When I run "board get 1"
      Then the result "status" is "Backlog"

    Scenario: A ticket is moved to a status the binding lists
      Given the board lists the statuses "Backlog, Ready, Done, Cancelled"
      And the board has these tickets:
        | title | status  |
        | t     | Backlog |
      When I run "board move 1 Ready"
      Then the result "status" is "Ready"

  Rule: Comments come newest first and narrow by marker, author and count

    Scenario: The newest comment comes first
      Given the board has these tickets:
        | title | status  |
        | t     | Backlog |
      And the comments on ticket "1" are:
        | author | body   |
        | local  | first  |
        | local  | second |
      When I run "board comments 1"
      Then the "body" of the result entries are "second, first"

    Scenario: A marker keeps the comments whose first line holds it
      Given the board has these tickets:
        | title | status  |
        | t     | Backlog |
      And the comments on ticket "1" are:
        | author | body                  |
        | local  | <!-- heartbeat --> ok |
        | local  | plain                 |
      When I run "board comments 1 --marker heartbeat"
      Then the "body" of the result entries are "<!-- heartbeat --> ok"

    Scenario: An author filter keeps that author's comments, in any case
      Given the board has these tickets:
        | title | status  |
        | t     | Backlog |
      And the comments on ticket "1" are:
        | author   | body |
        | local    | mine |
        | stranger | not  |
      When I run "board comments 1 --author nobody --author LOCAL"
      Then the "body" of the result entries are "mine"

    Scenario: --last counts after the marker and author filters
      Given the board has these tickets:
        | title | status  |
        | t     | Backlog |
      And the comments on ticket "1" are:
        | author   | body                       |
        | local    | <!-- heartbeat --> trusted |
        | stranger | <!-- heartbeat --> forged  |
      When I run "board comments 1 --marker heartbeat --last 1 --author LOCAL"
      Then the "body" of the result entries are "<!-- heartbeat --> trusted"

    Scenario: --trusted keeps the comments of the binding's bots and owners
      Given the binding sets "owners.bots" to the list "bot"
      And the binding sets "owners.product" to "PO"
      And the binding sets "owners.factory" to "fo"
      And the board has these tickets:
        | title | status  |
        | t     | Backlog |
      And the comments on ticket "1" are:
        | author   | body        |
        | Bot      | by bot      |
        | po       | by po       |
        | stranger | by stranger |
      When I run "board comments 1 --trusted"
      Then the "body" of the result entries are "by po, by bot"

  Rule: Many repos share one board through a scope label

    Background:
      Given the board has these tickets:
        | title      | status  | labels       |
        | A work     | Backlog | repo:a       |
        | New signal | Signals | signal:alert |
        | B work     | Backlog | repo:b       |

    Scenario: Without a scope every ticket is listed
      When I run "board list"
      Then the "title" of the result entries are "A work, New signal, B work"

    Scenario: A repo lists only the tickets with its own label
      Given the board is scoped to the label "repo:a"
      When I run "board list"
      Then the "title" of the result entries are "A work"

    Scenario: The home repo also lists the tickets that have no repo label
      Given the board is scoped to the label "repo:b" as the home of "repo:a, repo:b"
      When I run "board list"
      Then the "title" of the result entries are "New signal, B work"

    Scenario: A ticket created in a repo carries the repo's label
      Given the board is scoped to the label "repo:a"
      And a file "b.md" with "body"
      When I run "board create --title Mine --status Backlog --body-file b.md"
      Then the result "labels" is "repo:a"

  Rule: A wrong command line is a usage error

    Scenario: An unknown flag is refused
      When I run "board list --bogus"
      Then the exit code is 2
      And the output says "unknown flag --bogus for board list"

    Scenario: A flag without a value is refused
      When I run "board list --label"
      Then the exit code is 2
      And the output says "--label needs a value"

    Scenario: A body file that cannot be read is refused
      When I run "board create --title t --status Backlog --body-file missing.md"
      Then the exit code is 2
      And the output matches "--body-file cannot be read: .*missing\.md"

    Scenario: A flag takes its value after an equals sign
      Given a file "b.md" with "body"
      When I run "board create --title=t --status=Backlog --body-file=b.md --milestone=M1"
      Then the exit code is 0
      And the result "milestone" is "M1"

    Scenario: A flag that the verb does not know is refused after a known one
      When I run "board set 1 size --clear --oops"
      Then the exit code is 2

    Scenario: A milestone name and --clear together are refused
      When I run "board milestone 1 M3 --clear"
      Then the exit code is 2
      And the output says "a name and --clear together"

    Scenario Outline: --last needs a whole number
      When I run "board comments 1 --last '<value>'"
      Then the exit code is 2
      And the output says "--last needs a whole number, got '<value>'"

      Examples:
        | value |
        | abc   |
        | 1.5   |
        | -1    |
        |       |

    Scenario: --last takes its value after an equals sign
      Given the board has these tickets:
        | title | status  |
        | t     | Backlog |
      When I run "board comments 1 --last=1"
      Then the exit code is 0
