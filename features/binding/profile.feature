# Source: src/binding.ts "validateBinding" (identities) and "bindingWarnings" (profile)
@binding
Feature: Each profile has the identities and executors it needs
  The profile says how the factory is run: `individual` (one identity, the harness), `individual-api`
  (one identity, managed executors) or `organization` (a separate review identity, a sandbox, traces).
  A profile mismatch warns; an identity mismatch fails.

  Rule: A profile mismatch warns and does not fail

    Background:
      Given a complete binding

    Scenario: An individual binding with a managed executor warns to use individual-api
      Given the binding value "executors.triage" is '{"kind":"managed","token_env":"T","endpoint_env":"E"}'
      When the binding is validated
      Then validation finds no problems
      And the warnings mention "executors.triage"

    Scenario: A complete organization binding has no warning
      Given the binding value "profile" is '"organization"'
      And the binding value "executors.default.sandbox" is '"container"'
      And the binding value "traces.uri" is '"x/{run_id}"'
      And the binding value "executors.impl" is '{"kind":"managed","token_env":"K","endpoint_env":"E"}'
      When the binding is validated
      Then there are no warnings

  Rule: The identities follow the profile

    Background:
      Given a complete binding
