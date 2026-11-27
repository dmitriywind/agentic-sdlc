# Source: src/board/github-issues.ts; src/binding.ts "validateBinding" (field_ids); references/architecture.md "Board port"
@board:github-issues
Feature: The github-issues board
  The board keeps Status and fields as labels on the repo's issues ("status:Ready", "size:S").
  The adapter speaks `gh api` under `repos/<owner>/<repo>/` only: never GraphQL, `gh issue` or `gh project`.

  Rule: A ticket is an issue with a status label

    Scenario: Status and fields are read from the labels, and pull requests and issues with no status label are left out
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                                         | pull request |
        | 1      | status:Backlog                                 |              |
        | 2      | status:Ready, size:S, release version:1.2, bug |              |
        | 3      |                                                |              |
        | 4      | status:Ready                                   | yes          |
      When the factory lists the tickets in the status "Ready"
      Then the listed ticket ids are "2"
      And the listed ticket "2" has the status "Ready"
      And the listed ticket "2" has the fields "size=S, release_version=1.2"
      And the listed ticket "2" has the labels "bug"
      And every call is a gh api call under the repo, never GraphQL, gh issue or gh project

  Rule: The list is the open tickets, without their bodies

    Scenario: A closed ticket is listed only when asked for, and no ticket carries its body
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels      | state  |
        | 1      | status:Ready |        |
        | 2      | status:Done  | closed |
      When the factory lists the tickets in the status "Done"
      Then the listed ticket ids are ""
      When the factory lists every ticket, closed ones too
      Then the listed ticket ids are "1, 2"
      And the listed tickets carry no body

  Rule: An open issue with a signal label and no status is a Signal

    Scenario: An unboarded signal is listed at Signals, and a closed one is not
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                  | state  |
        | 1      | signal:alert            |        |
        | 2      | signal:alert            | closed |
        | 3      | bug                     |        |
      When the factory lists the tickets in the status "Signals"
      Then the listed ticket ids are "1"
      When the factory gets the ticket "1"
      Then the returned ticket has the status "Signals"

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

    Scenario: A field is set through its label, and a ticket closed as not planned is Cancelled
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels                        |
        | 7      | status:In review, size:M, bug |
      When the factory sets the field "size" of the ticket "7" to "L"
      Then the returned ticket has the fields "size=L"
      When the factory closes the ticket "7" as "not_planned"
      Then the returned ticket has the status "Cancelled"
      And the issue 7 is closed with the reason "not_planned"

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

    Scenario Outline: A failing gh is retried or not
      Given the github-issues board adapter
      And the repo has these issues:
        | number | labels       |
        | 7      | status:Ready |
      And gh fails 1 times with "<error>" before it answers
      When the factory <call>
      Then <then>

      Examples:
        | error                                                  | call                          | then                                       |
        | gh: HTTP 502: Bad Gateway                              | gets the ticket "7"           | the returned ticket has the status "Ready" |
        | gh: HTTP 403: You have exceeded a secondary rate limit | assigns the ticket "7" to "x" | the one patch sets the assignees to "x"    |

  Rule: With field_ids, the status and the mapped fields are org issue fields; an unmapped field stays a label

    Background:
      Given the github-issues board adapter
      And the board maps the issue fields "status=10:single_select, size=11:single_select, release_version=12:text"

    Scenario: Status and fields are read from the issue field values, and an issue with no status value is left out
      Given the repo has these issues:
        | number | labels | issue fields                                    |
        | 1      |        | status=Ready, size=S, release_version=1.2       |
        | 2      | bug    |                                                 |
        | 3      | lane:fast | status=Backlog                               |
      When the factory lists the tickets in the status "Ready"
      Then the listed ticket ids are "1"
      And the listed ticket "1" has the fields "size=S, release_version=1.2"
      When the factory gets the ticket "3"
      Then the returned ticket has the status "Backlog"
      And the returned ticket has the fields "lane=fast"

    Scenario: A move writes the status field, sends the API version header and leaves the labels alone
      Given the repo has these issues:
        | number | labels | issue fields   |
        | 7      | bug    | status=Backlog |
      When the factory moves the ticket "7" to "In progress" only from "Backlog"
      Then the returned ticket has the status "In progress"
      And the issue 7 has the issue field "status" set to "In progress"
      And the issue 7 has the labels "bug"
      And every issue field call sends the API version header "2026-03-10"

    Scenario: A move from another status than the one required is refused and writes nothing
      Given the repo has these issues:
        | number | labels | issue fields |
        | 7      |        | status=Ready |
      When the factory moves the ticket "7" to "In progress" only from "Backlog"
      Then the verb fails matching "7 is at Ready, not Backlog"
      And the issue 7 has the issue field "status" set to "Ready"

    Scenario: A field is written, a text field by its value, and cleared
      Given the repo has these issues:
        | number | labels | issue fields               |
        | 7      |        | status=Ready, size=M       |
      When the factory sets the field "size" of the ticket "7" to "L"
      Then the returned ticket has the fields "size=L"
      When the factory sets the field "release_version" of the ticket "7" to "2.0"
      Then the issue 7 has the issue field "release_version" set to "2.0"
      When the factory clears the field "size" of the ticket "7"
      Then the issue 7 has no value for the issue field "size"

    Scenario: A field the map leaves out is still a label
      Given the repo has these issues:
        | number | labels | issue fields |
        | 7      |        | status=Ready |
      When the factory sets the field "lane" of the ticket "7" to "fast"
      Then the issue 7 has the labels "lane:fast"

    Scenario: Create makes the issue without a status label, then writes the status field
      Given the repo has these issues:
        | number | labels | issue fields   |
        | 1      |        | status=Backlog |
      And the repo has the milestone "M1" as number 3
      When the factory creates a ticket at "Ready" with the labels "bug", the milestone "M1" and the parent "1"
      Then the returned ticket has the status "Ready"
      And the issue 101 has the labels "bug"
      And the issue 101 has the issue field "status" set to "Ready"

    Scenario: Closing as not planned moves the status field and closes the issue
      Given the repo has these issues:
        | number | labels | issue fields    |
        | 7      |        | status=In review |
      When the factory closes the ticket "7" as "not_planned"
      Then the returned ticket has the status "Cancelled"
      And the issue 7 is closed with the reason "not_planned"
