# Source: src/dispatch.ts "cli" (the start record), "judgeTier", "resolveStage"
@cli:dispatch
Feature: Every dispatch prints its key and its done line
  The start record names the run's key and the done line the run puts in its closing comment. Both are printed
  whether or not a dedupe window is set. A stage resolves its model, tier, mcps, secrets and sandbox, and learn/judge
  runs on a model other than the one it judges.

  Background:
    Given the installed skill pack

  Rule: The key and the done line are always printed

  Rule: A stage resolves its agent definition

  Rule: learn/judge never grades its own model

    Scenario: The judge tier wins over the model of the stage
      Given the models are fast "f", balanced "b" and deep "d"
      And the judge tier is "balanced"
      And the executor "default" is '{"kind":"command","run":"bot","model":{"id":"pinned"}}'
      When dispatch runs "learn/judge --ticket 1 --run-model other"
      Then the result "model" is "b"
