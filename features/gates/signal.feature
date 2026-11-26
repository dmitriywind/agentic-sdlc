# Source: src/gates.ts "signal"
@gate:signal
Feature: Gate signal
  One verb files a Signal for any source: an alert, a silent factory, a red trunk. A Signal with the same source and title that is still open
  gets the new body as a comment, so a repeating alert is one ticket, not a flood.

  Scenario: A new Signal is created at Signals with its source label and a redacted body
    When the signal gate runs for the source "alert" with the title "Disk full" and the body "host db1 token abcdefghijklmnopqrstuvwxyz0123456789"
    Then the gate result "created" is "true"
    And one Signal is opened with the labels "signal:alert"
    And the Signal body does not mention "abcdefghijklmnopqrstuvwxyz0123456789"

  Scenario: The same source and title, case and spacing aside, comments on the open Signal
    Given these tickets are on the board:
      | id | status  | labels       | title     |
      | 5  | Signals | signal:alert | Disk full |
    When the signal gate runs for the source "alert" with the title "disk  FULL" and the body "again at 10:05"
    Then the gate result "created" is "false"
    And the gate result "id" is "5"
    And no Signal is opened
    And the Signal "5" is commented with "again at 10:05"
