# Source: src/binding.ts "loadBinding", "validateBinding" and "bindingWarnings"
@binding
Feature: A binding is validated before anything runs
  `agentic-sdlc validate` loads .agents/binding.yml and lists every broken rule as a problem. A binding with
  no problem is safe to run; a setting that would only show its fault in the first cycle is a warning, which does
  not fail validation.

  Background:
    Given a complete binding
    And the binding value "board.adapter" is '"github-issues"'
    And the binding value "board.fields" is '{"size":"Size"}'
    And the binding value "board.options" is '{"repo":"o/r","field_ids":{"status":10,"size":11}}'

  Rule: Each broken rule is reported on its own

    Scenario: A GitHub Issues board with its field ids is valid
      When the binding is validated
      Then validation finds no problems

    Scenario Outline: A broken key is named in a problem
      Given the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key                 | value                                        | problem                                                              |
        | board.adapter       | "x"                                          | board.adapter 'x'                                                    |
        | board.options       | {"repository":"o/r"}                         | board.options.repo is required                                       |
        | board.options       | {"repo":"o/r","field_ids":{"stage":10}}      | board.options.field_ids.stage is not 'status' or a key of board.fields |
        | executors.x         | {"kind":"command"}                           | executors.x.run is required                                          |
        | product.slo         | {"change_failure_rate_max":1.5,"window_days":30} | change_failure_rate_max must be a number from 0 to 1             |

  Rule: A setup that fails at run time is warned about

    Scenario: An environment label that names no environment warns
      Given the binding value "board.env_labels" is '["env:staging","env:qa"]'
      When the binding is validated
      Then the warnings mention "env_labels 'env:qa' names no product.environments entry"
      And the warnings do not mention "env:staging"

