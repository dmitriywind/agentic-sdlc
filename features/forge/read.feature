# Source: src/forge/github.ts "view", "viewBySha", "diff", "list", "approvals", "run"; src/ports.ts "parseCloses"; references/architecture.md section 3.2
@cli:forge
Feature: The github forge reads a CR from the REST API
  The forge port gives a CR as one value: its checks, its draft state, how far behind the trunk it is, the ticket it
  closes. The github adapter builds it from the pull, the check runs and the commit statuses of its head, and takes
  only numbers and hex shas as ids, so nothing else reaches `gh api`.

  Background:
    Given the github forge for the repo "o/r"

  Rule: A CR is built from the pull, the check runs and the commit statuses of its head

    Scenario: The newest check run of a name counts, and the commit statuses are checks too
      Given the repo has the open pull request 5 at the head "h"
      And the head "h" has the check runs:
        | id | name | status      | conclusion |
        | 3  | ci   | completed   | success    |
        | 2  | e2e  | in_progress |            |
        | 1  | ci   | completed   | failure    |
      And the head "h" has the commit statuses:
        | context | state |
        | review  | error |
      When the forge runs view on "5"
      Then the forge reads "checks" as "ci=success, e2e=pending, review=failure"

  Rule: A commit resolves to the pull it merged, else the one it heads, else the first

  Rule: An id that is not a number or a hex sha never reaches gh

  Rule: Only the exact lines "Closes <id>" close a ticket

  Rule: A list is bounded, and carries check data only when asked

    Scenario: Merged CRs are the closed pulls that were merged
      Given the repo has these pull requests:
        | number | state  |
        | 5      | merged |
        | 6      | closed |
      When the forge lists the CRs with "state=merged"
      Then the listed CRs are "5"
      And a call includes "repos/o/r/pulls?state=closed&per_page=100"

    Scenario: A since date keeps the CRs merged since
      Given the repo has these pull requests:
        | number | state  | merged               | updated              |
        | 9      | merged | 2026-11-10T00:00:00Z | 2026-11-10T00:00:00Z |
        | 8      | merged | 2026-11-05T00:00:00Z | 2026-11-05T00:00:00Z |
        | 7      | merged | 2026-10-01T00:00:00Z | 2026-10-01T00:00:00Z |
      When the forge lists the CRs with "state=merged since=2026-11-01"
      Then the listed CRs are "9, 8"
      And no call includes "check-runs"

    Scenario: With checks each CR is read as view reads it
      Given the repo has these pull requests:
        | number | state  | head |
        | 5      | merged | h    |
      And the head "h" has the check runs:
        | id | name | status    | conclusion |
        | 1  | ci   | completed | success    |
        | 2  | e2e  | completed | failure    |
      When the forge lists the CRs with "state=merged checks"
      Then the forge reads "0.checks" as "ci=success, e2e=failure"

  Rule: Approvals are the reviews of the CR as user, state and sha

    Scenario: The reviews of a CR
      Given the CR 5 has these reviews:
        | user | state             | sha |
        | ann  | approved          | h1  |
        | bob  | changes_requested | h0  |
      When the forge runs approvals on "5"
      Then the approvals are "ann:approved:h1, bob:changes_requested:h0"
      And a call includes "repos/o/r/pulls/5/reviews"

  Rule: One CI run is read by id

    Background:
      Given the CI runs are:
        | id | name | branch | sha | status    | conclusion | url | at |
        | 42 | ci   | main   | s   | completed | failure    | u   | t  |

    Scenario: The runs of a branch that failed
      When the forge lists the failed CI runs of the branch "main"
      Then a call includes "run list --limit 30"
      And a call includes "--branch main --status failure"
