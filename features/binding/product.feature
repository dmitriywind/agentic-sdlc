# Source: src/binding.ts "validateBinding" (product), "shippedOptions" and "bindingWarnings" (evidence)
@binding
Feature: The product keys of the binding
  `product` says how the product is delivered, what it promises and what a release must prove.

  Rule: The Shipped options come from the environments

  Rule: The delivery mode decides which release keys are required

  Rule: The error budget needs a rate and a window

  Rule: Release evidence is known kinds, proved by a command

    Scenario: Evidence with a check command does not warn
      Given a complete binding
      And the binding value "product.evidence" is '["sbom","provenance"]'
      And the binding value "commands.evidence_check" is '"verify {sha}"'
      When the binding is validated
      Then the warnings do not mention "evidence"
