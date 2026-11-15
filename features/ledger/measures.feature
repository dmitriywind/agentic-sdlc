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

    Scenario: Lead time is the median hours from creation to Done
      When I measure the last 7 days
      Then the JSON result "leadTimeHours.value" is "48"

    Scenario: A P0 bug and a failed deploy are change failures
      When I measure the last 7 days
      Then the JSON result "changeFailureRate" holds:
        """
        { "value": 0.67, "failures": 2, "changes": 3 }
        """

    Scenario: Time to restore is the hours from the failure to its fix
      When I measure the last 7 days
      Then the JSON result "timeToRestoreHours.value" is "10"

    Scenario: Only a review report by a bot counts toward the rework rate
      When I measure the last 7 days
      Then the JSON result "reworkRate" holds:
        """
        { "value": 0.5, "crs": 2, "reworked": 1 }
        """

    Scenario: The error budget is exhausted when the change failure rate is above its maximum
      When I measure the last 7 days
      Then the JSON result "errorBudget" holds:
        """
        { "max": 0.5, "windowDays": 30, "actual": 0.67, "exhausted": true }
        """

  Rule: A measure the data cannot give is null with a reason

    Scenario: With nothing shipped there is no change failure rate and no rework rate
      Given the environments "a"
      When I measure the last 30 days
      Then the JSON result has these values:
        | path                   | value    |
        | changeFailureRate.value | null     |
        | reworkRate.value        | null     |
        | errorBudget             | <absent> |
      And the output matches 'no change shipped'

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

    Scenario: With no failure the budget is not exhausted
      When I measure the last 30 days
      Then the JSON result "errorBudget.exhausted" is "false"
