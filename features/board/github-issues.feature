# Source: src/board/github-issues.ts; references/architecture.md "Board port"
@board:github-issues
Feature: The github-issues board
  A project with no GitHub Project keeps Status and fields as labels on the repo's issues ("status:Ready", "size:S").
  The adapter speaks `gh api` under `repos/<owner>/<repo>/` only: never GraphQL, `gh issue` or `gh project`.

  Rule: A ticket is an issue with a status label

    Scenario: Status and fields are read from the labels
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                                         |
        | 1      | status:Backlog                                 |
        | 2      | status:Ready, size:S, release version:1.2, bug |
      When the factory lists the tickets in the status "Ready"
      Then the listed ticket ids are "2"
      And the listed ticket "2" has the status "Ready"
      And the listed ticket "2" has the fields "size=S, release_version=1.2"
      And the listed ticket "2" has the labels "bug"
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

    Scenario: A list is read in pages of 100
      Given the github-issues board adapter
      And the repo has the issues 1 to 150 labelled "status:Backlog"
      When the factory lists the tickets
      Then the board lists 150 tickets
      And the list is read in pages of 100 up to page 2

    Scenario: Pull requests and issues with no status label are left out of the list
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels         | pull request |
        | 10     | status:Ready   |              |
        | 200    |                |              |
        | 201    | status:Ready   | yes          |
      When the factory lists the tickets
      Then the listed ticket ids are "10"

    Scenario: A get refuses an issue with no status label
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 2      |              |
      When the factory gets the ticket "2"
      Then the verb fails matching "not on the board"

    Scenario: A get refuses a pull request
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       | pull request |
        | 3      | status:Ready | yes          |
      When the factory gets the ticket "3"
      Then the verb fails matching "not on the board"

    Scenario Outline: A ticket at Done reached Done when its issue closed
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels   | state   | closed at   |
        | 1      | <labels> | <state> | <closed at> |
      When the factory lists the tickets
      Then the listed ticket "1" reached its status at "<reached>"

      Examples:
        | labels           | state  | closed at            | reached              |
        | status:Done      | closed | 2026-02-01T10:00:00Z | 2026-02-01T10:00:00Z |
        | status:Done      | open   |                      |                      |
        | status:Cancelled | closed | 2026-02-02T10:00:00Z |                      |
        | status:Ready     | open   |                      |                      |

    Scenario: An issue with no status label is not listed
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 9      |              |
        | 10     | status:Ready |
      When the factory lists the tickets
      Then the listed ticket ids are "10"

    Scenario: The comments of an issue with no status label are read by marker
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels |
        | 9      |        |
      And the issue 9 has the comment "<!-- heartbeat -->"
      When the factory reads the comments of the ticket "9" with the marker "<!-- heartbeat -->"
      Then the board returns 1 comments

    Scenario: A comment can be written on an issue with no status label
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels |
        | 9      |        |
      When the factory comments "hb" on the ticket "9"
      Then the returned comment id is "5"
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

  Rule: A move swaps the status label

    Scenario: A move is refused when the status differs from --only-from
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                |
        | 7      | status:Backlog, size:M |
      When the factory moves the ticket "7" to "In progress" only from "Ready"
      Then the move is refused because the ticket has moved
      And no call writes to the issues

    Scenario: A move from the right status replaces the status label and keeps the others
      Given the github-issues board adapter
      And the repo has the labels "status:Backlog, size:M"
      And the repo has these issues:
        | number | labels                |
        | 7      | status:Backlog, size:M |
      When the factory moves the ticket "7" to "In progress" only from "Backlog"
      Then the returned ticket has the status "In progress"
      And the issue 7 has the labels "size:M, status:In progress"
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

  Rule: Create, set, label and close edit labels and the issue state

    Scenario: Create makes the labels the repo lacks, then the issue
      Given the github-issues board adapter
      And the repo has the labels "bug"
      And the repo has these issues:
        | number | labels       |
        | 1      | status:Backlog |
      And the repo has the milestone "M1" as number 3
      When the factory creates a ticket at "Ready" with the labels "bug, feature", the milestone "M1" and the parent "1"
      Then the repo has the labels exactly "bug, feature, status:Ready"
      And the returned ticket has the status "Ready"

    Scenario: Create resolves the milestone by its title
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels         |
        | 1      | status:Backlog |
      And the repo has the milestone "M1" as number 3
      When the factory creates a ticket at "Ready" with the labels "bug", the milestone "M1" and the parent "1"
      Then the new issue is opened with the milestone number 3

    Scenario: Create links the new issue under its parent
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels         |
        | 1      | status:Backlog |
      And the repo has the milestone "M1" as number 3
      When the factory creates a ticket at "Ready" with the labels "bug", the milestone "M1" and the parent "1"
      Then the new issue is linked as a sub issue of the issue 1
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

    Scenario: A field is set and cleared through its label
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                       |
        | 7      | status:In review, size:M, bug |
      When the factory sets the field "size" of the ticket "7" to "L"
      Then the returned ticket has the fields "size=L"

    Scenario: A field is cleared by removing its label
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                       |
        | 7      | status:In review, size:M, bug |
      When the factory clears the field "size" of the ticket "7"
      Then the returned ticket has the fields ""

    Scenario: A label is removed
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                       |
        | 7      | status:In review, size:M, bug |
      When the factory removes the label "bug" from the ticket "7"
      Then the returned ticket has the labels ""

    Scenario: A ticket closed as not planned is Cancelled
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                       |
        | 7      | status:In review |
      When the factory closes the ticket "7" as "not_planned"
      Then the returned ticket has the status "Cancelled"
      And the issue 7 is closed with the reason "not_planned"
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

  Rule: Comments are paged and newest first

    Scenario: Every page of comments is read, the newest first
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And the issue 7 has 120 comments saying "hi"
      When the factory reads the comments of the ticket "7"
      Then the board returns 120 comments
      And the first comment is "119"
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

    Scenario: Comments are narrowed to those carrying a marker
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And the issue 7 has 120 comments saying "hi"
      And the comment 110 of the issue 7 says "hb\nx"
      When the factory reads the comments of the ticket "7" with the marker "hb"
      Then the comment ids are "110"

  Rule: An assignee is replaced, never added

    Scenario: A new assignee replaces the old one in one patch
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       | assignee |
        | 7      | status:Ready | old      |
      When the factory assigns the ticket "7" to "new"
      Then the one patch sets the assignees to "new"

  Rule: The milestone is set by title and cleared with null

    Scenario: A milestone is set by its title and the status is kept
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And the repo has the milestone "M1" as number 3
      When the factory sets the milestone of the ticket "7" to "M1"
      Then the returned ticket has the status "Ready"
      And the last patch sets the milestone to 3

    Scenario: A milestone is cleared
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      When the factory clears the milestone of the ticket "7"
      Then the last patch clears the milestone
      And the repo holds 1 issues

    Scenario: A milestone the repo does not have is refused
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And the repo has the milestone "M1" as number 3
      When the factory sets the milestone of the ticket "7" to "nope"
      Then the verb fails matching "no milestone 'nope'"

  Rule: A write is retried on a rate limit but not on a server error; a read is retried on both

    Scenario: A read is retried on a server error
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And gh fails 2 times with "gh: HTTP 502: Bad Gateway" before it answers
      When the factory gets the ticket "7"
      Then the returned ticket has the status "Ready"

    Scenario: A write is retried on a rate limit
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And gh fails 1 times with "gh: HTTP 403: You have exceeded a secondary rate limit" before it answers
      When the factory assigns the ticket "7" to "x"
      Then the one patch sets the assignees to "x"

    Scenario: A write is not retried on a server error
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And gh fails 1 times with "gh: HTTP 502: Bad Gateway" before it answers
      When the factory assigns the ticket "7" to "x"
      Then the verb fails matching "502"
