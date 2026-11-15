# Source: src/dispatch.ts "cli" (the command executor), src/bench.ts "quote"
@cli:dispatch
Feature: A command stage starts a detached bot
  The stage's run template is filled with quoted values and run through the platform shell, detached, with its output
  in a run log. The bot gets a minimal environment plus the secrets the stage lists, never a secret on disk.

  Background:
    Given the installed skill pack

  Rule: The bot gets only what the stage lists

    Background:
      Given the models are fast "f", balanced "b" and deep "d"
      And the binding has "mcps" set to the JSON '{"docs":{"url":"https://docs/mcp","token_env":"DOCS_TOKEN"},"db":{"command":"db-mcp"}}'
      And the executor "default" is '{"kind":"command","run":"bot {model} {mcps_file}","mcps":["docs"],"secrets":["NPM_TOKEN"],"model":{"tier":"deep"}}'
      And the runner sets "PATH" to "/bin"
      And the runner sets "HOME" to "/h"
      And the runner sets "DOCS_TOKEN" to "docs-secret"
      And the runner sets "OTHER" to "build"

    Scenario: A listed secret that is unset stops the dispatch
      When dispatch runs "build --ticket 1"
      Then the exit code is 1
      And the output says "set the NPM_TOKEN environment variable"
