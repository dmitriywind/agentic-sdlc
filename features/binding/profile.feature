# Source: src/binding.ts "validateBinding" (identities) and "bindingWarnings" (profile)
@binding
Feature: Each profile has the identities and executors it needs
  The profile says how the factory is run: `individual` (one identity, the harness) or `organization` (a
  separate review identity, a sandbox, traces).
  A profile mismatch warns; an identity mismatch fails.

  Rule: A profile mismatch warns and does not fail

    Background:
      Given a complete binding

