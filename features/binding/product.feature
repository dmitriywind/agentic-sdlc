# Source: src/binding.ts "validateBinding" (product), "shippedOptions" and "bindingWarnings" (evidence)
@binding
Feature: The product keys of the binding
  `product` says how the product is delivered, what it promises and what a release must prove.

  Rule: Release evidence is known kinds, proved by a command

    Scenario: Evidence with a check command does not warn
      Given a complete binding
      And the binding value "product.evidence" is '["sbom","provenance"]'
      And the binding value "commands.evidence_check" is '"verify {sha}"'
      When the binding is validated
      Then the warnings do not mention "evidence"

  Rule: The service level objective is a rate and a window

    Scenario Outline: A bad objective is a problem
      Given a complete binding
      And the binding value "product.slo" is '<slo>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | slo                                             | problem                                              |
        | {"change_failure_rate_max":1.5,"window_days":30} | change_failure_rate_max must be a number from 0 to 1 |
        | {"change_failure_rate_max":0.1,"window_days":0}  | window_days must be a positive whole number          |
        | {"change_failure_rate_max":0.1,"window_days":1.5} | window_days must be a positive whole number         |

