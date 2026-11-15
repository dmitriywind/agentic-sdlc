# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:signal-on-red
Feature: Gate signal-on-red
  As the factory
  I want a red trunk or release run to open a Signal
  So that a red build is never missed

  # Source: src/gates.ts, "signalOnRed"
  # Proof: test/gates.test.ts "signal-on-red: redacted summary, deduplicated, string ids"
  Scenario: A red trunk run opens one Signal with redacted evidence
    Given a failed run on the trunk has a URL with a user, a password and a token
    When "gate signal-on-red --run <id>" runs
    Then a Signal opens with the label "signal:ci"
    And the body holds no secret from the URL

  # Source: src/gates.ts, "signalOnRed" (dedupe)
  # Proof: test/gates.test.ts "signal-on-red: redacted summary, deduplicated, string ids"
  Scenario: The same red run opens no second Signal
    Given a Signal with the same title exists
    When the gate runs for the same run
    Then it creates no Signal

  # Source: src/gates.ts, "signalOnRed" (other refs)
  # Proof: test/gates.test.ts "signal-on-red: only trunk or release refs; strict title"
  Scenario: A red run on another ref is ignored
    Given a failed run is on the ref "feature/x"
    When the gate runs
    Then it creates no Signal
    And the output says the ref is not the trunk or a release line

  # Source: src/gates.ts, "signalOnRed" (unknown run)
  # Proof: test/gates.test.ts "signal-on-red: a run id that does not exist fails the gate"
  Scenario: A run id that does not exist fails the gate
    Given the forge has no run with the id
    When the gate runs
    Then it creates no Signal
    And the gate exits with a failure

  # Source: src/gates.ts, "signalOnRed" (state)
  # Proof: test/gates.test.ts "signal-on-red: a run that did not fail opens no Signal; an unset release_prefix matches no ref or branch"
  Scenario: A run that did not fail opens no Signal
    Given the run on the trunk succeeded or is pending
    When the gate runs
    Then it creates no Signal
    And the output says the run did not fail

  # Source: src/gates.ts, "signalOnRed" (release_prefix)
  # Proof: test/gates.test.ts "signal-on-red: a run that did not fail opens no Signal; an unset release_prefix matches no ref or branch"
  Scenario: Without a release prefix only the trunk counts
    Given vcs.release_prefix is unset
    When a failed run is on the ref "undefined/x"
    Then it creates no Signal
