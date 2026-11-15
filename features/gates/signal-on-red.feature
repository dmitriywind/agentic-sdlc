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

  Rule: A run that is not red on the trunk or a release line opens no Signal

    Scenario Outline: A run that is green, pending or on another ref is left alone
      When the signal-on-red gate runs for the run "<run>"
      Then the gate result "created" is "false"
      And the gate result "reason" mentions "<reason>"
      And no Signal is opened

      Examples:
        | run | reason                        |
        | 1   | is not trunk or a release line |
        | 2   | did not fail                  |
        | 3   | did not fail                  |
        | 4   | is not trunk or a release line |

  Rule: A red run on the trunk or a release line opens one Signal

    Scenario: The Signal holds the run without the credentials of its URL
      When the signal-on-red gate runs for the run "987"
      Then the gate result "created" is "true"
      And one Signal is opened with the labels "signal:ci"
      And the Signal body mentions "ci.example/run/987"
      And the Signal body does not mention "SECRET"
      And the Signal body does not mention "u:p"


    Scenario: The same red run opens no second Signal
      When the signal-on-red gate runs for the run "987"
      And the signal-on-red gate runs for the run "987"
      Then the gate result "created" is "false"
      And one Signal is opened with the labels "signal:ci"
