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
