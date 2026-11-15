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

    Scenario: A ticket created with --parent is listed under that parent
      Given the board has these tickets:
        | title     | status  | parent |
        | Fix login | Backlog |        |
        | Other     | Ready   | 1      |
      When I run "board get 1"
      Then the result "children" is "2"

    Scenario: A list is narrowed by status, and a search finds every word in the title or the body, in any case
      Given the board has these tickets:
        | title     | status  | body       |
        | Fix login | Backlog | the button |
        | Other     | Ready   |            |
      When I run "board list --status Ready"
      Then the "title" of the result entries are "Other"
      When I run "board list --search 'LOGIN button'"
      Then the "title" of the result entries are "Fix login"

  Rule: A ticket changes through its verbs

    Background:
      Given the board has these tickets:
        | title     | status  |
        | Fix login | Backlog |

    Scenario Outline: A move goes through only from the only-from status
      When I run "board move 1 Ready --only-from <from>"
      Then the exit code is <code>

      Examples:
        | from    | code |
        | Backlog | 0    |
        | Ready   | 1    |

    Scenario: A field is set and cleared, a label is added and removed
      When I run "board set 1 size M"
      Then the result "fields.size" is "M"
      When I run "board set 1 size --clear"
      Then the result has no "fields.size"
      When I run "board label 1 add bug"
      Then the result "labels" is "bug"
      When I run "board label 1 remove bug"
      Then the result "labels" is ""

    Scenario Outline: Closing a ticket moves it to the status of its reason
      When I run "board close 1 --reason <reason>"
      Then the result "status" is "<status>"

      Examples:
        | reason      | status    |
        | completed   | Done      |
        | not_planned | Cancelled |

    Scenario: A milestone is set and cleared, and cannot be set on a ticket that does not exist
      When I run "board milestone 1 M1"
      Then the result "milestone" is "M1"
      When I run "board milestone 1 --clear"
      Then the result has no "milestone"
      When I run "board milestone 9 M1"
      Then the exit code is 1
      And the output says "no item 9"

  Rule: Only the statuses of the binding exist

    Scenario Outline: A ticket is created or moved only to a status the binding lists
      Given the board lists the statuses "Backlog, Ready, Done, Cancelled"
      And a file "b.md" with "body"
      And the board has these tickets:
        | title | status  |
        | t     | Backlog |
      When I run "<command>"
      Then the exit code is <code>

      Examples:
        | command                                           | code |
        | board move 1 Ready                                | 0    |
        | board move 1 Nope                                 | 1    |
        | board create --title t --status Nope --body-file b.md | 1    |

  Rule: Comments come newest first and narrow by marker, author and count

    Background:
      Given the board has these tickets:
        | title | status  |
        | t     | Backlog |

    Scenario Outline: Comments are filtered
      Given the comments on ticket "1" are:
        | author   | body                       |
        | local    | <!-- heartbeat --> trusted |
        | stranger | <!-- heartbeat --> forged  |
        | local    | plain                      |
      When I run "board comments 1 <flags>"
      Then the "body" of the result entries are "<bodies>"

      Examples:
        | flags                                           | bodies                                       |
        |                                                 | plain, <!-- heartbeat --> forged, <!-- heartbeat --> trusted |
        | --marker heartbeat --last 1 --author LOCAL      | <!-- heartbeat --> trusted                   |

    Scenario: --trusted keeps the comments of the binding's bots and owners
      Given the binding sets "owners.bots" to the list "bot"
      And the binding sets "owners.product" to "PO"
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

    Scenario: A repo lists only the tickets with its own label, and a ticket created there carries it
      Given the board is scoped to the label "repo:a"
      And a file "b.md" with "body"
      When I run "board list"
      Then the "title" of the result entries are "A work"
      When I run "board create --title Mine --status Backlog --body-file b.md"
      Then the result "labels" is "repo:a"

    Scenario: The home repo also lists the tickets that have no repo label
      Given the board is scoped to the label "repo:b" as the home of "repo:a, repo:b"
      When I run "board list"
      Then the "title" of the result entries are "New signal, B work"

  Rule: A wrong command line is a usage error

    Scenario Outline: A bad command line is refused
      When I run "<command>"
      Then the exit code is 2
      And the output says "<message>"

      Examples:
        | command                                               | message                               |
        | board list --bogus                                    | unknown flag --bogus for board list   |
        | board list --label                                    | --label needs a value                 |
        | board milestone 1 M3 --clear                          | a name and --clear together           |
        | board comments 1 --last 1.5                           | --last needs a whole number, got '1.5' |
        | board create --title t --status Backlog --body-file missing.md | --body-file cannot be read |

    Scenario: A flag takes its value after an equals sign
      Given a file "b.md" with "body"
      When I run "board create --title=t --status=Backlog --body-file=b.md --milestone=M1"
      Then the exit code is 0
      And the result "milestone" is "M1"
