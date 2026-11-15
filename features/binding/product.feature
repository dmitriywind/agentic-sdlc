# Source: src/binding.ts "validateBinding" (product), "shippedOptions" and "bindingWarnings" (evidence)
@binding
Feature: The product keys of the binding
  `product` says how the product is delivered, what it promises and what a release must prove.

  Rule: The Shipped options come from the environments

    Scenario: Staging and production give four options
      Then the shipped options for the environments "staging, production" are "Not shipped, On staging, In release, On production"

  Rule: The delivery mode decides which release keys are required

    Scenario: Continuous delivery needs no release prefix
      Given a complete binding
      And the binding value "product.environments" is '["production"]'
      And the binding value "product.delivery" is '"continuous"'
      And the binding has no value "vcs.release_prefix"
      When the binding is validated
      Then validation finds no problems

    Scenario: A release line needs two or more environments
      Given a complete binding
      And the binding value "product.environments" is '["production"]'
      And the binding value "product.delivery" is '"release-line"'
      When the binding is validated
      Then the problems mention "release-line needs two or more environments"

    Scenario: An unknown delivery mode is named
      Given a complete binding
      And the binding value "product.delivery" is '"weekly"'
      When the binding is validated
      Then the problems mention "product.delivery 'weekly'"

  Rule: The error budget needs a rate and a window

    Scenario: A rate from 0 to 1 and a positive whole window are valid
      Given a complete binding
      And the binding value "product.slo" is '{"change_failure_rate_max":0.15,"window_days":30}'
      When the binding is validated
      Then validation finds no problems

    Scenario: A rate above 1 is a problem
      Given a complete binding
      And the binding value "product.slo" is '{"change_failure_rate_max":1.5,"window_days":30}'
      When the binding is validated
      Then the problems mention "change_failure_rate_max must be a number from 0 to 1"

    Scenario: A window of 0 days is a problem
      Given a complete binding
      And the binding value "product.slo" is '{"change_failure_rate_max":0.15,"window_days":0}'
      When the binding is validated
      Then the problems mention "window_days must be a positive whole number"

  Rule: Release evidence is known kinds, proved by a command

    Scenario: An unknown evidence kind is a problem
      Given a complete binding
      And the binding value "product.evidence" is '["sbom","vibes"]'
      When the binding is validated
      Then the problems mention "product.evidence has unknown kinds: vibes"

    Scenario: Evidence without a check command warns
      Given a complete binding
      And the binding value "product.evidence" is '["sbom","provenance"]'
      When the binding is validated
      Then validation finds no problems
      And the warnings mention "commands.evidence_check is unset"

    Scenario: Evidence with a check command does not warn
      Given a complete binding
      And the binding value "product.evidence" is '["sbom","provenance"]'
      And the binding value "commands.evidence_check" is '"verify {sha}"'
      When the binding is validated
      Then the warnings do not mention "evidence"
