# Source: src/board/local.ts and src/board/index.ts; references/architecture.md section 3.1
@board:local
Feature: The local board
  A project with no tracker keeps its tickets in .agents/board.json and drives them through `agentic-sdlc board`.
  Every verb prints the ticket (or the list) as JSON.

  Rule: Tickets are created, listed and found

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

    Scenario: A field is set and cleared, a label is added and removed, and the approval label is refused
      When I run "board set 1 size M"
      Then the result "fields.size" is "M"
      When I run "board set 1 size --clear"
      Then the result has no "fields.size"
      When I run "board label 1 add bug"
      Then the result "labels" is "bug"
      When I run "board label 1 remove bug"
      Then the result "labels" is ""
      When I run "board label 1 add approved"
      Then the exit code is 1
      And the output says "forge.approval_label"

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
        | board move 1 Nope                                 | 1    |

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
        | --marker heartbeat --last 1 --author LOCAL      | <!-- heartbeat --> trusted                   |

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
