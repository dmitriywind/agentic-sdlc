# Source: src/ledger.ts "measures", "changeFailures"; references/architecture.md "6. The self-improvement loop", item 8
@cli:ledger
Feature: The delivery measures and the error budget
  `ledger measures` reads the DORA measures from the board and the forge: deploy frequency, lead time, change failure
  rate, time to restore and rework rate. A measure the data cannot give is null with a reason. With product.slo set it
  also says whether the error budget is spent.

  Rule: The measures come from the shipped tickets, the failures and the review reports

    Background:
      Given the environments "staging, production"
      And the bug label is "bug"
      And the binding sets "owners.bots" to the list "bot"
      And the change failure rate may be at most "0.5" over 30 days
      And these tickets, with times in hours before 2026-11-14:
        | id | status  | labels        | fields                                       | created | changed |
        | 1  | Done    |               | shipped=On production; release_version=1.0   | 58      | 10      |
        | 2  | Done    |               | shipped=On production; release_version=1.0   | 110     | 10      |
        | 3  | Done    | bug           | priority=P0; shipped=On production           | 30      | 20      |
        | 4  | Signals | signal:deploy |                                              | 5       | 5       |
        | 5  | Ready   |               |                                              | 500     | 10      |
      And the merged CRs:
        | cr | closes |
        | 10 | 1      |
        | 11 | 2      |
      And "Bot" reported REMEDIATION REQUIRED on CR "10"
      And "rando" reported REMEDIATION REQUIRED on CR "11"

    Scenario: Deploy frequency counts the changes and the versions shipped
      When I measure the last 7 days
      Then the JSON result has these values:
        | path                    | value |
        | deployFrequency.changes  | 3     |
        | deployFrequency.versions | 1     |
        | deployFrequency.value    | 3     |

  Rule: The error budget needs a maximum in product.slo

    Background:
      Given the environments "staging, production"
      And the bug label is "bug"
      And the change failure rate may be at most "0.5" over 30 days

    Scenario: Failures and nothing shipped have no rate, and the budget is exhausted
      Given these tickets, with times in hours before 2026-11-14:
        | id | status  | labels        | fields | created | changed |
        | 9  | Signals | signal:deploy |        | 24      | 0       |
      When I measure the last 30 days
      Then the JSON result has these values:
        | path                   | value |
        | errorBudget.actual     | null  |
        | errorBudget.exhausted  | true  |
      And the output matches 'no change shipped'
