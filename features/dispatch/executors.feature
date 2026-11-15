# Source: src/dispatch.ts "cli" (executors), "managedRequest"; references/architecture.md "Executors"
@cli:dispatch
Feature: Each executor kind starts a run
  A stage is a harness, a command, a webhook, a managed agent or an assignment. A webhook or managed stage posts one
  request and prints the run reference; a bad stage stops the dispatch before anything runs.

  Background:
    Given the installed skill pack

  Rule: Each kind starts a run

    Scenario: A webhook stage posts one request and prints the run reference
      Given the executor "default" is '{"kind":"webhook","url_env":"U","token_env":"T"}'
      And the runner sets "U" to "https://h/x"
      And the runner sets "T" to "tok"
      And the executor endpoint answers every request with the run id "r1"
      When dispatch runs "build --ticket 1"
      Then the exit code is 0
      And the result "kind" is "webhook"
      And the result "ref" is "r1"
      And the first call starts with "POST https://h/x"

    Scenario: A managed stage posts its vendor's start-a-run request and prints the kind
      Given the executor "default" is '{"kind":"managed","agent_env":"A","token_env":"T","endpoint_env":"E"}'
      And the runner sets "A" to "ag"
      And the runner sets "T" to "t"
      And the runner sets "E" to "https://api/"
      When dispatch runs "build --ticket 1"
      Then the result "kind" is "managed"
      And the first call starts with "POST https://api/sessions"

    Scenario: An assign stage assigns the ticket to the bot
      Given the local board holds a ticket at Ready as ticket 1 and the heartbeat ticket 2
      And the executor "default" is '{"kind":"assign","user":"bot"}'
      When dispatch runs "build --ticket 1"
      Then the exit code is 0
      And the result "kind" is "assign"

  Rule: A bad stage stops the dispatch with exit 1

    Scenario Outline: A kind the CLI does not know stops it, for the default and for one step
      Given the executor "<entry>" is '{"kind":"bogus"}'
      When dispatch runs "build --ticket 1"
      Then the exit code is 1

      Examples:
        | entry   |
        | default |
        | build   |

    Scenario: An environment variable the stage needs is unset
      Given the executor "default" is '{"kind":"webhook","url_env":"U","token_env":"T"}'
      And the runner sets "U" to "https://h/x"
      When dispatch runs "build --ticket 1"
      Then the exit code is 1
      And the output says "set the T environment variable"

    Scenario: The board refuses an assignment
      Given the executor "default" is '{"kind":"assign","user":"bot"}'
      When dispatch runs "build --ticket 1"
      Then the exit code is 1
