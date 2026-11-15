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

    Scenario: A pull that is behind the trunk is a CR that is behind
      Given the repo has the open pull request 5
      And the pull request 5 is behind the trunk
      When the forge runs view on "5"
      Then the forge reads "behind" as "true"

    Scenario: The CR closes the tickets its body names
      Given the repo has the open pull request 5
      When the forge runs view on "5"
      Then the forge reads "closes" as "1"

    Scenario: Every page of check runs and commit statuses is read
      Given the repo has the open pull request 5 at the head "h"
      When the forge runs view on "5"
      Then the call including "/check-runs" reads every page
      And the call including "/status?" reads every page

    Scenario: The push time is the first check suite on the head
      Given the repo has the open pull request 7 at the head "h"
      And the first check suite of the head "h" was created at "2026-11-14T10:00:00Z"
      When the forge runs view on "7"
      Then the forge reads "pushedAt" as "2026-11-14T10:00:00Z"
      And a call includes "repos/o/r/commits/h/check-suites"

    Scenario: A head with no check suite has no push time
      Given the repo has the open pull request 7
      When the forge runs view on "7"
      Then the forge reads no "pushedAt"

    Scenario: A CR that is not found fails
      When the forge runs view on "8"
      Then the verb fails matching "404"

  Rule: A commit resolves to the pull it merged, else the one it heads, else the first

    Scenario Outline: The pull for a sha
      Given the commit "abcdef1234" is listed under the pull requests "<listed>"
      When the forge runs viewBySha on "abcdef1234"
      Then the forge reads "n" as "<chosen>"

      Examples:
        | listed                                                    | chosen | why                              |
        | 1 head x; 2 merge abcdef1234; 3 head abcdef1234           | 2      | the pull whose merge commit it is |
        | 1 head x; 3 head abcdef1234                               | 3      | the pull whose head it is         |
        | 1 head x; 4 head y                                        | 1      | the first pull                    |

  Rule: An id that is not a number or a hex sha never reaches gh

    Scenario Outline: A bad id is refused before gh runs
      When the forge runs <verb> on "<id>"
      Then the verb fails matching "<message>"
      And the forge makes no call

      Examples:
        | verb      | id         | message                       |
        | view      | 5/../../x  | not a change request number   |
        | diff      | x          | not a change request number   |
        | comments  | 1;2        | not a change request number   |
        | viewBySha | ../x       | not a commit sha              |
        | status    | xyz        | not a commit sha              |

  Rule: Only the exact lines "Closes <id>" close a ticket

    Scenario Outline: The ids a CR body closes
      Then the ids "<body>" closes are "<ids>"

      Examples:
        | body                  | ids  |
        | Closes \nRefactor\n   | none |
        | Closes #12\nCloses #12 | 12   |
        | Closes 3\nCloses PROJ-4 | 3, PROJ-4 |

  Rule: A list is bounded, and carries check data only when asked

    Scenario: Merged CRs are the closed pulls that were merged
      Given the repo has these pull requests:
        | number | state  |
        | 5      | merged |
        | 6      | closed |
      When the forge lists the CRs with "state=merged"
      Then the listed CRs are "5"
      And a call includes "repos/o/r/pulls?state=closed&per_page=100"

    Scenario: A limit keeps the newest CRs, with their merge sha and no checks
      Given the repo has these pull requests:
        | number | state  | merged               | updated              | merge sha |
        | 9      | merged | 2026-11-10T00:00:00Z | 2026-11-10T00:00:00Z | m9        |
        | 8      | merged | 2026-11-05T00:00:00Z | 2026-11-05T00:00:00Z | m8        |
        | 7      | merged | 2026-10-01T00:00:00Z | 2026-10-01T00:00:00Z | m7        |
      When the forge lists the CRs with "state=merged limit=2"
      Then the listed CRs are "9, 8"
      And the forge reads "0.mergeSha" as "m9"
      And the forge reads "0.state" as "merged"
      And the forge reads "0.checks" as ""
      And a call includes "sort=updated&direction=desc"
      And no call includes "check-runs"

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

    Scenario: A run by id
      When the forge runs run on "42"
      Then the forge reads "id" as "42"
      And the forge reads "name" as "ci"
      And the forge reads "ref" as "main"
      And the forge reads "sha" as "s"
      And the forge reads "state" as "failure"
      And a call includes "run view 42"

    Scenario: A run that does not exist fails
      When the forge runs run on "43"
      Then the verb fails matching "404"

    Scenario: A run id that is not a number is refused
      When the forge runs run on "x; rm"
      Then the verb fails matching "not a run id"

    Scenario: The runs of a branch that failed
      When the forge lists the failed CI runs of the branch "main"
      Then a call includes "run list --limit 30"
      And a call includes "--branch main --status failure"
