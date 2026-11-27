# Source: src/binding.ts "bindingWarnings"
@binding
Feature: Setups that fail at run time are warned about
  A warning does not fail validation. It names a setting that would only show its fault in the first cycle.

  Rule: A GitHub board is checked against what GitHub accepts

    Background:
      Given a complete binding
      And the binding value "board.adapter" is '"github-issues"'
      And the binding value "board.options" is '{"repo":"o/r"}'

    Scenario: An environment label that names no environment warns
      Given the binding value "board.env_labels" is '["env:staging","env:qa"]'
      When the binding is validated
      Then the warnings mention "env_labels 'env:qa' names no product.environments entry"
      And the warnings do not mention "env:staging"

  Rule: A human approval needs an approver outside the bots

    Scenario: One account that is both product owner and bot can never approve a Full-lane CR
      Given a complete binding
      And the binding value "owners" is '{"product":"me","factory":"me","bots":["me"]}'
      When the binding is validated
      Then the warnings mention "every owners.product account is also in owners.bots"

    Scenario: A product owner outside the bots raises no such warning
      Given a complete binding
      When the binding is validated
      Then the warnings do not mention "every owners.product account is also in owners.bots"
