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

    Scenario: Executors with all their keys are valid
      Given a complete binding
      And the binding value "executors" is '{"default":{"kind":"harness"},"a":{"kind":"command","run":"x"},"c":{"kind":"webhook","url_env":"U"},"d":{"kind":"managed","api":"cursor","token_env":"T","repo_url":"https://github.com/o/r"},"e":{"kind":"assign","user":"u"}}'
      When the binding is validated
      Then validation finds no problems

  Rule: A stage may narrow its MCP servers, secrets, sandbox and model

    Background:
      Given a complete binding
      And the binding value "mcps" is '{"docs":{"url":"https://d"}}'

    Scenario: A well-formed stage, trace and computer-use proof are valid
      Given the binding value "traces.uri" is '"s3://b/{run_id}.jsonl"'
      And the binding value "product.proofs" is '["computer-use"]'
      And the binding value "executors.review" is '{"kind":"harness","mcps":["docs"],"secrets":["NPM_TOKEN"],"sandbox":"cloud","model":{"tier":"deep"}}'
      And the binding value "executors.shape" is '{"kind":"harness","model":{"id":"x"}}'
      When the binding is validated
      Then validation finds no problems

    Scenario Outline: A bad stage field is named
      Given the binding value "executors.review" is '<stage>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | stage                                                | problem                      |
        | {"kind":"harness","sandbox":"vm"}                    | sandbox 'vm'                 |
