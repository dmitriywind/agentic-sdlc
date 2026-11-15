# Source: src/binding.ts "bindingWarnings"
@binding
Feature: Setups that fail at run time are warned about
  A warning does not fail validation. It names a setting that would only show its fault in the first cycle.

  Rule: A learning bench that can never pass is named

    Scenario: A bench size below the minimum cases warns
      Given a complete binding
      And the binding value "learning.bench_size" is '10'
      When the binding is validated
      Then the warnings mention "bench_size 10 is below bench_min_cases 20"

    Scenario: A bench size equal to the minimum cases does not warn
      Given a complete binding
      And the binding value "learning" is '{"bench_size":5,"bench_min_cases":5}'
      When the binding is validated
      Then there are no warnings

  Rule: A local trace path is accepted whatever its slash

    Scenario Outline: A Windows trace path with either slash is accepted
      Given a complete binding
      And the binding value "traces.uri" is '<uri>'
      When the binding is validated
      Then there are no warnings

      Examples:
        | uri                         |
        | C:\\traces\\{run_id}.jsonl  |
        | C:/traces/{run_id}.jsonl    |

    Scenario: A trace location that is not a local path warns on an individual profile
      Given a complete binding
      And the binding value "traces.uri" is '"s3://b/{run_id}"'
      When the binding is validated
      Then there is exactly one warning

  Rule: A GitHub board is checked against what GitHub accepts

    Background:
      Given a complete binding
      And the binding value "board.adapter" is '"github"'
      And the binding value "board.options" is '{"owner":"o","project_number":1,"repo":"o/r"}'

    Scenario: A heartbeat ticket that is not an issue number warns
      Given the binding value "heartbeat.ticket" is '"HEARTBEAT-1"'
      When the binding is validated
      Then the warnings mention "heartbeat.ticket 'HEARTBEAT-1' is not an issue number"

    Scenario: An environment label that names no environment warns
      Given the binding value "board.env_labels" is '["env:staging","env:qa"]'
      When the binding is validated
      Then the warnings mention "env_labels 'env:qa' names no product.environments entry"
      And the warnings do not mention "env:staging"
