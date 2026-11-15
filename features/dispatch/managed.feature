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
        | {"kind":"webhook","url_env":"U","token_env":"T","mcps":["docs","db"],"secrets":["NPM_TOKEN"],"sandbox":"cloud","model":{"tier":"fast"}}                   |
        | {"kind":"managed","agent_env":"A","token_env":"T","endpoint_env":"E","mcps":["docs","db"],"secrets":["NPM_TOKEN"],"sandbox":"cloud","model":{"tier":"fast"}} |

  Rule: Each managed vendor gets its own start-a-run call

    Scenario: Claude Managed Agents
      When a managed request is built for the step "build" from the executor '{"kind":"managed","api":"claude","token_env":"TOK","agent_env":"AG","environment_env":"ENV"}'
      Then the managed request goes to "https://api.anthropic.com/v1/sessions"
      And the managed request header "anthropic-beta" is "managed-agents-2026-04-01"
      And the managed request body holds "environment_id" as the JSON '"env_1"'

    Scenario: Cursor Cloud Agents take the repository and the model
      Given the model "m1" is chosen for the managed request
      When a managed request is built for the step "build" from the executor '{"kind":"managed","api":"cursor","token_env":"TOK","repo_url":"https://github.com/o/r"}'
      Then the managed request goes to "https://api.cursor.com/v1/agents"
      And the managed request body holds "repos.0.url" as the JSON '"https://github.com/o/r"'
      And the managed request body holds "model" as the JSON '"m1"'

    Scenario: Antigravity runs through the Gemini interactions API
      When a managed request is built for the step "build" from the executor '{"kind":"managed","api":"antigravity","token_env":"TOK"}'
      Then the managed request goes to a URL matching "/v1beta/interactions$"
      And the managed request header "x-goog-api-key" is "t"

    Scenario: A claude stage needs its agent variable
      When a managed request is built for the step "build" from the executor '{"kind":"managed","api":"claude","token_env":"TOK"}'
      Then building the managed request fails matching "agent_env"

  Rule: A vendor whose agent runs its own model refuses a pinned one

    Scenario Outline: Claude and Antigravity cannot pin a model for the judge or in the stage
      Given the model "m" is chosen for the managed request
      When a managed request is built for the step "<step>" from the executor '<executor>'
      Then building the managed request fails matching "managed api <api> cannot pin a model"

      Examples:
        | api         | step        | executor                                                                                                    |
        | claude      | learn/judge | {"kind":"managed","api":"claude","token_env":"TOK","agent_env":"AG","environment_env":"ENV"}                |
        | antigravity | learn/judge | {"kind":"managed","api":"antigravity","token_env":"TOK","agent_env":"AG","environment_env":"ENV"}          |
        | claude      | build       | {"kind":"managed","api":"claude","token_env":"TOK","agent_env":"AG","environment_env":"ENV","model":{"id":"m"}}       |
        | antigravity | build       | {"kind":"managed","api":"antigravity","token_env":"TOK","agent_env":"AG","environment_env":"ENV","model":{"id":"m"}} |

    Scenario: Cursor takes the judge's model
      Given the model "m" is chosen for the managed request
      When a managed request is built for the step "learn/judge" from the executor '{"kind":"managed","api":"cursor","token_env":"TOK","repo_url":"u"}'
      Then the managed request is built
