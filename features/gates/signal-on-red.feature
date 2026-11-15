# Source: src/gates.ts "signalOnRed"
@gate:signal-on-red
Feature: Gate signal-on-red
  A red trunk or release run opens a Signal, so that a red build is never missed. The Signal holds a redacted summary.

  Background:
    Given these runs are on the forge:
      | id | name | ref            | state   | url                                           |
      | 1  | ci   | feature/x      | failure |                                               |
      | 2  | ci   | main           | success |                                               |
      | 3  | ci   | main           | pending |                                               |
      | 4  | ci   | undefined/x    | failure |                                               |
      | 987 | ci  | main           | failure | https://u:p@ci.example/run/987?token=SECRET   |

  Rule: A red run on the trunk or a release line opens one Signal

    Scenario: The same red run opens no second Signal
      When the signal-on-red gate runs for the run "987"
      And the signal-on-red gate runs for the run "987"
      Then the gate result "created" is "false"
      And one Signal is opened with the labels "signal:ci"

  Rule: Anything else opens no Signal
