# Source: src/binding.ts "validateBinding" and "bindingWarnings" (executors, mcps, traces)
@binding
Feature: Executors, MCP servers and traces are checked
  An executor names who runs a step. Each kind needs its own keys, and a stage can narrow its tools, secrets,
  sandbox and model. A mistake here fails a cycle at run time, so validate names it first.

  Rule: Each executor kind needs its keys

    Scenario Outline: A kind with a missing key is a problem
      Given a complete binding
      And the binding value "executors.x" is '<executor>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | executor                                 | problem                      |
        | {"kind":"managed","api":"openai"}        | executors.x.api 'openai'     |
        | {"kind":"managed","api":"cursor"}        | executors.x.token_env is required |

  Rule: A stage may narrow its MCP servers, secrets, sandbox and model

    Background:
      Given a complete binding
      And the binding value "mcps" is '{"docs":{"url":"https://d"}}'

    Scenario Outline: A bad stage field is named
      Given the binding value "executors.review" is '<stage>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | stage                                                | problem                      |
        | {"kind":"harness","sandbox":"vm"}                    | sandbox 'vm'                 |
