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

    Scenario: A red trunk run opens a Signal labelled signal:ci with no secret of its URL
      When the signal-on-red gate runs for the run "987"
      Then the gate result "created" is "true"
      And one Signal is opened with the labels "signal:ci"
      And the Signal body shows none of "SECRET|u:p@"

    Scenario: The same red run opens no second Signal
      When the signal-on-red gate runs for the run "987"
      And the signal-on-red gate runs for the run "987"
      Then the gate result "created" is "false"
      And one Signal is opened with the labels "signal:ci"

    Scenario: A red run on a release line opens a Signal whose title is plain and short
      Given the run "2x" on "release/2026.1" failed and is named "build <script>`$x`" followed by 200 letters
      When the signal-on-red gate runs for the run "2x"
      Then the gate result "created" is "true"
      And the Signal title is plain and at most 100 characters

  Rule: Anything else opens no Signal

    Scenario: A red run on another ref is ignored
      When the signal-on-red gate runs for the run "1"
      Then the gate result "created" is "false"
      And the gate result "reason" mentions "not trunk"
      And no Signal is opened

    Scenario Outline: A run that did not fail opens no Signal
      When the signal-on-red gate runs for the run "<run>"
      Then the gate result "created" is "false"
      And no Signal is opened

      Examples:
        | run |
        | 2   |
        | 3   |

    Scenario: A run that succeeded says it did not fail
      When the signal-on-red gate runs for the run "2"
      Then the gate result "reason" mentions "did not fail"

    Scenario: Without a release prefix only the trunk counts
      Given the binding has no "vcs.release_prefix"
      When the signal-on-red gate runs for the run "4"
      Then the gate result "created" is "false"
      And no Signal is opened

    Scenario: A run id that does not exist fails the gate
      When the signal-on-red gate runs for the run "nope"
      Then the gate fails with "no run nope"
      And no Signal is opened
