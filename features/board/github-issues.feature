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

    Scenario: Pull requests and issues with no status label are left out of the list
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels         | pull request |
        | 10     | status:Ready   |              |
        | 200    |                |              |
        | 201    | status:Ready   | yes          |
      When the factory lists the tickets
      Then the listed ticket ids are "10"

    Scenario: A comment can be written on an issue with no status label
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels |
        | 9      |        |
      When the factory comments "hb" on the ticket "9"
      Then the returned comment id is "5"
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

  Rule: A move swaps the status label

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

    Scenario: A field is set and cleared through its label
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                       |
        | 7      | status:In review, size:M, bug |
      When the factory sets the field "size" of the ticket "7" to "L"
      Then the returned ticket has the fields "size=L"

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
