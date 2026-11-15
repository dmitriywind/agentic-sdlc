# Source: src/dispatch.ts "cli" (the start record), "judgeTier", "resolveStage"
@cli:dispatch
Feature: Every dispatch prints its key and its done line
  The start record names the run's key and the done line the run puts in its closing comment. Both are printed
  whether or not a dedupe window is set. A stage resolves its model, tier, mcps, secrets and sandbox, and learn/judge
  runs on a model other than the one it judges.

  Background:
    Given the installed skill pack

  Rule: The key and the done line are always printed

    Scenario: With no dedupe window the record still carries the key and the done line, and the board is not touched
      When dispatch runs "plan/shape --ticket 9"
      Then the result "key" is "9-plan/shape"
      And the result "done" is "<!-- agentic-sdlc:done 9-plan/shape -->"
      And the instruction matches "<!-- agentic-sdlc:done 9-plan/shape -->"
      And no call reaches the board

  Rule: A stage resolves its agent definition

    Scenario: A harness stage prints the resolved model, tier, mcps, secrets and sandbox
      Given the models are fast "f", balanced "b" and deep "d"
      And the binding has "mcps" set to the JSON '{"docs":{"url":"https://docs/mcp","token_env":"DOCS_TOKEN"},"db":{"command":"db-mcp"}}'
      And the executor "default" is '{"kind":"harness","mcps":["db"],"secrets":["S"],"sandbox":"container","model":{"id":"m1"}}'
      When dispatch runs "build --ticket 1"
      Then the result "kind" is "harness"
      And the result "ref" is "null"
      And the result "key" is "1-build"
      And the result "model" is "m1"
      And the result "tier" is "deep"
      And the result "mcps.db.command" is "db-mcp"
      And the result "secrets" is "S"
      And the result "sandbox" is "container"

    Scenario: A model id wins over a model tier
      Given the models are fast "f", balanced "b" and deep "d"
      And the executor "default" is '{"kind":"command","run":"bot","model":{"id":"pinned"}}'
      When dispatch runs "build --ticket 1"
      Then the result "model" is "pinned"

    Scenario: A model tier of the stage wins over the tier of the step
      Given the models are fast "f", balanced "b" and deep "d"
      And the executor "default" is '{"kind":"command","run":"bot","model":{"tier":"fast"}}'
      When dispatch runs "build --ticket 1"
      Then the result "model" is "f"

  Rule: learn/judge never grades its own model

    Scenario Outline: The judge tier is stepped off the model of the judged run
      When the judge tier is chosen for the judge tier "<tier>" with the models "<models>", for a run on the model "<run>"
      Then the judge runs at the tier "<judge>" on the model "<model>"

      Examples:
        | tier     | models  | run   | judge    | model |
        | balanced | f, b, d | b     | deep     | d     |
        | deep     | f, b, d | d     | balanced | b     |
        | fast     | x, x, d | x     | deep     | d     |

    Scenario Outline: With no independent model the judge is skipped
      When the judge tier is chosen for the judge tier "<tier>" with the models "<models>", for a run on the model "<run>"
      Then the judge is skipped

      Examples:
        | tier     | models  | run   |
        | balanced | f, b, d |       |
        | fast     | x, x, x | x     |

    Scenario: A judge dispatch with one model everywhere prints a skip and starts nothing
      Given the models are fast "build", balanced "build" and deep "build"
      And the judge tier is "fast"
      When dispatch runs "learn/judge --ticket 1 --run-model build"
      Then the exit code is 0
      And the result "skip" is "true"

    Scenario: The judge tier wins over the model of the stage
      Given the models are fast "f", balanced "b" and deep "d"
      And the judge tier is "balanced"
      And the executor "default" is '{"kind":"command","run":"bot","model":{"id":"pinned"}}'
      When dispatch runs "learn/judge --ticket 1 --run-model other"
      Then the result "model" is "b"
