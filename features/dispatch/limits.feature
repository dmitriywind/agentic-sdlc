# Source: src/dispatch.ts "limitsOf", "limitsText"; src/binding.ts "validateBinding"; skills/sdlc/references/executors.md
@cli:dispatch
Feature: A stage's caps reach its executor
  A stage may cap its turns, tokens and minutes. A stage that sets no cap inherits the default's, and every executor
  kind is handed the caps its own way.

  Background:
    Given the installed skill pack

  Rule: Each executor kind is handed the caps

    Scenario: A command gets the caps in its template, in its environment and in the start record
      Given the executor "default" is '{"kind":"harness","max_turns":80,"max_minutes":20}'
      And the executor "ship" is '{"kind":"command","run":"bot --max-turns {max_turns} --tokens {max_tokens}","max_tokens":5000,"max_turns":30}'
      When dispatch runs "ship --ticket 5"
      Then the command line is the template "bot --max-turns {} --tokens {}" filled with the quoted words "30|5000"
      And the child environment holds "AGENTIC_SDLC_MAX_TURNS" as "30"
      And the child environment holds "AGENTIC_SDLC_MAX_TOKENS" as "5000"
      And the child environment holds "AGENTIC_SDLC_MAX_MINUTES" as "20"
      And the result "limits.max_turns" is "30"
      And the result "limits.max_tokens" is "5000"
      And the result "limits.max_minutes" is "20"
