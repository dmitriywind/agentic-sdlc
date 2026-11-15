# Source: src/dispatch.ts "managedRequest" and the webhook and managed bodies
@cli:dispatch
Feature: A webhook or managed request carries the stage and no secret
  A webhook or managed stage posts the model, the mcp names and urls and the sandbox. Each managed vendor gets its own
  start-a-run call, and a vendor whose agent runs its own model refuses a pinned one.

  Background:
    Given the installed skill pack

  Rule: The body holds the stage and never a secret

    Scenario Outline: The body holds the model, the mcps and the sandbox, and no secret value
      Given the models are fast "f", balanced "b" and deep "d"
      And the binding has "mcps" set to the JSON '{"docs":{"url":"https://docs/mcp","token_env":"DOCS_TOKEN"},"db":{"command":"db-mcp"}}'
      And the executor "default" is '<stage>'
      And the runner sets "U" to "https://h/x"
      And the runner sets "T" to "tok"
      And the runner sets "A" to "ag"
      And the runner sets "E" to "https://api"
      And the runner sets "NPM_TOKEN" to "npm-secret"
      And the runner sets "DOCS_TOKEN" to "docs-secret"
      When dispatch runs "build --ticket 1"
      Then the exit code is 0
      And the request body holds "model" as the JSON '"f"'
      And the request body holds "sandbox" as the JSON '"cloud"'
      And the request body holds "mcps" as the JSON '[{"name":"docs","url":"https://docs/mcp"},{"name":"db"}]'
      And no call includes "npm-secret"
      And no call includes "docs-secret"

      Examples:
        | stage                                                                                                                                                      |
        | {"kind":"managed","agent_env":"A","token_env":"T","endpoint_env":"E","mcps":["docs","db"],"secrets":["NPM_TOKEN"],"sandbox":"cloud","model":{"tier":"fast"}} |

  Rule: Each managed vendor gets its own start-a-run call

  Rule: A vendor whose agent runs its own model refuses a pinned one
