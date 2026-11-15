# Source: src/dispatch.ts "cli" (executors), "managedRequest"; references/architecture.md "Executors"
@cli:dispatch
Feature: Each executor kind starts a run
  A stage is a harness, a command, a webhook, a managed agent or an assignment. A webhook or managed stage posts one
  request and prints the run reference; a bad stage stops the dispatch before anything runs.

  Background:
    Given the installed skill pack

  Rule: Each kind starts a run

    Scenario: An assign stage assigns the ticket to the bot
      Given the local board holds a ticket at Ready as ticket 1 and the heartbeat ticket 2
      And the executor "default" is '{"kind":"assign","user":"bot"}'
      When dispatch runs "build --ticket 1"
      Then the exit code is 0
      And the result "kind" is "assign"

  Rule: A bad stage stops the dispatch with exit 1
